import { createAdminClient } from "@/lib/supabase/admin";
import { WesternMarineAdapter } from "@/lib/suppliers/adapters/western-marine";
import { MarinePartsSupplyAdapter } from "@/lib/suppliers/adapters/marine-parts-supply";
import { toSupplierError } from "@/lib/suppliers/errors";
import { packageEvidence } from "@/lib/suppliers/package-pricing";
import { isValidSearchQuery, normalizePartNumber, partNumbersMatch } from "@/lib/suppliers/normalize";
import type { SupplierId, SupplierPartResult } from "@/lib/suppliers/types";

export interface SupplierPriceWatch {
  id: string;
  inventory_item_id: string;
  supplier_code: SupplierId;
  query_part_number: string;
  expected_part_number: string;
  expected_supplier_sku: string | null;
  confirmed_currency: string | null;
  active: boolean;
  last_attempted_at: string | null;
}

export function findCatalogueMatch(results: SupplierPartResult[], query: string) {
  const matches = results.filter((result) =>
    partNumbersMatch(result.partNumber, query) ||
    (result.supplierSku !== null && partNumbersMatch(result.supplierSku, query))
  );
  return matches.length === 1 ? matches[0] : null;
}

function findWatchedPart(results: SupplierPartResult[], watch: SupplierPriceWatch) {
  const matches = results.filter((result) =>
    result.partNumber === watch.expected_part_number &&
    result.supplierSku === watch.expected_supplier_sku &&
    (partNumbersMatch(result.partNumber, watch.query_part_number) ||
      (result.supplierSku !== null &&
        partNumbersMatch(result.supplierSku, watch.query_part_number)))
  );
  return matches.length === 1 ? matches[0] : null;
}

export const priceWatchAdapters = {
  westernmarine: new WesternMarineAdapter(),
  marinepartssupply: new MarinePartsSupplyAdapter(),
} as const;

export async function checkSupplierPriceWatch(watch: SupplierPriceWatch) {
  const admin = createAdminClient();
  try {
    const adapter = priceWatchAdapters[watch.supplier_code as keyof typeof priceWatchAdapters];
    if (!adapter) throw new Error("Unsupported supplier price watch.");
    const result = findWatchedPart(await adapter.searchPart(watch.query_part_number), watch);
    if (!result) {
      throw new Error("The supplier no longer returns the same exact part and catalogue code.");
    }
    if (result.currency && watch.confirmed_currency &&
        result.currency !== watch.confirmed_currency) {
      throw new Error("Supplier price currency conflicts with the confirmed account currency.");
    }
    const [{ data: item, error: itemError }, { data: stored, error: watchError }] = await Promise.all([
      admin.from("inventory_items").select("sku, unit").eq("id", watch.inventory_item_id).single(),
      admin.from("supplier_price_watches").select("supplier_units_per_pack").eq("id", watch.id).single(),
    ]);
    if (itemError || watchError || !item || !stored) throw new Error("Price-watch mapping could not be verified.");
    const evidence = item.sku.toUpperCase() === result.partNumber.toUpperCase()
      ? packageEvidence(watch.supplier_code, result.partNumber, result.description)
      : null;
    if (evidence && ["ea", "each"].includes(item.unit.trim().toLowerCase())) {
      if (stored.supplier_units_per_pack !== null && Number(stored.supplier_units_per_pack) !== evidence.units) {
        throw new Error("Supplier package size conflicts with the verified price-watch quantity.");
      }
      if (stored.supplier_units_per_pack === null) {
        const { error: packageError } = await admin.from("supplier_price_watches")
          .update({ supplier_units_per_pack: evidence.units, pack_source: evidence.source })
          .eq("id", watch.id).is("supplier_units_per_pack", null);
        if (packageError) throw new Error(packageError.message);
      }
    }
    const { data, error } = await admin.rpc("record_supplier_price_check", {
      p_watch_id: watch.id,
      p_part_number: result.partNumber,
      p_supplier_sku: result.supplierSku,
      p_dealer_cost: result.dealerCost,
      p_list_price: result.listPrice,
      p_currency: result.currency,
      p_checked_at: result.checkedAt,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, alert: Boolean(data), message: null };
  } catch (caught) {
    const message = caught instanceof Error &&
      (caught.message.startsWith("The supplier") ||
        caught.message.startsWith("Supplier price currency") ||
        caught.message.startsWith("Supplier package size") ||
        caught.message.startsWith("Price-watch mapping"))
      ? caught.message
      : toSupplierError(watch.supplier_code, caught).userMessage;
    await admin.from("supplier_price_watches").update({
      last_attempted_at: new Date().toISOString(),
      last_error: message.slice(0, 400),
    }).eq("id", watch.id);
    return { ok: false as const, alert: false, message };
  }
}

export async function runDueSupplierPriceChecks(limit = 40) {
  const admin = createAdminClient();
  const dueBefore = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("supplier_price_watches")
    .select("id, inventory_item_id, supplier_code, query_part_number, expected_part_number, expected_supplier_sku, confirmed_currency, active, last_attempted_at, inventory_items!inner(active, quantity_on_hand)")
    .eq("active", true)
    .eq("inventory_items.active", true)
    .gt("inventory_items.quantity_on_hand", 0)
    .or(`last_attempted_at.is.null,last_attempted_at.lt.${dueBefore}`)
    .order("last_attempted_at", { ascending: true, nullsFirst: true })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error(error.message);

  let checked = 0;
  let alerts = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const result = await checkSupplierPriceWatch(row as unknown as SupplierPriceWatch);
    if (result.ok) {
      checked++;
      if (result.alert) alerts++;
    } else {
      failed++;
    }
  }
  return { checked, alerts, failed };
}

