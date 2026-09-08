import { BaseSupplierAdapter, type PortalContract } from "@/lib/suppliers/adapters/base";
import { SupplierError } from "@/lib/suppliers/errors";
import { looksLikeBotChallenge, supplierFetch } from "@/lib/suppliers/http";
import { CookieJar, DEFAULT_SESSION_TTL_MS, type LoginResult, type SupplierSession } from "@/lib/suppliers/session";
import type { SupplierCapabilities, SupplierId, SupplierPartResult } from "@/lib/suppliers/types";

/**
 * Mercury Marine dealer portal (MercNET).
 *
 * Reconnaissance from the build environment (2026-09-07): the configured origin
 * answers an unauthenticated GET with HTTP 403 and an HTML body, which is the
 * signature of an edge bot/WAF protection layer sitting in front of the portal.
 * We do not attempt to defeat that — no CAPTCHA solving, no MFA bypass, no
 * fingerprint spoofing. When the portal answers with a challenge this adapter
 * reports AUTH_INTERVENTION_REQUIRED so an operator can sign in manually while
 * the other suppliers keep working.
 *
 * Consequently the portal contract below is unconfirmed and the adapter refuses
 * to search. Activating it requires the facts listed in `openQuestions` plus a
 * `parseSearchPayload` implementation; nothing else in the system changes.
 */

const CONTRACT: PortalContract = {
  confirmed: false,
  loginPath: null,
  loginSubmitPath: null,
  loginFields: null,
  searchPath: null,
  sessionProbePath: null,
  openQuestions: [
    "BLOCKED: MercNET is normally signed into by hand and appears to carry anti-scraping protection — the account owner reports a manual session is the usual route. An unattended integration therefore needs either an official Mercury dealer API credential or an allow-listed service account. Confirm which is available before going further.",
    "If an official API exists for this account, its base URL and credential scheme replace everything below.",
    "Otherwise: confirm the login URL and exact form field names (or the SSO/OIDC flow), and whether sign-in requires MFA or a device-trust step.",
    "Confirm whether parts lookup has a JSON endpoint, and capture one real search response for a known number.",
    "Confirm how MercNET expresses supersession (field name and whether it chains through multiple generations).",
    "Confirm the field names for dealer cost vs list price, warehouse, quantity and ETA, and the currency they are quoted in.",
  ],
};

const CAPABILITIES: SupplierCapabilities = {
  dealerCost: true,
  listPrice: true,
  availability: true,
  quantity: true,
  // Supersession is the reason Mercury matters most here.
  supersession: true,
  images: false,
  warehouse: true,
  eta: true,
  supplierSku: false,
};

export class MercuryAdapter extends BaseSupplierAdapter {
  readonly id: SupplierId = "mercury";
  readonly capabilities = CAPABILITIES;
  readonly contract = CONTRACT;

  protected async login(signal?: AbortSignal): Promise<LoginResult> {
    const { baseUrl } = this.requireCredentials();
    const jar = new CookieJar();

    // Probe the portal before sending anything. If an edge challenge is in the
    // way we stop here rather than replaying credentials into a bot wall.
    const landing = await supplierFetch(this.id, baseUrl, {
      jar,
      signal,
      timeoutMs: 10_000,
    });

    if (looksLikeBotChallenge(landing)) {
      throw new SupplierError(
        this.id,
        "AUTH_INTERVENTION_REQUIRED",
        `portal answered ${landing.status} with a challenge page`,
      );
    }

    const { loginSubmitPath, loginFields } = this.contract;
    if (!loginSubmitPath || !loginFields) {
      throw new SupplierError(
        this.id,
        "CONFIGURATION_ERROR",
        "login flow is not defined in the portal contract",
      );
    }

    const credentials = this.requireCredentials();
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
      { signal, headers: { accept: "application/json,text/html;q=0.9" } },
    );

    if (response.status === 401 || response.status === 403) {
      // Distinguish an expired session from an edge challenge: the former is
      // retryable via re-login, the latter needs a human.
      if (looksLikeBotChallenge(response) && response.status === 403) {
        throw new SupplierError(this.id, "AUTH_INTERVENTION_REQUIRED", "challenge on search");
      }
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
   * Turn one MercNET search response into normalized results.
   *
   * Intentionally unimplemented: writing a parser without a captured real
   * response would mean inventing field names, and a wrong mapping here would
   * feed wrong dealer costs into an approval request. Implement this together
   * with the answers to `contract.openQuestions`.
   */
  private parseSearchPayload(
    payload: unknown,
    normalizedPartNumber: string,
  ): SupplierPartResult[] {
    throw new SupplierError(
      this.id,
      "PORTAL_CONTRACT_UNCONFIRMED",
      `MercNET response mapping is not implemented (searched ${normalizedPartNumber}, received ${typeof payload}); capture a real search response first`,
    );
  }
}
