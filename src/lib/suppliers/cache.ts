import type { SupplierId, SupplierPartResult } from "@/lib/suppliers/types";

/**
 * A deliberately short-lived lookup cache.
 *
 * Pricing and availability go stale quickly, so this exists only to keep a
 * burst of repeated lookups (a user re-opening the same panel, several people
 * checking the same number) off the supplier portals. Cached entries keep the
 * original `checkedAt`, so the UI always tells the truth about how old the data
 * is, and any flow that is about to change financial data re-checks rather than
 * trusting the cache — see `revalidateSupplierResult` in `./search`.
 *
 * Process-local by design; the app runs as a long-lived container.
 */

const TTL_MS = 3 * 60 * 1000;
const MAX_ENTRIES = 500;

interface CacheEntry {
  results: SupplierPartResult[];
  storedAt: number;
}

const store = new Map<string, CacheEntry>();

function keyFor(supplier: SupplierId, normalizedQuery: string) {
  return `${supplier}::${normalizedQuery}`;
}

function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  // Map preserves insertion order, so the oldest key is first.
  const oldest = store.keys().next();
  if (!oldest.done) store.delete(oldest.value);
}

export function readCachedResults(
  supplier: SupplierId,
  normalizedQuery: string,
): SupplierPartResult[] | null {
  const key = keyFor(supplier, normalizedQuery);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.results;
}

export function writeCachedResults(
  supplier: SupplierId,
  normalizedQuery: string,
  results: SupplierPartResult[],
) {
  const key = keyFor(supplier, normalizedQuery);
  // Refresh insertion order so hot keys survive eviction.
  store.delete(key);
  store.set(key, { results, storedAt: Date.now() });
  evictIfNeeded();
}

export function invalidateSupplierCache(supplier?: SupplierId) {
  if (!supplier) {
    store.clear();
    return;
  }
  const prefix = `${supplier}::`;
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export const SUPPLIER_CACHE_TTL_MS = TTL_MS;