/** Slowly link stocked items whose SKU is exactly a signed-in MPS catalogue part number. */
export async function discoverMarinePartsSupplyWatches(limit = 10) {
  const admin = createAdminClient();
  const { data: candidates, error } = await admin.rpc("supplier_price_discovery_candidates", {
    p_limit: Math.min(Math.max(limit, 1), 20),
  });
  if (error) throw new Error(error.message);
  const { data: setting } = await admin.from("supplier_price_currency_settings")
    .select("currency, confirmed_by, confirmed_at")
    .eq("supplier_code", "marinepartssupply").maybeSingle();
  let linked = 0;
  let noMatch = 0;
  let failed = 0;

  for (const item of candidates ?? []) {
    const query = normalizePartNumber(item.sku);
    if (!isValidSearchQuery(query)) continue;
    try {
      const match = findCatalogueMatch(
        await priceWatchAdapters.marinepartssupply.searchPart(query), query,
      );
      if (!match || !partNumbersMatch(match.partNumber, item.sku)) {
        await admin.from("supplier_price_discovery_attempts").upsert({
          inventory_item_id: item.item_id,
          supplier_code: "marinepartssupply",
          last_status: "no_match",
          last_error: null,
          last_attempted_at: new Date().toISOString(),
        });
        noMatch++;
        continue;
      }
      const { data: watch, error: insertError } = await admin.from("supplier_price_watches")
        .insert({
          inventory_item_id: item.item_id,
          supplier_code: "marinepartssupply",
          query_part_number: query,
          expected_part_number: match.partNumber,
          expected_supplier_sku: match.supplierSku,
          confirmed_currency: setting?.currency ?? null,
          currency_confirmed_by: setting?.confirmed_by ?? null,
          currency_confirmed_at: setting?.confirmed_at ?? null,
        })
        .select("id, inventory_item_id, supplier_code, query_part_number, expected_part_number, expected_supplier_sku, confirmed_currency, active, last_attempted_at")
        .single();
      if (insertError?.code === "23505") continue;
      if (insertError || !watch) throw new Error(insertError?.message ?? "Could not create exact price watch.");
      linked++;
      const checked = await checkSupplierPriceWatch(watch as SupplierPriceWatch);
      if (!checked.ok) failed++;
    } catch (caught) {
      failed++;
      const message = toSupplierError("marinepartssupply", caught).userMessage;
      await admin.from("supplier_price_discovery_attempts").upsert({
        inventory_item_id: item.item_id,
        supplier_code: "marinepartssupply",
        last_status: "error",
        last_error: message.slice(0, 400),
        last_attempted_at: new Date().toISOString(),
      });
      // Portal authentication or availability failures should not fan out to every candidate.
      break;
    }
  }
  return { linked, noMatch, failed };
}
