import { SupplierError } from "@/lib/suppliers/errors";
import type { SupplierId } from "@/lib/suppliers/types";

/**
 * Session reuse for supplier portals.
 *
 * Two guarantees matter here:
 *
 * 1. We do not log in on every search. A session is cached until it expires or
 *    a request proves it dead.
 * 2. Concurrent searches never stampede the login endpoint. Ten simultaneous
 *    searches against an expired session produce exactly one login attempt;
 *    the rest await the same in-flight promise (single-flight).
 *
 * The cache is process-local. That is the right fit for this deployment: the
 * app runs as a long-lived Node container on Railway (see `Dockerfile`), so a
 * module-level singleton survives across requests. No external session store is
 * introduced.
 */

interface CookieRecord {
  value: string;
  expiresAt: number | null;
}

/**
 * A deliberately small cookie jar. It keeps name/value pairs per host and
 * nothing else — no logging, no serialization helpers, no way to print itself.
 */
export class CookieJar {
  private readonly byHost = new Map<string, Map<string, CookieRecord>>();

  storeFromResponse(url: string, response: Response) {
    const host = safeHost(url);
    if (!host) return;
    const raw = readSetCookies(response);
    if (raw.length === 0) return;

    const jar = this.byHost.get(host) ?? new Map<string, CookieRecord>();
    for (const line of raw) {
      const parsed = parseSetCookie(line);
      if (!parsed) continue;
      if (parsed.expiresAt !== null && parsed.expiresAt <= Date.now()) {
        jar.delete(parsed.name);
        continue;
      }
      jar.set(parsed.name, { value: parsed.value, expiresAt: parsed.expiresAt });
    }
    this.byHost.set(host, jar);
  }

  /** Returns a `Cookie` header value, or null when nothing applies. */
  headerFor(url: string): string | null {
    const host = safeHost(url);
    if (!host) return null;
    const jar = this.byHost.get(host);
    if (!jar || jar.size === 0) return null;

    const now = Date.now();
    const pairs: string[] = [];
    for (const [name, record] of jar) {
      if (record.expiresAt !== null && record.expiresAt <= now) {
        jar.delete(name);
        continue;
      }
      pairs.push(`${name}=${record.value}`);
    }
    return pairs.length > 0 ? pairs.join("; ") : null;
  }

  get size() {
    let total = 0;
    for (const jar of this.byHost.values()) total += jar.size;
    return total;
  }

  clear() {
    this.byHost.clear();
  }

  /** Never expose cookie material through stringification. */
  toJSON() {
    return "[CookieJar redacted]";
  }

  toString() {
    return "[CookieJar redacted]";
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function readSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function parseSetCookie(line: string): { name: string; value: string; expiresAt: number | null } | null {
  const [pair, ...attributes] = line.split(";");
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name) return null;

  let expiresAt: number | null = null;
  for (const attribute of attributes) {
    const [rawKey, ...rest] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    const attrValue = rest.join("=").trim();
    if (key === "max-age") {
      const seconds = Number(attrValue);
      if (Number.isFinite(seconds)) expiresAt = Date.now() + seconds * 1000;
    } else if (key === "expires" && expiresAt === null) {
      const parsed = Date.parse(attrValue);
      if (!Number.isNaN(parsed)) expiresAt = parsed;
    }
  }
  return { name, value, expiresAt };
}

export interface SupplierSession {
  readonly jar: CookieJar;
  /** Adapter-specific material (CSRF token, account id, …). Never logged. */
  readonly context: Record<string, string>;
  readonly establishedAt: number;
  readonly expiresAt: number;
}

export interface LoginResult {
  jar: CookieJar;
  context?: Record<string, string>;
  /** How long the portal session should be trusted. */
  ttlMs: number;
}

export type LoginFn = (signal?: AbortSignal) => Promise<LoginResult>;

/** Default trust window when a portal does not advertise a session lifetime. */
export const DEFAULT_SESSION_TTL_MS = 20 * 60 * 1000;

export class SupplierSessionManager {
  private readonly supplier: SupplierId;
  private session: SupplierSession | null = null;
  private inFlight: Promise<SupplierSession> | null = null;

  constructor(supplier: SupplierId) {
    this.supplier = supplier;
  }

  private isFresh(session: SupplierSession | null): session is SupplierSession {
    return session !== null && session.expiresAt > Date.now();
  }

  /**
   * Returns a live session, logging in only when necessary. Concurrent callers
   * share a single login attempt.
   */
  async acquire(login: LoginFn, signal?: AbortSignal): Promise<SupplierSession> {
    if (this.isFresh(this.session)) return this.session;

    // Single-flight: the first caller starts the login, everyone else waits on
    // the same promise instead of opening their own.
    if (this.inFlight) return this.inFlight;

    const attempt = (async () => {
      const result = await login(signal);
      const now = Date.now();
      const session: SupplierSession = {
        jar: result.jar,
        context: result.context ?? {},
        establishedAt: now,
        expiresAt: now + Math.max(result.ttlMs, 30_000),
      };
      this.session = session;
      return session;
    })();

    this.inFlight = attempt;
    try {
      return await attempt;
    } finally {
      // Clear regardless of outcome so a failed login does not wedge the
      // manager into permanently returning a rejected promise.
      if (this.inFlight === attempt) this.inFlight = null;
    }
  }

  /** Drop the cached session so the next `acquire` logs in again. */
  invalidate() {
    this.session?.jar.clear();
    this.session = null;
  }

  hasFreshSession() {
    return this.isFresh(this.session);
  }

  close() {
    this.invalidate();
    this.inFlight = null;
  }

  /**
   * Run `operation` against a live session. If it reports the session died,
   * re-authenticate once and retry. A second expiry is surfaced to the caller
   * rather than looping.
   */
  async run<T>(
    login: LoginFn,
    operation: (session: SupplierSession) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const session = await this.acquire(login, signal);
    try {
      return await operation(session);
    } catch (caught) {
      const expired =
        caught instanceof SupplierError && caught.code === "SESSION_EXPIRED";
      if (!expired) throw caught;

      this.invalidate();
      const refreshed = await this.acquire(login, signal);
      try {
        return await operation(refreshed);
      } catch (retryFailure) {
        if (
          retryFailure instanceof SupplierError &&
          retryFailure.code === "SESSION_EXPIRED"
        ) {
          throw new SupplierError(
            this.supplier,
            "AUTH_FAILED",
            "session expired again immediately after re-login",
            { cause: retryFailure },
          );
        }
        throw retryFailure;
      }
    }
  }
}
