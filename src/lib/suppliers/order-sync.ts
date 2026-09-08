import "server-only";

import { classifyInventoryItem } from "@/lib/inventory-classifier";
import { getSupplierRegistry } from "@/lib/suppliers/registry";
import type { SupplierInboundOrder, SupplierPartResult } from "@/lib/suppliers/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getXeroStatus } from "@/lib/xero/client";
import { pushInventoryItemToXero } from "@/lib/xero/inventory-sync";

export interface SupplierOrderSyncResult {
  ordersImported: number;
  ordersUpdated: number;
  itemsCreated: number;
  itemsEnriched: number;
  failed: number;
}

async function enrichMissingImages(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("inventory_items")
    .select("id, sku, image_url, manufacturer, product_url")
    .eq("active", true)
    .is("image_url", null)
    .order("updated_at", { ascending: true })
    .limit(40);
  const candidates = data ?? [];
  const adapter = getSupplierRegistry().marinepartssupply;
  let enriched = 0;
  for (let start = 0; start < candidates.length; start += 4) {
    const batch = candidates.slice(start, start + 4);
    const rows = await Promise.all(batch.map(async (item) => {
      try {
        return [item, await adapter.getPartDetails(item.sku)] as const;
      } catch {
        return [item, null] as const;
      }
    }));
    for (const [item, detail] of rows) {
      if (!detail || (!detail.imageUrl && !detail.manufacturer && !detail.productUrl)) continue;
      const { error } = await supabase.from("inventory_items").update({
        image_url: detail.imageUrl ?? item.image_url,
        manufacturer: detail.manufacturer ?? item.manufacturer,
        product_url: detail.productUrl ?? item.product_url,
      }).eq("id", item.id);
      if (!error) enriched += 1;
    }
  }
  return enriched;
}

function day(value: string) {
  return value.slice(0, 10);
}

async function ensureSupplier(supabase: SupabaseClient, userId: string) {
  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .ilike("name", "Marine Parts Supply")
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name: "Marine Parts Supply",
      website: "https://marinepartssupply.com",
      notes: "Connected supplier catalogue and inbound-order feed.",
      active: true,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create supplier.");
  return data.id as string;
}

async function catalogueDetails(orders: SupplierInboundOrder[]) {
  const adapter = getSupplierRegistry().marinepartssupply;
  const partNumbers = [...new Set(orders.flatMap((order) => order.items.map((item) => item.partNumber)))];
  const details = new Map<string, SupplierPartResult>();
  for (let start = 0; start < partNumbers.length; start += 5) {
    const batch = partNumbers.slice(start, start + 5);
    const rows = await Promise.all(batch.map(async (partNumber) => {
      try {
        return [partNumber, await adapter.getPartDetails(partNumber)] as const;
      } catch {
        return [partNumber, null] as const;
      }
    }));
    for (const [partNumber, detail] of rows) if (detail) details.set(partNumber, detail);
  }
  return details;
}

async function ensureInventoryItem(
  supabase: SupabaseClient,
  supplierId: string,
  userId: string,
  line: SupplierInboundOrder["items"][number],
  detail: SupplierPartResult | undefined,
) {
  const sku = line.partNumber.trim().toUpperCase();
  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id, image_url, product_url, manufacturer, preferred_supplier_id")
    .eq("sku", sku)
    .maybeSingle();
  if (existing) {
    const enrichment: Record<string, unknown> = {};
    if (!existing.image_url && detail?.imageUrl) enrichment.image_url = detail.imageUrl;
    if (!existing.product_url && detail?.productUrl) enrichment.product_url = detail.productUrl;
    if (!existing.manufacturer && detail?.manufacturer) enrichment.manufacturer = detail.manufacturer;
    if (!existing.preferred_supplier_id) enrichment.preferred_supplier_id = supplierId;
    if (Object.keys(enrichment).length) {
      await supabase.from("inventory_items").update(enrichment).eq("id", existing.id);
    }
    return { id: existing.id as string, created: false };
  }

  const name = detail?.description || line.description || sku;
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      sku,
      name: name.slice(0, 255),
      description: detail?.description ?? line.description,
      category: classifyInventoryItem(name, detail?.manufacturer, sku),
      unit: "ea",
      quantity_on_hand: 0,
      average_cost: detail?.dealerCost ?? line.unitPrice,
      selling_price: detail?.listPrice ?? null,
      reorder_point: 0,
      preferred_supplier_id: supplierId,
      manufacturer: detail?.manufacturer,
      image_url: detail?.imageUrl,
      product_url: detail?.productUrl,
      source: "marinepartssupply",
      active: true,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? `Could not create ${sku}.`);
  return { id: data.id as string, created: true };
}

