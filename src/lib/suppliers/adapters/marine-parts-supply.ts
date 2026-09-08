import { BaseSupplierAdapter, type PortalContract } from "@/lib/suppliers/adapters/base";
import { SupplierError } from "@/lib/suppliers/errors";
import { looksLikeBotChallenge, supplierFetch } from "@/lib/suppliers/http";
import {
  buildResult,
  cleanText,
  normalizePartNumber,
  parseMoney,
  parseQuantity,
  sanitizeProductUrl,
} from "@/lib/suppliers/normalize";
import { CookieJar, type LoginResult, type SupplierSession } from "@/lib/suppliers/session";
import type {
  StockStatus,
  SupplierCapabilities,
  SupplierId,
  SupplierPartResult,
} from "@/lib/suppliers/types";

/**
 * Marine Parts Supply.
 *
 * The storefront is a client-rendered Next.js app in front of a FastAPI
 * backend that publishes its own OpenAPI document at `/api/openapi.json`. The
 * contract below was taken from that document and verified against live
 * responses, so this adapter is activated.
 *
 * Authentication is a standard OAuth2 password grant returning a bearer token
 * — there is no cookie session, which is why this adapter carries the token in
 * the session context rather than in the cookie jar.
 *
 * One nuance that matters for correctness: unauthenticated, `current_price`
 * equals `price_retail`. The account price only appears once signed in, so this
 * adapter never searches without a session — a search that fell back to
 * anonymous access would quietly report retail prices as dealer cost.
 */

const CONTRACT: PortalContract = {
  confirmed: true,
  loginPath: "/api/auth/login",
  loginSubmitPath: "/api/auth/login",
  loginFields: { user: "username", password: "password" },
  searchPath: "/api/inventory/search",
  sessionProbePath: "/api/auth/me",
  openQuestions: [
    "The API returns no currency code on part records, so `currency` is left null rather than assumed. Confirm the account is quoted in CAD and hard-code it here if so.",
    "No ETA or backorder date is published, so `eta` is always null.",
    "The published OpenAPI document is out of step with the deployed API — it documents `access_token` where the service answers `accessToken`. Re-check the login response shape if authentication starts failing.",
    "The user record carries a `hide_cost_price` flag; if it is ever set for this account, `current_price` may stop being the dealer price. Worth asserting on if dealer costs ever look like retail.",
  ],
};

const CAPABILITIES: SupplierCapabilities = {
  dealerCost: true,
  listPrice: true,
  availability: true,
  quantity: true,
  supersession: true,
  images: true,
  warehouse: false,
  eta: false,
  supplierSku: false,
};

/** One row of `GET /api/inventory/search` or `/api/inventory/parts/{code}`. */
interface MpsPart {
  part_code?: unknown;
  code_desc1?: unknown;
  code_desc2?: unknown;
  ecommerce_desc?: unknown;
  qty_onhand?: unknown;
  qty_available?: unknown;
  qty_bo?: unknown;
  is_instock?: unknown;
  stock_status?: unknown;
  price_retail?: unknown;
  current_price?: unknown;
  vendor1_friendly_name?: unknown;
  status?: unknown;
  images?: unknown;
  media_links?: unknown;
  xrefs?: unknown;
  substitutes?: unknown;
  matched_xrefs?: unknown;
}

function mapStockStatus(part: MpsPart, quantity: number | null): StockStatus {
  const raw = typeof part.stock_status === "string" ? part.stock_status.toLowerCase() : "";
  if (raw === "in") return "in_stock";
  if (raw === "bo") return "backorder";
  if (part.is_instock === true) return "in_stock";
  if (part.is_instock === false && quantity === 0) return "out_of_stock";
  return "unknown";
}

/** `images[].asset_id` / `media_links[].media_asset_id` render through a preset. */
function firstImageAssetId(part: MpsPart): number | null {
  const fromImages = Array.isArray(part.images) ? part.images : null;
  if (fromImages) {
    for (const entry of fromImages) {
      const id = (entry as { asset_id?: unknown })?.asset_id;
      if (typeof id === "number") return id;
    }
  }
  const fromLinks = Array.isArray(part.media_links) ? part.media_links : null;
  if (fromLinks) {
    for (const entry of fromLinks) {
      const id = (entry as { media_asset_id?: unknown })?.media_asset_id;
      if (typeof id === "number") return id;
    }
  }
  return null;
}

