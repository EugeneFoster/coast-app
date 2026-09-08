import { BaseSupplierAdapter, type PortalContract } from "@/lib/suppliers/adapters/base";
import { SupplierError } from "@/lib/suppliers/errors";
import { looksLikeBotChallenge, supplierFetch } from "@/lib/suppliers/http";
import { CookieJar, type LoginResult, type SupplierSession } from "@/lib/suppliers/session";
import type { SupplierCapabilities, SupplierId, SupplierPartResult } from "@/lib/suppliers/types";

/**
 * Western Marine dealer portal.
 *
 * The portal is Strategi by ADVANCED BusinessLink (v2.7.1) — a web gateway in
 * front of an IBM i application, not a modern web app. Its authentication flow
 * was confirmed from the live portal:
 *
 *   GET /Store/homepage.html?Location=001
 *     -> 302 /*AUTHENTICATE/<nonce>/Store/homepage.html?*LOGIN=<token>
 *        set-cookie: StrategiID=SessionCookieCheck (Basic); path=/*AUTHENTICATE/
 *     -> 401 unless the follow-up carries HTTP Basic credentials
 *
 * The literal "(Basic)" in the cookie is Strategi announcing the scheme, so
 * `login()` below implements exactly that: follow the redirect, present Basic
 * credentials, keep the StrategiID cookie for the rest of the session.
 *
 * `Location=001` selects Western Marine; `002` is the sibling Transat Marine
 * portal on the same software. That selector lives in `westernmarine_link`.
 *
 * Still unconfirmed, and why this adapter is not yet activated: what the
 * authenticated Store application exposes for a part lookup. Strategi renders
 * IBM i screens, so the search is likely a form POST returning HTML rather than
 * JSON, and its field layout cannot be guessed from outside. Western Marine is
 * also the supplier most likely to publish both its own catalogue SKU and the
 * manufacturer part number; those must land in `supplierSku` and `partNumber`
 * respectively and must never be conflated.
 */

const CONTRACT: PortalContract = {
  confirmed: false,
  loginPath: "/Store/homepage.html?Location=001",
  loginSubmitPath: null,
  loginFields: null,
  searchPath: null,
  sessionProbePath: null,
  openQuestions: [
    "Capture the part-search request the authenticated Strategi Store issues (URL, method, form fields) and one real response for a known manufacturer part number.",
    "Capture a second response for a Western Marine catalogue SKU, so both lookup paths can be mapped.",
    "Confirm which column is the Western Marine SKU and which is the manufacturer part number — they must stay in separate fields.",
    "Confirm which column carries dealer/account price versus retail price.",
    "Confirm whether stock is reported per branch/warehouse and what the branch identifiers are.",
    "Confirm whether the portal reports superseded/replacement numbers, and in which column.",
    "Confirm how long a Strategi session stays valid, and what an expired session returns (so it can be told apart from a failed login).",
  ],
};

const CAPABILITIES: SupplierCapabilities = {
  dealerCost: true,
  listPrice: true,
  availability: true,
  quantity: true,
  supersession: true,
  images: false,
  warehouse: true,
  eta: true,
  // The distinguishing feature of this supplier.
  supplierSku: true,
};

export class WesternMarineAdapter extends BaseSupplierAdapter {
  readonly id: SupplierId = "westernmarine";
  readonly capabilities = CAPABILITIES;
  readonly contract = CONTRACT;

  protected async login(signal?: AbortSignal): Promise<LoginResult> {
    const credentials = this.requireCredentials();
    const jar = new CookieJar();

    // Step 1: ask for the store entry point and let Strategi mint the
    // per-session *AUTHENTICATE URL. The redirect is not followed automatically
    // because the Basic credentials must only be presented to that URL.
    const entry = await supplierFetch(this.id, credentials.baseUrl, {
      jar,
      signal,
      followRedirects: false,
      timeoutMs: 12_000,
    });

    const location = entry.headers.get("location");
    if (entry.status < 300 || entry.status >= 400 || !location) {
      if (looksLikeBotChallenge(entry)) {
        throw new SupplierError(
          this.id,
          "AUTH_INTERVENTION_REQUIRED",
          `portal answered ${entry.status} with a challenge page`,
        );
      }
      throw new SupplierError(
        this.id,
        "SUPPLIER_UNAVAILABLE",
        `portal did not start an authentication handshake (status ${entry.status})`,
      );
    }

    const authenticateUrl = new URL(location, credentials.baseUrl);
    if (authenticateUrl.origin !== new URL(credentials.baseUrl).origin) {
      // Never present credentials to a host the portal redirected us to.
      throw new SupplierError(
        this.id,
        "CONFIGURATION_ERROR",
        "authentication redirect left the configured origin",
      );
    }

    // Step 2: present Basic credentials to the session URL Strategi issued.
    const basic = Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64");
    const authenticated = await supplierFetch(this.id, authenticateUrl.toString(), {
      jar,
      signal,
      headers: { authorization: `Basic ${basic}` },
    });

    if (authenticated.status === 401) {
      throw new SupplierError(this.id, "AUTH_FAILED", "portal rejected the dealer credentials");
    }
    if (authenticated.status === 403) {
      throw new SupplierError(
        this.id,
        "AUTH_INTERVENTION_REQUIRED",
        "portal returned 403 — the account may need a manual sign-in",
      );
    }
    if (!authenticated.ok) {
      throw new SupplierError(
        this.id,
        "SUPPLIER_UNAVAILABLE",
        `authentication status ${authenticated.status}`,
      );
    }

    return {
      jar,
      context: { entryUrl: authenticated.url },
      // Strategi does not advertise a session lifetime; keep it short and let an
      // expired session re-authenticate transparently.
      ttlMs: 10 * 60 * 1000,
    };
  }

  protected async performSearch(
    session: SupplierSession,
    normalizedPartNumber: string,
    signal?: AbortSignal,
  ): Promise<SupplierPartResult[]> {
    const { searchPath } = this.contract;
    if (!searchPath) {
      throw new SupplierError(
        this.id,
        "PORTAL_CONTRACT_UNCONFIRMED",
        `the authenticated Store search endpoint is not known yet (searched ${normalizedPartNumber}, session ${session.context.entryUrl ? "established" : "absent"})`,
      );
    }

    const response = await this.request(
      session,
      `${searchPath}?${new URLSearchParams({ q: normalizedPartNumber })}`,
      { signal },
    );

    if (response.status === 401 || response.status === 403) {
      throw new SupplierError(this.id, "SESSION_EXPIRED", `search status ${response.status}`);
    }
    if (response.status === 429) {
      throw new SupplierError(this.id, "RATE_LIMITED", "search rate limited");
    }
    if (!response.ok) {
      throw new SupplierError(this.id, "SUPPLIER_UNAVAILABLE", `search status ${response.status}`);
    }

    return this.parseSearchPayload(response.json ?? response.text, normalizedPartNumber);
  }

  /**
   * Unimplemented on purpose. Strategi renders IBM i screens as HTML, and
   * guessing which column is the SKU and which is the manufacturer number would
   * produce exactly the conflation this integration must avoid.
   */
  private parseSearchPayload(
    payload: unknown,
    normalizedPartNumber: string,
  ): SupplierPartResult[] {
    throw new SupplierError(
      this.id,
      "PORTAL_CONTRACT_UNCONFIRMED",
      `Western Marine response mapping is not implemented (searched ${normalizedPartNumber}, received ${typeof payload}); capture a real search response first`,
    );
  }
}