export async function syncMarinePartsSupplyOrders(
  supabase: SupabaseClient,
  userId: string,
): Promise<SupplierOrderSyncResult> {
  const result: SupplierOrderSyncResult = {
    ordersImported: 0,
    ordersUpdated: 0,
    itemsCreated: 0,
    itemsEnriched: 0,
    failed: 0,
  };
  const { data: run } = await supabase
    .from("integration_sync_runs")
    .insert({
      integration: "marinepartssupply",
      direction: "pull",
      status: "running",
      started_by: userId,
    })
    .select("id")
    .single();

  try {
    const adapter = getSupplierRegistry().marinepartssupply;
    if (!adapter.listInboundOrders) throw new Error("Supplier order feed is unavailable.");
    const orders = (await adapter.listInboundOrders()).filter((order) => order.items.length > 0);
    const supplierId = await ensureSupplier(supabase, userId);
    const details = await catalogueDetails(orders);
    const createdItemIds: string[] = [];

    for (const order of orders) {
      try {
        let { data: purchaseOrder } = await supabase
          .from("purchase_orders")
          .select("id, status")
          .eq("external_source", "marinepartssupply")
          .eq("external_order_id", order.externalId)
          .maybeSingle();

        const orderValues = {
          supplier_id: supplierId,
          external_source: "marinepartssupply",
          external_order_id: order.externalId,
          external_order_number: order.orderNumber,
          shipping_status: order.status,
          carrier_name: order.carrierName,
          tracking_number: order.trackingNumber,
          tracking_url: order.trackingUrl,
          shipped_at: order.shippedAt,
          supplier_synced_at: new Date().toISOString(),
          supplier_sync_error: null,
          order_date: day(order.orderedAt),
          notes: `Imported from Marine Parts Supply${order.purchaseOrderNumber ? ` · supplier PO ${order.purchaseOrderNumber}` : ""}`,
        };

        if (!purchaseOrder) {
          const inserted = await supabase
            .from("purchase_orders")
            .insert({ ...orderValues, status: "draft", created_by: userId })
            .select("id, status")
            .single();
          if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? "Could not import order.");
          purchaseOrder = inserted.data;
          result.ordersImported += 1;
        } else {
          const updated = await supabase
            .from("purchase_orders")
            .update(orderValues)
            .eq("id", purchaseOrder.id);
          if (updated.error) throw new Error(updated.error.message);
          result.ordersUpdated += 1;
        }

        if (purchaseOrder.status === "draft") {
          for (const line of order.items) {
            const item = await ensureInventoryItem(
              supabase,
              supplierId,
              userId,
              line,
              details.get(line.partNumber),
            );
            if (item.created) {
              result.itemsCreated += 1;
              createdItemIds.push(item.id);
            }
            const detail = details.get(line.partNumber);
            const { error } = await supabase.from("purchase_order_items").upsert({
              purchase_order_id: purchaseOrder.id,
              inventory_item_id: item.id,
              external_line_id: line.externalLineId,
              supplier_sku: line.partNumber,
              description: line.description,
              quantity: line.quantity,
              unit: "ea",
              unit_cost: detail?.dealerCost ?? line.unitPrice,
              image_url: detail?.imageUrl,
              product_url: detail?.productUrl,
            }, { onConflict: "purchase_order_id,inventory_item_id" });
            if (error) throw new Error(error.message);
          }
          if (order.items.length > 0) {
            const { error } = await supabase
              .from("purchase_orders")
              .update({ status: "ordered" })
              .eq("id", purchaseOrder.id);
            if (error) throw new Error(error.message);
          }
        }
      } catch {
        result.failed += 1;
      }
    }

    result.itemsEnriched = await enrichMissingImages(supabase);

    if ((await getXeroStatus()).connected) {
      for (const itemId of createdItemIds) {
        await supabase.from("inventory_items").update({ xero_sync_status: "pending_push" }).eq("id", itemId);
        await pushInventoryItemToXero(itemId);
      }
    }

    const status = result.failed ? "partial" : "succeeded";
    if (run?.id) {
      await supabase.from("integration_sync_runs").update({
        status,
        imported_count: result.ordersImported + result.itemsCreated,
        updated_count: result.ordersUpdated,
        failed_count: result.failed,
        details: result,
        completed_at: new Date().toISOString(),
      }).eq("id", run.id);
    }
    return result;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Supplier order sync failed.";
    if (run?.id) {
      await supabase.from("integration_sync_runs").update({
        status: "failed",
        failed_count: 1,
        error_message: message,
        completed_at: new Date().toISOString(),
      }).eq("id", run.id);
    }
    throw caught;
  }
}
