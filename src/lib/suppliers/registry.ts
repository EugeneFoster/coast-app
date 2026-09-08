import { MarinePartsSupplyAdapter } from "@/lib/suppliers/adapters/marine-parts-supply";
import { MercuryAdapter } from "@/lib/suppliers/adapters/mercury";
import { WesternMarineAdapter } from "@/lib/suppliers/adapters/western-marine";
import { SUPPLIER_IDS, type SupplierAdapter, type SupplierId } from "@/lib/suppliers/types";

/**
 * The supplier registry.
 *
 * Adapters are module-level singletons so that authenticated sessions survive
 * between requests (the app runs as a long-lived Node container). Adding a
 * supplier means writing one adapter and adding one line here — the search API,
 * the UI, the approval workflow and the Xero seam are all supplier-agnostic and
 * need no changes.
 */
const registry: Record<SupplierId, SupplierAdapter> = {
  mercury: new MercuryAdapter(),
  marinepartssupply: new MarinePartsSupplyAdapter(),
  westernmarine: new WesternMarineAdapter(),
};

export type SupplierRegistry = Readonly<Record<SupplierId, SupplierAdapter>>;

export function getSupplierRegistry(): SupplierRegistry {
  return registry;
}

export function getSupplierAdapter(id: SupplierId): SupplierAdapter {
  return registry[id];
}

/**
 * The suppliers a search hits when the caller does not narrow the list. This is
 * server-defined: a request may only ever *subset* it, never extend it.
 */
export const DEFAULT_SUPPLIER_IDS: readonly SupplierId[] = SUPPLIER_IDS;

export function listSupplierAdapters(): SupplierAdapter[] {
  return SUPPLIER_IDS.map((id) => registry[id]);
}

export async function closeAllSupplierAdapters(): Promise<void> {
  await Promise.allSettled(listSupplierAdapters().map((adapter) => adapter.close()));
}
