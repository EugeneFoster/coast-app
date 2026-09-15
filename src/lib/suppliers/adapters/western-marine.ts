import { BaseSupplierAdapter, type PortalContract } from "@/lib/suppliers/adapters/base";
import { SupplierError } from "@/lib/suppliers/errors";
import { looksLikeBotChallenge, supplierFetch } from "@/lib/suppliers/http";
import { buildResult, cleanText, parseMoney, partNumbersMatch } from "@/lib/suppliers/normalize";
import { CookieJar, type LoginResult, type SupplierSession } from "@/lib/suppliers/session";
import { parseStrategiTables } from "@/lib/suppliers/strategi-table";
import type { StockStatus, SupplierCapabilities, SupplierId, SupplierPartResult } from "@/lib/suppliers/types";

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
 * An authenticated dealer session confirmed that GET /Store/ProductList.html
 * with Search_by/Search_Type=6 and Search_for=<manufacturer part number>
 * positions a server-rendered table. Its columns explicitly separate Mfg Part
 * Number from Code (Western Marine's catalogue SKU), SRP from Net, and Avail.
 * This adapter only returns rows matching the manufacturer number or catalogue
 * Code. The portal also shows nearby numbers, which are not interchangeable
 * parts. A Code match keeps the manufacturer number distinct and is classified
 * as related, so it cannot be mistaken for an exact manufacturer-number match.
 */

const CONTRACT: PortalContract = {
  confirmed: true,
  loginPath: "/Store/homepage.html?Location=001",
  loginSubmitPath: null,
  loginFields: null,
  searchPath: "/Store/ProductList.html",
  sessionProbePath: "/Store/homepage.html?Location=001",
  openQuestions: [
    "Catalogue Code can be searched through the same page, but a Code hit is related to the searched number rather than an exact manufacturer-number match.",
    "The page omits a currency label, so prices remain currency=null until the dealer account currency is confirmed.",
    "Net /Qty other than /1 and Per other than EA are not quoted as unit costs until their pricing basis is confirmed.",
    "An availability date sometimes follows No; its meaning has not been confirmed, so ETA remains null.",
    "No branch-level stock or supersession field was found in the product list; those require separate detail mapping.",
    "Confirm the exact expired-session response and the Strategi session lifetime in a server-side run.",
  ],
};

const CAPABILITIES: SupplierCapabilities = {
  dealerCost: true,
  listPrice: true,
  availability: true,
  quantity: true,
  supersession: false,
  images: false,
  warehouse: false,
  eta: false,
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
    let authenticated = await supplierFetch(this.id, authenticateUrl.toString(), {
      jar,
      signal,
      headers: { authorization: `Basic ${basic}` },
    });

    // Strategi can answer the first preemptive Basic request with a challenge
    // even when the credentials are valid. Chrome then repeats the same URL;
    // the second request advances to the Store homepage. A second 401 is a
    // genuine rejection, not a reason to keep retrying.
    if (
      authenticated.status === 401 &&
      /^Basic(?:\s|$)/i.test(authenticated.headers.get("www-authenticate") ?? "")
    ) {
      authenticated = await supplierFetch(this.id, authenticateUrl.toString(), {
        jar,
        signal,
        headers: { authorization: `Basic ${basic}` },
      });
    }

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
    const searchPath = this.contract.searchPath;
    if (!searchPath) throw new SupplierError(this.id, "CONFIGURATION_ERROR", "search path missing");
    const credentials = this.requireCredentials();
    const basic = Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64");
    const query = new URLSearchParams({
      Search_by: "6",
      Search_for: normalizedPartNumber,
      Search_Word: "",
      Search_Type: "6",
    });
    const response = await this.request(
      session,
      `${searchPath}?${query}`,
      { signal, followRedirects: false, headers: { authorization: `Basic ${basic}` } },
    );

    if (
      response.status === 401 ||
      response.status === 403 ||
      (response.status >= 300 && response.status < 400) ||
      response.url.includes("*AUTHENTICATE")
    ) {
      throw new SupplierError(this.id, "SESSION_EXPIRED", `search status ${response.status}`);
    }
    if (response.status === 429) {
      throw new SupplierError(this.id, "RATE_LIMITED", "search rate limited");
    }
    if (!response.ok) {
      throw new SupplierError(this.id, "SUPPLIER_UNAVAILABLE", `search status ${response.status}`);
    }

    return this.parseSearchPayload(response.text, normalizedPartNumber);
  }

  private parseSearchPayload(
    html: string,
    normalizedPartNumber: string,
  ): SupplierPartResult[] {
    const table = parseStrategiTables(html).find((candidate) =>
      candidate.rows.some((row) => {
        const headers = row.cells.map((cell) => cell.text);
        return (
          headers.includes("Mfg Part Number") &&
          headers.includes("SRP") &&
          headers.includes("Net") &&
          headers.includes("/Qty") &&
          headers.includes("Avail") &&
          headers.includes("Code")
        );
      }),
    );
    if (!table) {
      throw new SupplierError(this.id, "PARSING_FAILED", "Western Marine product table not found");
    }

    const headerIndex = table.rows.findIndex((row) =>
      row.cells.some((cell) => cell.text === "Mfg Part Number"),
    );
    const headers = table.rows[headerIndex].cells.map((cell) => cell.text);
    const column = (name: string) => headers.indexOf(name);
    const seen = new Set<string>();
    const results: SupplierPartResult[] = [];

    for (const row of table.rows.slice(headerIndex + 1)) {
      if (row.cells.length !== headers.length) continue;
      const read = (name: string) => row.cells[column(name)]?.text ?? "";
      const partNumber = read("Mfg Part Number");
      const supplierSku = cleanText(read("Code"), 64);
      if (
        !partNumbersMatch(partNumber, normalizedPartNumber) &&
        !partNumbersMatch(supplierSku ?? "", normalizedPartNumber)
      ) continue;
      const key = `${partNumber}:${supplierSku ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const availability = read("Avail");
      const numericAvailability = /^\d{1,7}$/.test(availability) ? Number(availability) : null;
      const unavailable = /^No(?:$|\s|(?=\d{1,2}\/\d{1,2}\/\d{2,4}))/i.test(availability);
      const quantityAvailable = numericAvailability ?? (unavailable ? 0 : null);
      const stockStatus: StockStatus =
        quantityAvailable === null
          ? "unknown"
          : quantityAvailable > 0
            ? "in_stock"
            : "out_of_stock";

      // The portal displays Net /Qty. Only /1 per EA is unambiguously a
      // per-unit dealer cost; other pack/quantity bases must not be guessed.
      const unitPriced = read("/Qty") === "/1" && read("Per") === "EA";
      results.push(
        buildResult({
          supplier: this.id,
          searchedPartNumber: normalizedPartNumber,
          partNumber,
          supplierSku,
          description: cleanText(read("Description")),
          brand: cleanText(read("Brand"), 100),
          dealerCost: unitPriced ? parseMoney(read("Net")) : null,
          listPrice: unitPriced ? parseMoney(read("SRP")) : null,
          currency: null,
          stockStatus,
          quantityAvailable,
          eta: null,
        }),
      );
    }

    return results;
  }
}
