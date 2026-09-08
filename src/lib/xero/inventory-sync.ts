import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyInventoryItem } from "@/lib/inventory-classifier";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InventoryItem } from "@/lib/types";
import { markXeroConnection, xeroRequest } from "@/lib/xero/client";

interface XeroItemDetails {
  UnitPrice?: number;
  AccountCode?: string;
  COGSAccountCode?: string;
}

interface XeroItem {
  ItemID: string;
  Code: string;
  Name?: string;
  Description?: string;
  PurchaseDescription?: string;
  IsSold?: boolean;
  IsPurchased?: boolean;
  IsTrackedAsInventory?: boolean;
  InventoryAssetAccountCode?: string;
  QuantityOnHand?: number;
  TotalCostPool?: number;
  SalesDetails?: XeroItemDetails;
  PurchaseDetails?: XeroItemDetails;
  UpdatedDateUTC?: string;
  Status?: string;
  ValidationErrors?: Array<{ Message?: string }>;
}

interface XeroItemsResponse {
  Items?: XeroItem[];
}

export interface InventorySyncResult {
  imported: number;
  updated: number;
  conflicts: number;
  failed: number;
}

function xeroDate(value?: string) {
  if (!value) return null;
  const dotNet = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(value);
  const date = dotNet ? new Date(Number(dotNet[1])) : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function averageCost(item: XeroItem) {
  const quantity = numberOrZero(item.QuantityOnHand);
  const total = numberOrZero(item.TotalCostPool);
  if (quantity > 0 && total >= 0) return total / quantity;
  return numberOrZero(item.PurchaseDetails?.UnitPrice);
}

function cleanCode(value: string) {
  return value.trim().toUpperCase().slice(0, 100);
}

async function startRun(supabase: SupabaseClient, userId: string, direction: "pull" | "push") {
  const { data } = await supabase
    .from("integration_sync_runs")
    .insert({ integration: "xero", direction, status: "running", started_by: userId })
    .select("id")
    .single();
  return data?.id as string | undefined;
}

async function finishRun(
  supabase: SupabaseClient,
  runId: string | undefined,
  status: "succeeded" | "partial" | "failed",
  result: Partial<InventorySyncResult>,
  error?: string,
) {
  if (!runId) return;
  await supabase
    .from("integration_sync_runs")
    .update({
      status,
      imported_count: result.imported ?? 0,
      updated_count: result.updated ?? 0,
      failed_count: (result.failed ?? 0) + (result.conflicts ?? 0),
      details: { conflicts: result.conflicts ?? 0 },
      error_message: error ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

async function readAllXeroItems() {
  const all: XeroItem[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const payload = await xeroRequest<XeroItemsResponse>(`/Items?page=${page}`);
    const batch = Array.isArray(payload.Items) ? payload.Items : [];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

export async function pullInventoryFromXero(
  supabase: SupabaseClient,
  userId: string,
): Promise<InventorySyncResult> {
  const runId = await startRun(supabase, userId, "pull");
  const result: InventorySyncResult = { imported: 0, updated: 0, conflicts: 0, failed: 0 };
  try {
    const xeroItems = await readAllXeroItems();
    for (const xeroItem of xeroItems) {
      const sku = cleanCode(xeroItem.Code ?? "");
      if (!sku || !xeroItem.ItemID) {
        result.failed += 1;
        continue;
      }
      const name = (xeroItem.Name || xeroItem.Description || sku).trim().slice(0, 255);
      const description = (xeroItem.Description || xeroItem.PurchaseDescription || "").trim() || null;
      const category = classifyInventoryItem(name, description, sku);
      const tracked = xeroItem.IsTrackedAsInventory === true;
      const xeroUpdatedAt = xeroDate(xeroItem.UpdatedDateUTC);

      let { data: existing } = await supabase
        .from("inventory_items")
        .select("id, xero_sync_status")
        .eq("xero_item_id", xeroItem.ItemID)
        .maybeSingle();
      if (!existing) {
        const bySku = await supabase
          .from("inventory_items")
          .select("id, xero_sync_status")
          .eq("sku", sku)
          .maybeSingle();
        existing = bySku.data;
      }

      if (existing && ["pending_push", "failed", "conflict"].includes(existing.xero_sync_status)) {
        await supabase
          .from("inventory_items")
          .update({ xero_sync_status: "conflict", xero_sync_error: "Changed in CRM and Xero before synchronization." })
          .eq("id", existing.id);
        result.conflicts += 1;
        continue;
      }

      const master = {
        sku,
        name,
        description,
        category,
        unit: "ea",
        selling_price: xeroItem.SalesDetails?.UnitPrice ?? null,
        active: xeroItem.Status !== "DELETED",
        ...(!existing ? { source: "xero" } : {}),
        xero_item_id: xeroItem.ItemID,
        xero_is_tracked: tracked,
        xero_sales_account_code: xeroItem.SalesDetails?.AccountCode ?? null,
        xero_purchase_account_code: xeroItem.PurchaseDetails?.COGSAccountCode ?? xeroItem.PurchaseDetails?.AccountCode ?? null,
        xero_inventory_asset_account_code: xeroItem.InventoryAssetAccountCode ?? null,
        xero_updated_at: xeroUpdatedAt,
        xero_synced_at: new Date().toISOString(),
        xero_sync_status: "synced",
        xero_sync_error: null,
      };

      if (!existing) {
        const { error } = await supabase.from("inventory_items").insert({
          ...master,
          quantity_on_hand: tracked ? numberOrZero(xeroItem.QuantityOnHand) : 0,
          average_cost: tracked ? averageCost(xeroItem) : numberOrZero(xeroItem.PurchaseDetails?.UnitPrice),
          reorder_point: 0,
          created_by: userId,
        });
        if (error) result.failed += 1;
        else result.imported += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from("inventory_items")
        .update(master)
        .eq("id", existing.id);
      if (updateError) {
        result.failed += 1;
        continue;
      }
      if (tracked) {
        const { error: quantityError } = await supabase.rpc("reconcile_inventory_from_xero", {
          p_inventory_item_id: existing.id,
          p_quantity: numberOrZero(xeroItem.QuantityOnHand),
          p_average_cost: averageCost(xeroItem),
          p_xero_updated_at: xeroUpdatedAt,
        });
        if (quantityError) {
          await supabase
            .from("inventory_items")
            .update({ xero_sync_status: "failed", xero_sync_error: quantityError.message })
            .eq("id", existing.id);
          result.failed += 1;
          continue;
        }
      }
      result.updated += 1;
    }

    const partial = result.failed > 0 || result.conflicts > 0;
    await finishRun(supabase, runId, partial ? "partial" : "succeeded", result);
    await markXeroConnection({
      last_item_pull_at: new Date().toISOString(),
      last_success_at: partial ? undefined : new Date().toISOString(),
      last_error: partial ? `${result.failed} failed, ${result.conflicts} conflicted.` : null,
    });
    return result;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Xero inventory pull failed.";
    await finishRun(supabase, runId, "failed", result, message);
    await markXeroConnection({ last_error: message });
    throw caught;
  }
}

function xeroPayload(item: InventoryItem) {
  const payload: Record<string, unknown> = {
    ...(item.xero_item_id ? { ItemID: item.xero_item_id } : {}),
    Code: item.sku,
    Name: item.name.slice(0, 50),
    Description: item.description ?? item.name,
    PurchaseDescription: item.description ?? item.name,
    IsSold: true,
    IsPurchased: true,
    SalesDetails: {
      UnitPrice: item.selling_price ?? 0,
      ...(item.xero_sales_account_code ? { AccountCode: item.xero_sales_account_code } : {}),
    },
    PurchaseDetails: {
      UnitPrice: item.average_cost,
      ...(item.xero_purchase_account_code ? { COGSAccountCode: item.xero_purchase_account_code } : {}),
    },
  };
  if (item.xero_is_tracked) {
    payload.IsTrackedAsInventory = true;
    if (item.xero_inventory_asset_account_code) {
      payload.InventoryAssetAccountCode = item.xero_inventory_asset_account_code;
    }
  }
  return payload;
}

export async function pushInventoryItemToXero(itemId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Inventory item not found.");
  const item = data as InventoryItem;

  try {
    if (item.sku.length > 30) {
      throw new Error("Xero item codes are limited to 30 characters; shorten this SKU before syncing.");
    }
    const response = await xeroRequest<XeroItemsResponse>("/Items", {
      method: "POST",
      headers: { "Idempotency-Key": `inventory-${item.id}-${Date.now()}` },
      body: JSON.stringify({ Items: [xeroPayload(item)] }),
    });
    const saved = response.Items?.[0];
    const validation = saved?.ValidationErrors?.map((entry) => entry.Message).filter(Boolean).join(" ");
    if (!saved?.ItemID || validation) throw new Error(validation || "Xero did not return the saved item.");
    await supabase
      .from("inventory_items")
      .update({
        xero_item_id: saved.ItemID,
        xero_updated_at: xeroDate(saved.UpdatedDateUTC),
        xero_synced_at: new Date().toISOString(),
        xero_sync_status: "synced",
        xero_sync_error: null,
      })
      .eq("id", item.id);
    await markXeroConnection({
      last_item_push_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: null,
    });
    return { synced: true as const };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Xero item push failed.";
    await supabase
      .from("inventory_items")
      .update({ xero_sync_status: "failed", xero_sync_error: message })
      .eq("id", item.id);
    await markXeroConnection({ last_error: message });
    return { synced: false as const, message };
  }
}
