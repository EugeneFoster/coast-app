import { SupplierError } from "@/lib/suppliers/errors";
import type { CookieJar } from "@/lib/suppliers/session";
import type { SupplierId } from "@/lib/suppliers/types";

/**
 * Minimal authenticated HTTP client for supplier portals.
 *
 * Redirects are followed manually so that a `Set-Cookie` issued on an
 * intermediate hop (very common in form-login flows) is captured. Response
 * bodies are size-capped so a runaway page cannot exhaust memory, and neither
 * request nor response headers are ever logged.
 */

export const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * A plain desktop browser UA. This is honest identification for an
 * authenticated dealer session — it is not an anti-bot evasion measure, and no
 * CAPTCHA, MFA or bot-detection challenge is ever bypassed. When a portal
 * answers with a challenge the adapter reports AUTH_INTERVENTION_REQUIRED.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface SupplierRequestInit {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** Form-encoded or JSON body. Never logged. */
  body?: string | URLSearchParams;
  jar?: CookieJar;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Set false to inspect a 3xx yourself (login flows sometimes need this). */
  followRedirects?: boolean;
}

export interface SupplierResponse {
  url: string;
  status: number;
  ok: boolean;
  headers: Headers;
  text: string;
  /** Parsed JSON when the response advertised JSON, otherwise null. */
  json: unknown;
}

/**
 * Signals that a portal is protecting the endpoint with a bot/verification
 * challenge. We surface these rather than attempting to solve them.
 */
const CHALLENGE_MARKERS = [
  "captcha",
  "recaptcha",
  "hcaptcha",
  "cf-challenge",
  "cf_chl",
  "are you a robot",
  "verify you are human",
  "unusual traffic",
  "access denied",
];

export function looksLikeBotChallenge(response: SupplierResponse): boolean {
  if (response.status === 403 || response.status === 429 || response.status === 503) {
    return true;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) return false;
  const sample = response.text.slice(0, 4000).toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => sample.includes(marker));
}

function timeoutSignal(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!external) return timeout;
  // `AbortSignal.any` is available on Node 20+; the runtime here is Node 22.
  return AbortSignal.any([timeout, external]);
}

async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Error("supplier response exceeds size cap");
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) {
    throw new Error("supplier response exceeds size cap");
  }
  return new TextDecoder("utf-8").decode(buffer);
}

/**
 * Perform one request against a supplier portal.
 *
 * `url` must be derived from the server-side configured base URL — never from
 * user input. Callers are responsible for that; see `resolveAgainstBase`.
 */
export async function supplierFetch(
  supplier: SupplierId,
  url: string,
  init: SupplierRequestInit = {},
): Promise<SupplierResponse> {
  const {
    method = "GET",
    headers = {},
    body,
    jar,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal,
    followRedirects = true,
  } = init;

  let currentUrl = url;
  let currentMethod = method;
  let currentBody = body;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const requestHeaders: Record<string, string> = {
      "user-agent": USER_AGENT,
      accept: headers.accept ?? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "accept-language": "en-CA,en;q=0.9",
      ...headers,
    };
    if (currentBody && !requestHeaders["content-type"]) {
      requestHeaders["content-type"] = "application/x-www-form-urlencoded";
    }
    const cookieHeader = jar?.headerFor(currentUrl);
    if (cookieHeader) requestHeaders.cookie = cookieHeader;

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: currentMethod,
        headers: requestHeaders,
        body: currentBody ? currentBody.toString() : undefined,
        redirect: "manual",
        signal: timeoutSignal(timeoutMs, signal),
      });
    } catch (caught) {
      const name = caught instanceof Error ? caught.name : "";
      if (name === "AbortError" || name === "TimeoutError") {
        throw new SupplierError(supplier, "SUPPLIER_TIMEOUT", `timeout after ${timeoutMs}ms`, {
          cause: caught,
        });
      }
      throw new SupplierError(supplier, "SUPPLIER_UNAVAILABLE", "network request failed", {
        cause: caught,
      });
    }

    jar?.storeFromResponse(currentUrl, response);

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get("location");
    if (isRedirect && followRedirects && location) {
      if (hop === MAX_REDIRECTS) {
        throw new SupplierError(supplier, "SUPPLIER_UNAVAILABLE", "too many redirects");
      }
      // Drain the body so the socket can be reused.
      await response.arrayBuffer().catch(() => undefined);
      currentUrl = new URL(location, currentUrl).toString();
      // 303 (and 301/302 in practice) downgrade to GET without a body.
      if (response.status !== 307 && response.status !== 308) {
        currentMethod = "GET";
        currentBody = undefined;
      }
      continue;
    }

    let text: string;
    try {
      text = await readCapped(response);
    } catch (caught) {
      throw new SupplierError(supplier, "PARSING_FAILED", "response body unreadable", {
        cause: caught,
      });
    }

    let json: unknown = null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("json") && text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    return {
      url: currentUrl,
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      text,
      json,
    };
  }

  throw new SupplierError(supplier, "SUPPLIER_UNAVAILABLE", "redirect loop");
}

/**
 * Build a portal URL from the server-configured base plus a fixed path.
 *
 * This is the only way adapters should construct URLs. It rejects anything that
 * would escape the configured origin, so a caller-supplied value can never
 * redirect our authenticated session at an arbitrary host.
 */
export function resolveAgainstBase(
  supplier: SupplierId,
  baseUrl: string,
  path: string,
): string {
  const base = new URL(baseUrl);
  const resolved = new URL(path, base);
  if (resolved.origin !== base.origin) {
    throw new SupplierError(
      supplier,
      "CONFIGURATION_ERROR",
      "refused to build a supplier URL outside the configured origin",
    );
  }
  return resolved.toString();
}
