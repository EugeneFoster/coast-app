import { readCachedResults, writeCachedResults } from "@/lib/suppliers/cache";
import { toSupplierError } from "@/lib/suppliers/errors";
import { logSupplier, logSupplierError } from "@/lib/suppliers/log";
import { normalizePartNumber, sortResults } from "@/lib/suppliers/normalize";
import { DEFAULT_SUPPLIER_IDS, getSupplierRegistry, type SupplierRegistry } from "@/lib/suppliers/registry";
import {
  SUPPLIER_LABELS,
  type SupplierId,
  type SupplierPartResult,
  type SupplierSearchOutcome,
  type SupplierSearchResponse,
  type SupplierSearchStatus,
} from "@/lib/suppliers/types";

/**
 * Parallel supplier search.
 *
 * Every supplier runs concurrently and is isolated: a Mercury timeout cannot
 * stop Western Marine results from reaching the user. Each supplier gets its
 * own deadline, so one hung portal never holds the CRM request open.
 */

export const DEFAULT_SUPPLIER_TIMEOUT_MS = 15_000;

export interface SupplierSearchOptions {
  query: string;
  /** Subset of the server-defined supplier list. Never extends it. */
  suppliers?: readonly SupplierId[];
  /** Skip the short-lived cache. Used before acting on a financial change. */
  forceFresh?: boolean;
  perSupplierTimeoutMs?: number;
  /** Injectable for tests; defaults to the real registry. */
  registry?: SupplierRegistry;
  signal?: AbortSignal;
}

async function searchOne(
  supplierId: SupplierId,
  normalizedQuery: string,
  options: Required<Pick<SupplierSearchOptions, "forceFresh" | "perSupplierTimeoutMs">> & {
    registry: SupplierRegistry;
    signal?: AbortSignal;
  },
): Promise<SupplierSearchOutcome> {
  const startedAt = Date.now();
  const adapter = options.registry[supplierId];
  const supplierName = SUPPLIER_LABELS[supplierId];
  const capabilities = adapter.capabilities;

  const finish = (
    status: SupplierSearchStatus,
    results: SupplierPartResult[],
    message: string | null,
    cached: boolean,
  ): SupplierSearchOutcome => ({
    supplier: supplierId,
    supplierName,
    status,
    message,
    results,
    capabilities,
    cached,
    checkedAt: results[0]?.checkedAt ?? new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  });

  if (!options.forceFresh) {
    const cached = readCachedResults(supplierId, normalizedQuery);
    if (cached) {
      logSupplier({
        supplier: supplierId,
        operation: "part_search",
        status: "success",
        partNumber: normalizedQuery,
        resultCount: cached.length,
        durationMs: Date.now() - startedAt,
        cached: true,
      });
      return finish(cached.length > 0 ? "success" : "not_found", cached, null, true);
    }
  }

  // Per-supplier deadline, combined with any caller-level abort.
  const deadline = AbortSignal.timeout(options.perSupplierTimeoutMs);
  const signal = options.signal
    ? AbortSignal.any([deadline, options.signal])
    : deadline;

  try {
    const results = await adapter.searchPart(normalizedQuery, signal);
    const sorted = sortResults(results);
    writeCachedResults(supplierId, normalizedQuery, sorted);
    logSupplier({
      supplier: supplierId,
      operation: "part_search",
      status: sorted.length > 0 ? "success" : "not_found",
      partNumber: normalizedQuery,
      resultCount: sorted.length,
      durationMs: Date.now() - startedAt,
      cached: false,
    });
    return finish(sorted.length > 0 ? "success" : "not_found", sorted, null, false);
  } catch (caught) {
    const error = toSupplierError(supplierId, caught);
    logSupplierError({
      supplier: supplierId,
      operation: "part_search",
      status: "error",
      partNumber: normalizedQuery,
      durationMs: Date.now() - startedAt,
      code: error.code,
      detail: error.internalDetail ?? undefined,
    });
    return finish(error.searchStatus, [], error.userMessage, false);
  }
}

export async function searchSuppliers(
  options: SupplierSearchOptions,
): Promise<SupplierSearchResponse> {
  const registry = options.registry ?? getSupplierRegistry();
  const normalizedQuery = normalizePartNumber(options.query);

  // Intersect with the server-defined list so a request can never introduce a
  // supplier (or a URL) of its own.
  const requested = options.suppliers ?? DEFAULT_SUPPLIER_IDS;
  const supplierIds = DEFAULT_SUPPLIER_IDS.filter((id) => requested.includes(id));

  const settled = await Promise.allSettled(
    supplierIds.map((id) =>
      searchOne(id, normalizedQuery, {
        forceFresh: options.forceFresh ?? false,
        perSupplierTimeoutMs: options.perSupplierTimeoutMs ?? DEFAULT_SUPPLIER_TIMEOUT_MS,
        registry,
        signal: options.signal,
      }),
    ),
  );

  const outcomes: SupplierSearchOutcome[] = settled.map((entry, index) => {
    if (entry.status === "fulfilled") return entry.value;
    // searchOne catches its own failures; this is a belt-and-braces path so a
    // programming error in one adapter still cannot break the whole response.
    const supplierId = supplierIds[index];
    const error = toSupplierError(supplierId, entry.reason);
    logSupplierError({
      supplier: supplierId,
      operation: "part_search",
      status: "error",
      partNumber: normalizedQuery,
      code: error.code,
      detail: error.internalDetail ?? undefined,
    });
    return {
      supplier: supplierId,
      supplierName: SUPPLIER_LABELS[supplierId],
      status: error.searchStatus,
      message: error.userMessage,
      results: [],
      capabilities: registry[supplierId].capabilities,
      cached: false,
      checkedAt: new Date().toISOString(),
      durationMs: 0,
    };
  });

  const supplierStatus: Record<string, SupplierSearchStatus> = {};
  for (const outcome of outcomes) supplierStatus[outcome.supplier] = outcome.status;

  return {
    query: options.query,
    normalizedQuery,
    results: sortResults(outcomes.flatMap((outcome) => outcome.results)),
    supplierStatus,
    outcomes,
  };
}

/**
 * Re-read a single part straight from the supplier, bypassing the cache.
 *
 * This is what the approval flow calls before executing an approved change, so
 * that a decision made on a five-minute-old price is verified against the
 * portal rather than replayed blindly.
 */
export async function revalidateSupplierResult(
  supplier: SupplierId,
  partNumber: string,
  options: { registry?: SupplierRegistry; timeoutMs?: number } = {},
): Promise<SupplierPartResult | null> {
  const registry = options.registry ?? getSupplierRegistry();
  const normalized = normalizePartNumber(partNumber);
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_SUPPLIER_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const result = await registry[supplier].getPartDetails(normalized, signal);
    logSupplier({
      supplier,
      operation: "part_revalidate",
      status: result ? "success" : "not_found",
      partNumber: normalized,
      durationMs: Date.now() - startedAt,
      cached: false,
    });
    return result;
  } catch (caught) {
    const error = toSupplierError(supplier, caught);
    logSupplierError({
      supplier,
      operation: "part_revalidate",
      status: "error",
      partNumber: normalized,
      durationMs: Date.now() - startedAt,
      code: error.code,
      detail: error.internalDetail ?? undefined,
    });
    throw error;
  }
}
