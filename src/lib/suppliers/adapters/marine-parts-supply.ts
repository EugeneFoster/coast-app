import { BaseSupplierAdapter, type PortalContract } from "@/lib/suppliers/adapters/base";
import { SupplierError } from "@/lib/suppliers/errors";
import { looksLikeBotChallenge, supplierFetch } from "@/lib/suppliers/http";
import { buildResult, cleanText, parseMoney, parseQuantity } from "@/lib/suppliers/normalize";
import { CookieJar, type LoginResult, type SupplierSession } from "@/lib/suppliers/session";
import type { StockStatus, SupplierCapabilities, SupplierId, SupplierPartResult } from "@/lib/suppliers/types";

/** Account-authenticated Marine Parts Supply catalogue. Anonymous prices are retail, not dealer Net. */
const CONTRACT: PortalContract = {
  confirmed: true,
  loginPath: "/api/auth/login",
  loginSubmitPath: "/api/auth/login",
  loginFields: { user: "username", password: "password" },
  searchPath: "/api/inventory/search",
  sessionProbePath: "/api/auth/me",
  openQuestions: ["The API does not state a currency; require explicit dealer-account confirmation before CAD price suggestions."],
};

const CAPABILITIES: SupplierCapabilities = {
  dealerCost: true, listPrice: true, availability: true, quantity: true,
  supersession: false, images: false, warehouse: false, eta: false, supplierSku: false,
};

type MpsPart = {
  part_code?: unknown;
  code_desc1?: unknown;
  code_desc2?: unknown;
  ecommerce_desc?: unknown;
  current_price?: unknown;
  price_retail?: unknown;
  qty_available?: unknown;
  qty_onhand?: unknown;
  is_instock?: unknown;
  stock_status?: unknown;
  vendor1_friendly_name?: unknown;
};

function stockStatus(part: MpsPart, quantity: number | null): StockStatus {
  const raw = typeof part.stock_status === "string" ? part.stock_status.toLowerCase() : "";
  if (raw === "in" || part.is_instock === true) return "in_stock";
  if (raw === "bo") return "backorder";
  if (part.is_instock === false && quantity === 0) return "out_of_stock";
  return "unknown";
}

export class MarinePartsSupplyAdapter extends BaseSupplierAdapter {
  readonly id: SupplierId = "marinepartssupply";
  readonly capabilities = CAPABILITIES;
  readonly contract = CONTRACT;

  protected async login(signal?: AbortSignal): Promise<LoginResult> {
    const credentials = this.requireCredentials();
    const response = await supplierFetch(this.id, this.url(CONTRACT.loginSubmitPath!), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "password",
        username: credentials.login,
        password: credentials.password,
      }),
      signal,
    });
    if (looksLikeBotChallenge(response) && response.status !== 401) {
      throw new SupplierError(this.id, "AUTH_INTERVENTION_REQUIRED", "login challenge page");
    }
    if (response.status === 401 || response.status === 403) {
      throw new SupplierError(this.id, "AUTH_FAILED", `login rejected (${response.status})`);
    }
    if (!response.ok) {
      throw new SupplierError(this.id, "SUPPLIER_UNAVAILABLE", `login status ${response.status}`);
    }
    const payload = response.json as Record<string, unknown> | null;
    const token = payload?.accessToken ?? payload?.access_token;
    if (typeof token !== "string" || !token) {
      throw new SupplierError(this.id, "AUTH_FAILED", "login returned no access token");
    }
    const scheme = payload?.tokenType ?? payload?.token_type;
    return {
      jar: new CookieJar(),
      context: { accessToken: token, tokenType: typeof scheme === "string" ? scheme : "bearer" },
      ttlMs: 15 * 60 * 1000,
    };
  }

  private authHeaders(session: SupplierSession) {
    const scheme = session.context.tokenType || "bearer";
    return { authorization: `${scheme.charAt(0).toUpperCase()}${scheme.slice(1)} ${session.context.accessToken}`, accept: "application/json" };
  }

  protected async performSearch(
    session: SupplierSession,
    normalizedPartNumber: string,
    signal?: AbortSignal,
  ): Promise<SupplierPartResult[]> {
    const query = new URLSearchParams({ q: normalizedPartNumber, limit: "25", offset: "0" });
    const response = await supplierFetch(this.id, this.url(`${CONTRACT.searchPath}?${query}`), {
      headers: this.authHeaders(session), signal,
    });
    if (response.status === 401) throw new SupplierError(this.id, "SESSION_EXPIRED", "search rejected bearer token");
    if (response.status === 403) throw new SupplierError(this.id, "AUTH_FAILED", "account lacks catalogue access");
    if (response.status === 429) throw new SupplierError(this.id, "RATE_LIMITED", "search rate limited");
    if (response.status === 404) return [];
    if (!response.ok) throw new SupplierError(this.id, "SUPPLIER_UNAVAILABLE", `search status ${response.status}`);
    const payload = response.json as { results?: unknown } | null;
    if (!payload || !Array.isArray(payload.results)) {
      throw new SupplierError(this.id, "PARSING_FAILED", "search response had no results array");
    }
    return payload.results.flatMap((raw): SupplierPartResult[] => {
      const part = raw as MpsPart;
      const partNumber = cleanText(part.part_code, 100);
      if (!partNumber) return [];
      const quantity = parseQuantity(part.qty_available) ?? parseQuantity(part.qty_onhand);
      const primary = cleanText(part.ecommerce_desc) ?? cleanText(part.code_desc1);
      const secondary = cleanText(part.code_desc2);
      return [buildResult({
        supplier: this.id,
        searchedPartNumber: normalizedPartNumber,
        partNumber,
        description: primary && secondary ? `${primary} ${secondary}` : primary ?? secondary,
        manufacturer: cleanText(part.vendor1_friendly_name, 120),
        brand: cleanText(part.vendor1_friendly_name, 120),
        dealerCost: parseMoney(part.current_price),
        listPrice: parseMoney(part.price_retail),
        currency: null,
        stockStatus: stockStatus(part, quantity),
        quantityAvailable: quantity,
      })];
    });
  }
}