function description(part: MpsPart): string | null {
  const primary = cleanText(part.ecommerce_desc) ?? cleanText(part.code_desc1);
  const secondary = cleanText(part.code_desc2);
  if (primary && secondary) return `${primary} ${secondary}`;
  return primary ?? secondary;
}

export class MarinePartsSupplyAdapter extends BaseSupplierAdapter {
  readonly id: SupplierId = "marinepartssupply";
  readonly capabilities = CAPABILITIES;
  readonly contract = CONTRACT;

  protected async login(signal?: AbortSignal): Promise<LoginResult> {
    const credentials = this.requireCredentials();

    const body = new URLSearchParams({
      grant_type: "password",
      username: credentials.login,
      password: credentials.password,
    });

    const response = await supplierFetch(this.id, this.url(CONTRACT.loginSubmitPath!), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
      signal,
    });

    if (looksLikeBotChallenge(response) && response.status !== 401) {
      throw new SupplierError(
        this.id,
        "AUTH_INTERVENTION_REQUIRED",
        `login answered ${response.status} with a challenge page`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new SupplierError(this.id, "AUTH_FAILED", `login rejected (${response.status})`);
    }
    if (!response.ok) {
      throw new SupplierError(this.id, "SUPPLIER_UNAVAILABLE", `login status ${response.status}`);
    }

    // The published OpenAPI document says `access_token`, but the deployed API
    // answers with `accessToken`. Accept either rather than trusting the schema.
    const payload = response.json as Record<string, unknown> | null;
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const value = payload?.[key];
        if (typeof value === "string" && value) return value;
      }
      return "";
    };

    const accessToken = pick("accessToken", "access_token");
    if (!accessToken) {
      throw new SupplierError(this.id, "AUTH_FAILED", "login returned no access token");
    }

    const tokenType = pick("tokenType", "token_type") || "bearer";

    return {
      // Bearer flow: the jar stays empty and the token travels in the context.
      jar: new CookieJar(),
      context: { accessToken, tokenType },
      // The token lifetime is not advertised; a short window keeps us honest and
      // an expired token is re-established transparently on the next 401.
      ttlMs: 15 * 60 * 1000,
    };
  }

  private authHeaders(session: SupplierSession) {
    const scheme = session.context.tokenType || "bearer";
    const prefix = scheme.charAt(0).toUpperCase() + scheme.slice(1);
    return {
      authorization: `${prefix} ${session.context.accessToken}`,
      accept: "application/json",
    };
  }

  private toResult(
    part: MpsPart,
    searchedPartNumber: string,
    baseUrl: string,
  ): SupplierPartResult | null {
    const partNumber = cleanText(part.part_code, 100);
    if (!partNumber) return null;

    const quantity =
      parseQuantity(part.qty_available) ?? parseQuantity(part.qty_onhand) ?? null;
    const backorderQty = parseQuantity(part.qty_bo);
    const assetId = firstImageAssetId(part);

    // `substitutes` is the supersession signal: the part the vendor would ship
    // in place of this one.
    const substitutes = Array.isArray(part.substitutes) ? part.substitutes : [];
    const firstSubstitute = substitutes
      .map((entry) => cleanText((entry as { part_code?: unknown })?.part_code, 100))
      .find((code): code is string => Boolean(code));

    // `xrefs` are the older / equivalent numbers this part answers to.
    const xrefs = Array.isArray(part.xrefs)
      ? part.xrefs.map((entry) => cleanText(entry, 100)).filter((code): code is string => Boolean(code))
      : [];

    return buildResult({
      supplier: this.id,
      searchedPartNumber,
      partNumber,
      description: description(part),
      manufacturer: cleanText(part.vendor1_friendly_name, 120),
      brand: cleanText(part.vendor1_friendly_name, 120),
      // Signed in, current_price is the account price; price_retail is list.
      dealerCost: parseMoney(part.current_price),
      listPrice: parseMoney(part.price_retail),
      // The API publishes no currency code, so none is claimed.
      currency: null,
      stockStatus: mapStockStatus(part, quantity),
      quantityAvailable: quantity,
      backorder: backorderQty === null ? null : backorderQty > 0,
      supersededBy: firstSubstitute ?? null,
      replaces: xrefs,
      productUrl: sanitizeProductUrl(`/parts/${encodeURIComponent(partNumber)}`, baseUrl),
      imageUrl:
        assetId === null
          ? null
          : sanitizeProductUrl(`/api/media-api/sized/catalog_card/${assetId}.jpg`, baseUrl),
    });
  }

  /** Fetch the authoritative row, including substitutes and cross-references. */
  private async fetchDetail(
    session: SupplierSession,
    partCode: string,
    signal?: AbortSignal,
  ): Promise<SupplierPartResult | null> {
    const { baseUrl } = this.requireCredentials();
    const response = await supplierFetch(
      this.id,
      this.url(`/api/inventory/parts/${encodeURIComponent(partCode)}`),
      { headers: this.authHeaders(session), signal },
    );

    if (response.status === 401) {
      throw new SupplierError(this.id, "SESSION_EXPIRED", "detail rejected the bearer token");
    }
    if (response.status === 403) {
      throw new SupplierError(this.id, "AUTH_FAILED", "account lacks catalogue access");
    }
    if (response.status === 404) return null;
    if (response.status === 429) {
      throw new SupplierError(this.id, "RATE_LIMITED", "detail rate limited");
    }
    if (!response.ok) {
      throw new SupplierError(this.id, "SUPPLIER_UNAVAILABLE", `detail status ${response.status}`);
    }
    if (!response.json || typeof response.json !== "object") {
      throw new SupplierError(this.id, "PARSING_FAILED", "detail response was not an object");
    }

    return this.toResult(response.json as MpsPart, partCode, baseUrl);
  }

  protected async performSearch(
    session: SupplierSession,
    normalizedPartNumber: string,
    signal?: AbortSignal,
  ): Promise<SupplierPartResult[]> {
    const { baseUrl } = this.requireCredentials();
    const query = new URLSearchParams({
      q: normalizedPartNumber,
      limit: "25",
      offset: "0",
    });

    const response = await supplierFetch(
      this.id,
      this.url(`${CONTRACT.searchPath}?${query}`),
      { headers: this.authHeaders(session), signal },
    );

    if (response.status === 401) {
      throw new SupplierError(this.id, "SESSION_EXPIRED", "search rejected the bearer token");
    }
    if (response.status === 403) {
      throw new SupplierError(this.id, "AUTH_FAILED", "account lacks catalogue access");
    }
    if (response.status === 429) {
      throw new SupplierError(this.id, "RATE_LIMITED", "search rate limited");
    }
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new SupplierError(this.id, "SUPPLIER_UNAVAILABLE", `search status ${response.status}`);
    }

    const payload = response.json as { results?: unknown } | null;
    if (!payload || !Array.isArray(payload.results)) {
      throw new SupplierError(this.id, "PARSING_FAILED", "search response had no results array");
    }

    const results = payload.results
      .map((row) => this.toResult(row as MpsPart, normalizedPartNumber, baseUrl))
      .filter((result): result is SupplierPartResult => result !== null);

    // Search rows omit `substitutes`. Enrich only the exact match so the normal
    // work-order search can surface the replacement without issuing a detail
    // request for every related suggestion.
    const exactIndex = results.findIndex(
      (result) => normalizePartNumber(result.partNumber) === normalizedPartNumber,
    );
    if (exactIndex !== -1) {
      const detail = await this.fetchDetail(session, results[exactIndex].partNumber, signal);
      if (detail) {
        // Preserve availability fields that exist only on the search row while
        // copying the relationships that exist only on detail.
        results[exactIndex] = {
          ...results[exactIndex],
          supersededBy: detail.supersededBy,
          replaces: detail.replaces,
          matchType: detail.matchType,
          exactMatch: detail.exactMatch,
          imageUrl: detail.imageUrl ?? results[exactIndex].imageUrl,
          checkedAt: detail.checkedAt,
        };
      }
    }

    return results;
  }

  /**
   * The detail endpoint is the only place substitutes and cross-references are
   * returned. Search enriches its exact row from the same helper, while this
   * method exposes the authoritative detail lookup directly.
   */
  override async getPartDetails(
    normalizedPartNumber: string,
    signal?: AbortSignal,
  ): Promise<SupplierPartResult | null> {
    this.assertReady();
    const partCode = normalizePartNumber(normalizedPartNumber);

    return this.sessions.run(
      (s) => this.login(s),
      (session) => this.fetchDetail(session, partCode, signal),
      signal,
    );
  }
}
