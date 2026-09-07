import { BaseSupplierAdapter, type PortalContract } from "@/lib/suppliers/adapters/base";
import { SupplierError } from "@/lib/suppliers/errors";
import { looksLikeBotChallenge, supplierFetch } from "@/lib/suppliers/http";
import { CookieJar, DEFAULT_SESSION_TTL_MS, type LoginResult, type SupplierSession } from "@/lib/suppliers/session";
import type { SupplierCapabilities, SupplierId, SupplierPartResult } from "@/lib/suppliers/types";

/**
 * Western Marine dealer portal.
 *
 * Reconnaissance (2026-09-07): the configured origin serves a small static page
 * whose only content is a `meta http-equiv="refresh"` to the public marketing
 * site plus an anchor into `/resources/main.htm`. In other words the configured
 * link is a landing stub, not the authenticated dealer portal, so the portal
 * entry point itself is one of the open questions below.
 *
 * Western Marine is also the supplier most likely to expose two different
 * identifiers for the same item — its own catalogue SKU and the manufacturer
 * part number. The normalized model keeps those in separate fields
 * (`supplierSku` vs `partNumber`) and this adapter must never collapse them.
 */

const CONTRACT: PortalContract = {
  confirmed: false,
  loginPath: null,
  loginSubmitPath: null,
  loginFields: null,
  searchPath: null,
  sessionProbePath: null,
  openQuestions: [
    "The configured URL is a redirect stub to the public marketing site — confirm the real authenticated dealer portal entry point and update `westernmarine_link` to it.",
    "Confirm the login URL and exact form field names for the dealer account.",
    "Capture one real search response for a known manufacturer part number and one for a Western Marine catalogue SKU, so both lookup paths can be mapped.",
    "Confirm which field is the Western Marine SKU and which is the manufacturer part number — they must stay in separate fields.",
    "Confirm which field carries dealer/account price versus retail price.",
    "Confirm whether stock is reported per branch/warehouse, and what the branch identifiers are.",
    "Confirm whether the portal reports superseded/replacement numbers, and in which field.",
  ],
};

const CAPABILITIES: SupplierCapabilities = {
  dealerCost: true,
  listPrice: true,
  availability: true,
  quantity: true,
  supersession: true,
  images: true,
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
    const { loginSubmitPath, loginFields } = this.contract;
    if (!loginSubmitPath || !loginFields) {
      throw new SupplierError(
        this.id,
        "CONFIGURATION_ERROR",
        "login flow is not defined in the portal contract",
      );
    }

    const jar = new CookieJar();
    const body = new URLSearchParams({
      [loginFields.user]: credentials.login,
      [loginFields.password]: credentials.password,
    });

    const response = await supplierFetch(this.id, this.url(loginSubmitPath), {
      method: "POST",
      body,
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
    if (!response.ok || jar.size === 0) {
      throw new SupplierError(this.id, "AUTH_FAILED", `login status ${response.status}`);
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
   * Unimplemented on purpose — see the module comment. In particular, guessing
   * which column is the SKU and which is the manufacturer number would produce
   * exactly the conflation this integration is required to avoid.
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
