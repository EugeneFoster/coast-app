"use server";

import { revalidatePath } from "next/cache";
import { requireInventoryManager } from "@/lib/auth";
import { checkSupplierPriceWatch, findCatalogueMatch, priceWatchAdapters, type SupplierPriceWatch } from "@/lib/suppliers/price-watch";
import { requiresPriceAlertReview } from "@/lib/suppliers/price-alert-review";
import { toSupplierError } from "@/lib/suppliers/errors";
import { isValidSearchQuery, normalizePartNumber, partNumbersMatch } from "@/lib/suppliers/normalize";
import { createClient } from "@/lib/supabase/server";

export type PriceWatchActionState = { status: "idle" | "success" | "error"; message: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function refresh(itemId?: string) {
  revalidatePath("/inventory", "layout");
  if (itemId) revalidatePath(`/inventory/items/${itemId}`);
}

export async function createSupplierPriceWatchAction(
  itemId: string,
  _previous: PriceWatchActionState,
  formData: FormData,
): Promise<PriceWatchActionState> {
  const { user } = await requireInventoryManager();
  if (!UUID_RE.test(itemId)) return { status: "error", message: "Invalid inventory item." };
  const rawQuery = String(formData.get("part_number") ?? "").trim();
  if (!isValidSearchQuery(rawQuery)) {
    return { status: "error", message: "Enter an exact part number or catalogue code." };
  }
  const query = normalizePartNumber(rawQuery);
  const supplierCode = String(formData.get("supplier_code") ?? "");
  if (supplierCode !== "westernmarine" && supplierCode !== "marinepartssupply") {
    return { status: "error", message: "Select a supported supplier." };
  }
  const adapter = priceWatchAdapters[supplierCode];
  const currency = String(formData.get("confirmed_currency") ?? "");
  if (currency && currency !== "CAD" && currency !== "USD") {
    return { status: "error", message: "Select a valid account currency." };
  }
  if (currency && formData.get("confirm_currency") !== "on") {
    return { status: "error", message: "Confirm the dealer account currency before using it for price suggestions." };
  }

  const supabase = await createClient();
  const { data: item } = await supabase.from("inventory_items")
    .select("id, sku, active, quantity_on_hand")
    .eq("id", itemId).maybeSingle();
  if (!item || !item.active || Number(item.quantity_on_hand) <= 0) {
    return { status: "error", message: "Only an active item currently on hand can be watched." };
  }

  let match;
  try {
    match = findCatalogueMatch(await adapter.searchPart(query), query);
  } catch (caught) {
    return { status: "error", message: toSupplierError(supplierCode, caught).userMessage };
  }
  if (!match) {
    return { status: "error", message: "The dealer portal did not return one unambiguous exact part/code match." };
  }
  if (match.currency && currency && match.currency !== currency) {
    return { status: "error", message: "The portal currency does not match your confirmation." };
  }
  const skuMatches = partNumbersMatch(item.sku, match.partNumber) ||
    (match.supplierSku !== null && partNumbersMatch(item.sku, match.supplierSku));
  if (!skuMatches && formData.get("confirm_mapping") !== "on") {
    return { status: "error", message: "The stock SKU differs. Confirm that this is the same product before linking it." };
  }

  const { data: watch, error } = await supabase.from("supplier_price_watches")
    .insert({
      inventory_item_id: itemId,
      supplier_code: supplierCode,
      query_part_number: query,
      expected_part_number: match.partNumber,
      expected_supplier_sku: match.supplierSku,
      confirmed_currency: currency || match.currency || null,
      currency_confirmed_by: currency ? user.id : null,
      currency_confirmed_at: currency ? new Date().toISOString() : null,
      mapping_confirmed_by: skuMatches ? null : user.id,
      created_by: user.id,
    }).select("id, inventory_item_id, supplier_code, query_part_number, expected_part_number, expected_supplier_sku, confirmed_currency, active, last_attempted_at")
    .single();
  if (error || !watch) {
    return { status: "error", message: error?.code === "23505"
      ? "This item is already watched."
      : error?.message ?? "Could not create price watch." };
  }
  const firstCheck = await checkSupplierPriceWatch(watch as SupplierPriceWatch);
  refresh(itemId);
  return firstCheck.ok
    ? { status: "success", message: "Price watch created and initial supplier price recorded." }
    : { status: "success", message: `Watch created, but first check failed: ${firstCheck.message}` };
}

export async function checkSupplierPriceWatchAction(
  watchId: string,
  _previous: PriceWatchActionState,
): Promise<PriceWatchActionState> {
  await requireInventoryManager();
  if (!UUID_RE.test(watchId)) return { status: "error", message: "Invalid price watch." };
  const supabase = await createClient();
  const { data: watch } = await supabase.from("supplier_price_watches")
    .select("id, inventory_item_id, supplier_code, query_part_number, expected_part_number, expected_supplier_sku, confirmed_currency, active, last_attempted_at")
    .eq("id", watchId).maybeSingle();
  if (!watch || !watch.active) return { status: "error", message: "Price watch is inactive." };
  const result = await checkSupplierPriceWatch(watch as SupplierPriceWatch);
  refresh(watch.inventory_item_id);
  return result.ok
    ? { status: "success", message: result.alert ? "Supplier price checked; an alert is open." : "Supplier price checked; no increase detected." }
    : { status: "error", message: result.message ?? "Could not check supplier price." };
}

export async function confirmPriceWatchCurrencyAction(
  watchId: string,
  _previous: PriceWatchActionState,
  formData: FormData,
): Promise<PriceWatchActionState> {
  const { user } = await requireInventoryManager();
  if (!UUID_RE.test(watchId)) return { status: "error", message: "Invalid price watch." };
  const currency = String(formData.get("currency") ?? "");
  if ((currency !== "CAD" && currency !== "USD") || formData.get("confirm") !== "on") {
    return { status: "error", message: "Select and explicitly confirm the dealer account currency." };
  }
  const supabase = await createClient();
  const { data: watch, error } = await supabase.from("supplier_price_watches")
    .update({ confirmed_currency: currency, currency_confirmed_by: user.id, currency_confirmed_at: new Date().toISOString() })
    .eq("id", watchId)
    .select("id, inventory_item_id, supplier_code, query_part_number, expected_part_number, expected_supplier_sku, confirmed_currency, active, last_attempted_at")
    .maybeSingle();
  if (error || !watch) return { status: "error", message: error?.message ?? "Price watch not found." };
  const result = await checkSupplierPriceWatch(watch as SupplierPriceWatch);
  refresh(watch.inventory_item_id);
  return result.ok
    ? { status: "success", message: `Account currency confirmed as ${currency}; supplier price checked.` }
    : { status: "error", message: result.message ?? "Currency saved but price check failed." };
}

export async function confirmSupplierAccountCurrencyAction(
  supplierCode: "westernmarine" | "marinepartssupply",
  _previous: PriceWatchActionState,
  formData: FormData,
): Promise<PriceWatchActionState> {
  const { user } = await requireInventoryManager();
  if (supplierCode !== "westernmarine" && supplierCode !== "marinepartssupply") {
    return { status: "error", message: "Unsupported supplier." };
  }
  const currency = String(formData.get("currency") ?? "");
  if ((currency !== "CAD" && currency !== "USD") || formData.get("confirm") !== "on") {
    return { status: "error", message: "Select and explicitly verify the dealer account currency." };
  }
  const supabase = await createClient();
  const { data: existing } = await supabase.from("supplier_price_currency_settings")
    .select("currency").eq("supplier_code", supplierCode).maybeSingle();
  if (existing && existing.currency !== currency) {
    return { status: "error", message: "This account was confirmed in another currency. Review existing watches before changing it." };
  }
  const now = new Date().toISOString();
  const { error } = await supabase.from("supplier_price_currency_settings").upsert({
    supplier_code: supplierCode,
    currency,
    confirmed_by: user.id,
    confirmed_at: now,
  });
  if (error) return { status: "error", message: error.message };
  const { error: watchesError } = await supabase.from("supplier_price_watches").update({
    confirmed_currency: currency,
    currency_confirmed_by: user.id,
    currency_confirmed_at: now,
    last_attempted_at: null,
  }).eq("supplier_code", supplierCode).is("confirmed_currency", null);
  if (watchesError) return { status: "error", message: watchesError.message };
  refresh();
  return { status: "success", message: `${currency} confirmed for this dealer account. Existing unconfirmed watches will be rechecked automatically.` };
}

export async function decideSupplierPriceAlertAction(
  alertId: string,
  decision: "approve" | "dismiss",
  _previous: PriceWatchActionState,
  formData: FormData,
): Promise<PriceWatchActionState> {
  await requireInventoryManager();
  if (!UUID_RE.test(alertId)) return { status: "error", message: "Invalid alert." };
  const supabase = await createClient();
  const { data: before } = await supabase.from("supplier_price_alerts")
    .select("id, watch_id, inventory_item_id, status, dealer_cost, list_price, package_units, pack_check_required, current_selling_price, suggested_selling_price, supplier_checked_at")
    .eq("id", alertId).maybeSingle();
  if (!before || before.status !== "open") {
    return { status: "error", message: "This alert is no longer open." };
  }

  if (decision === "approve") {
    if (before.pack_check_required) {
      return { status: "error", message: "The supplier package quantity must be verified before approving a selling price." };
    }
    if (before.suggested_selling_price === null) {
      return { status: "error", message: "No verified per-unit CAD price proposal is available." };
    }
    if (requiresPriceAlertReview(before.current_selling_price,
      before.dealer_cost === null ? null : before.dealer_cost / (before.package_units ?? 1),
      before.suggested_selling_price) &&
        formData.get("confirm_item_review") !== "on") {
      return { status: "error", message: "Review this item's SKU and selling unit before approving the large price change." };
    }
    const { data: watch } = await supabase.from("supplier_price_watches")
      .select("id, inventory_item_id, supplier_code, query_part_number, expected_part_number, expected_supplier_sku, confirmed_currency, active, last_attempted_at")
      .eq("id", before.watch_id).maybeSingle();
    if (!watch || !watch.active) return { status: "error", message: "Price watch is inactive." };
    const fresh = await checkSupplierPriceWatch(watch as SupplierPriceWatch);
    if (!fresh.ok) return { status: "error", message: fresh.message ?? "Supplier recheck failed." };
    const { data: after } = await supabase.from("supplier_price_alerts")
      .select("status, dealer_cost, list_price, package_units, pack_check_required, suggested_selling_price")
      .eq("id", alertId).maybeSingle();
    if (!after || after.status !== "open" ||
        Number(after.dealer_cost) !== Number(before.dealer_cost) ||
        Number(after.list_price) !== Number(before.list_price) ||
        Number(after.package_units) !== Number(before.package_units) ||
        after.pack_check_required !== before.pack_check_required ||
        Number(after.suggested_selling_price) !== Number(before.suggested_selling_price)) {
      refresh(before.inventory_item_id);
      return { status: "error", message: "The supplier price or proposal changed. Review the updated alert before approving." };
    }
  }

  const { data, error } = await supabase.rpc("decide_supplier_price_alert", {
    p_alert_id: alertId,
    p_decision: decision,
  });
  if (error) return { status: "error", message: error.message };
  refresh(before.inventory_item_id);
  if (data === "approved") return { status: "success", message: "Selling price updated. Historical purchase cost was not changed." };
  if (data === "dismissed") return { status: "success", message: "Price alert dismissed." };
  return { status: "error", message: "The alert became stale. Review the item and check the supplier again." };
}
