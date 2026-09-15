import Link from "next/link";
import { requirePurchasingViewer } from "@/lib/auth";
import { WesternMarineAdapter } from "@/lib/suppliers/adapters/western-marine";
import { toSupplierError } from "@/lib/suppliers/errors";
import { isValidSearchQuery, normalizePartNumber, partNumbersMatch } from "@/lib/suppliers/normalize";
import type { SupplierPartResult } from "@/lib/suppliers/types";

const adapter = new WesternMarineAdapter();

function amount(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-CA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
}

export default async function WesternMarineLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requirePurchasingViewer();
  const params = await searchParams;
  const rawQuery = typeof params.q === "string" ? params.q.trim() : "";
  const query = rawQuery ? normalizePartNumber(rawQuery) : "";
  let results: SupplierPartResult[] = [];
  let error: string | null = null;

  if (rawQuery && !isValidSearchQuery(rawQuery)) {
    error = "Enter a part number or catalogue code between 2 and 64 characters.";
  } else if (query) {
    try {
      results = await adapter.searchPart(query);
    } catch (caught) {
      error = toSupplierError("westernmarine", caught).userMessage;
    }
  }

  return (
    <main className="mt-7 max-w-5xl">
      <Link href="/inventory/suppliers" className="text-sm text-graph hover:text-ink">
        ← Suppliers
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">Western Marine parts</h2>
          <p className="mt-1 max-w-2xl text-sm text-graph">
            Search the dealer catalogue by manufacturer part number or Western Marine code.
            Results are read-only; no inventory or prices are changed.
          </p>
        </div>
        <a
          href="https://westernmarine.com/dealer-login/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-graph underline-offset-4 hover:text-ink hover:underline"
        >
          Open dealer portal ↗
        </a>
      </div>

      <form method="get" className="mt-6 flex flex-wrap gap-3 rounded border border-rule bg-paper p-4">
        <label htmlFor="western-marine-query" className="sr-only">
          Part number or catalogue code
        </label>
        <input
          id="western-marine-query"
          name="q"
          type="search"
          defaultValue={rawQuery}
          placeholder="e.g. 18-7420 or 560375"
          maxLength={64}
          required
          className="min-w-64 flex-1 rounded border border-rule bg-canvas px-3 py-2 text-sm text-ink"
        />
        <button type="submit" className="btn-primary px-5 py-2 text-sm">
          Search parts
        </button>
      </form>

      {error && (
        <div role="alert" className="mt-5 rounded border border-weld/30 bg-weld/5 p-4 text-sm text-ink">
          {error}
        </div>
      )}

      {query && !error && results.length === 0 && (
        <p className="mt-6 rounded border border-rule bg-paper p-5 text-sm text-graph">
          No exact part-number or catalogue-code match found for {query}. The portal may show
          nearby items, but they are not interchangeable parts.
        </p>
      )}

      {results.length > 0 && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-graph">
            {results.length} match{results.length === 1 ? "" : "es"} for {query}
          </p>
          {results.map((result) => {
            const catalogueMatch =
              !result.exactMatch &&
              result.supplierSku &&
              partNumbersMatch(result.supplierSku, query);
            return (
              <article
                key={`${result.partNumber}-${result.supplierSku ?? ""}`}
                className="rounded border border-rule bg-paper p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-graph">
                      {result.exactMatch ? "Manufacturer part match" : catalogueMatch ? "Catalogue code match" : "Related item"}
                    </p>
                    <h3 className="mt-1 font-display text-xl text-ink">{result.partNumber}</h3>
                    <p className="mt-1 text-sm text-graph">{result.description ?? "No description"}</p>
                  </div>
                  <span className="rounded bg-ink/5 px-3 py-1 text-xs text-ink">
                    {result.quantityAvailable === null
                      ? "Availability unknown"
                      : `${result.quantityAvailable} available`}
                  </span>
                </div>
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-4">
                  <div><dt className="text-graph">Brand</dt><dd className="mt-1 text-ink">{result.brand ?? "—"}</dd></div>
                  <div><dt className="text-graph">Western Marine code</dt><dd className="mt-1 font-mono text-ink">{result.supplierSku ?? "—"}</dd></div>
                  <div><dt className="text-graph">Net</dt><dd className="mt-1 text-ink">{amount(result.dealerCost)}</dd></div>
                  <div><dt className="text-graph">SRP</dt><dd className="mt-1 text-ink">{amount(result.listPrice)}</dd></div>
                </dl>
                <p className="mt-4 text-xs text-graph">
                  Price currency is not confirmed. Net and SRP are shown only when the portal states /1 per EA.
                </p>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
