import { BaseSupplierAdapter, type PortalContract } from "@/lib/suppliers/adapters/base";
import { SupplierError } from "@/lib/suppliers/errors";
import { looksLikeBotChallenge, supplierFetch } from "@/lib/suppliers/http";
import { CookieJar, DEFAULT_SESSION_TTL_MS, type LoginResult, type SupplierSession } from "@/lib/suppliers/session";
import type { SupplierCapabilities, SupplierId, SupplierPartResult } from "@/lib/suppliers/types";

/**
 * Marine Parts Supply.
 *
 * Reconnaissance (2026-09-07): the storefront is a client-rendered Next.js
 * application. The server HTML contains a parts search input whose placeholder
 * confirms the number formats in use ("18-2001", "35-8M0103970", "water pump"),
 * but no login form and no discoverable REST route — data is fetched by the
 * client bundle, so the request shape has to be captured from the browser's
 * network panel while signed in.
 *
 * Account (dealer) pricing sits behind that sign-in, so an anonymous scrape
 * would return retail prices only — exactly the kind of wrong number that must
 * never reach an approval request. The contract is therefore unconfirmed.
 */

const CONTRACT: PortalContract = {
  confirmed: false,
  loginPath: null,
  loginSubmitPath: null,
  loginFields: null,
  searchPath: null,
  sessionProbePath: null,
  openQuestions: [
    "The storefront is a client-rendered Next.js app with no server-rendered login form — capture the sign-in request (URL, method, payload) from the browser network panel while logging in with the dealer account.",
    "Capture the parts-search request the client bundle issues (URL, method, payload) and one real response body for a known part number.",
    "Confirm which response field carries the account/dealer price versus the retail price, and confirm dealer pricing is actually returned to this account.",
    "Confirm whether the session is a cookie or a bearer token, and how long it stays valid.",
    "Confirm how availability, quantity, ETA and backorder are represented.",
    "Confirm whether product image URLs are publicly reachable (they may be CDN-signed).",
  ],
};

const CAPABILITIES: SupplierCapabilities = {
  dealerCost: true,
  listPrice: true,
  availability: true,
  quantity: true,
  supersession: false,
  images: true,
  warehouse: false,
  eta: true,
  supplierSku: false,
};

export class MarinePartsSupplyAdapter extends BaseSupplierAdapter {
  readonly id: SupplierId = "marinepartssupply";
  readonly capabilities = CAPABILITIES;
  readonly contract = CONTRACT;

  protected async login(signal?: AbortSignal): Promise<LoginResult> {
    const credentials = this.requireCredentials();
    const { loginSubmitPath, loginFields } = this.contract;
    if (!loginSubmitPath || !loginFields) {
      throw new SupplierError(
        this.id,
        "CONFIGURATION_ERROR",
        "login flow is not defined in the portal contract",
      );
    }

    const jar = new CookieJar();
    const response = await supplierFetch(this.id, this.url(loginSubmitPath), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        [loginFields.user]: credentials.login,
        [loginFields.password]: credentials.password,
      }),
      jar,
      signal,
    });

    if (looksLikeBotChallenge(response)) {
      throw new SupplierError(
        this.id,
        "AUTH_INTERVENTION_REQUIRED",
        `login answered ${response.status} with a challenge page`,
      );
    }
    if (!response.ok) {
      throw new SupplierError(this.id, "AUTH_FAILED", `login status ${response.status}`);
    }

    // Some storefronts return a bearer token instead of a cookie session. The
    // contract must say which; until then treat an empty jar as a failure so we
    // never proceed with an unauthenticated session and read retail prices.
    if (jar.size === 0) {
      throw new SupplierError(
        this.id,
        "AUTH_FAILED",
        "login returned no session cookie; confirm whether this portal uses a bearer token",
      );
    }

    return { jar, ttlMs: DEFAULT_SESSION_TTL_MS };
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
        "CONFIGURATION_ERROR",
        "search endpoint is not defined in the portal contract",
      );
    }

    const response = await this.request(
      session,
      `${searchPath}?${new URLSearchParams({ q: normalizedPartNumber })}`,
      { signal, headers: { accept: "application/json" } },
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
   * Unimplemented on purpose — see the module comment. A guessed field mapping
   * could put a retail price where a dealer cost belongs.
   */
  private parseSearchPayload(
    payload: unknown,
    normalizedPartNumber: string,
  ): SupplierPartResult[] {
    throw new SupplierError(
      this.id,
      "PORTAL_CONTRACT_UNCONFIRMED",
      `Marine Parts Supply response mapping is not implemented (searched ${normalizedPartNumber}, received ${typeof payload}); capture a real search response first`,
    );
  }
}
