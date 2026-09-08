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

interface ExistingInventoryItem {
  id: string;
  sku: string;
  xero_item_id: string | null;
  xero_sync_status: InventoryItem["xero_sync_status"];
  quantity_on_hand: number;
  average_cost: number;
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

function chunks<T>(values: T[], size = 200) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
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

async function readExistingInventory(supabase: SupabaseClient) {
  const items: ExistingInventoryItem[] = [];
  for (let offset = 0; ; offset += 1_000) {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, sku, xero_item_id, xero_sync_status, quantity_on_hand, average_cost")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(`Could not read the CRM inventory: ${error.message}`);
    const batch = (data ?? []) as ExistingInventoryItem[];
    items.push(...batch);
    if (batch.length < 1_000) break;
  }
  return items;
}

async function insertInventoryRows(
  supabase: SupabaseClient,
  rows: Array<Record<string, unknown>>,
) {
  let succeeded = 0;
  let failed = 0;
  for (const batch of chunks(rows)) {
    const { error } = await supabase.from("inventory_items").insert(batch);
    if (!error) {
      succeeded += batch.length;
      continue;
    }
    for (const row of batch) {
      const { error: rowError } = await supabase.from("inventory_items").insert(row);
      if (rowError) failed += 1;
      else succeeded += 1;
    }
  }
  return { succeeded, failed };
}

async function updateInventoryRows(
  supabase: SupabaseClient,
  rows: Array<Record<string, unknown> & { id: string }>,
) {
  let succeeded = 0;
  let failed = 0;
  for (const batch of chunks(rows)) {
    const { error } = await supabase.from("inventory_items").upsert(batch, { onConflict: "id" });
    if (!error) {
      succeeded += batch.length;
      continue;
    }
    for (const row of batch) {
      const { id, ...values } = row;
      const { error: rowError } = await supabase.from("inventory_items").update(values).eq("id", id);
      if (rowError) failed += 1;
      else succeeded += 1;
    }
  }
  return { succeeded, failed };
}

export async function pullInventoryFromXero(
  supabase: SupabaseClient,
  userId: string,
): Promise<InventorySyncResult> {
  const runId = await startRun(supabase, userId, "pull");
  const result: InventorySyncResult = { imported: 0, updated: 0, conflicts: 0, failed: 0 };
  try {
    const [xeroItems, existingItems] = await Promise.all([
      readAllXeroItems(),
      readExistingInventory(supabase),
    ]);
    const byXeroId = new Map(existingItems.filter((item) => item.xero_item_id).map((item) => [item.xero_item_id!, item]));
    const bySku = new Map(existingItems.map((item) => [item.sku.trim().toUpperCase(), item]));
    const seenNewSkus = new Set<string>();
    const newRows: Array<Record<string, unknown>> = [];
    const existingRows: Array<Record<string, unknown> & { id: string }> = [];
    const trackedExisting: Array<{ existing: ExistingInventoryItem; item: XeroItem; xeroUpdatedAt: string | null }> = [];
    const conflictIds: string[] = [];

    for (const xeroItem of xeroItems) {
      const sku = cleanCode(xeroItem.Code ?? "");
      if (!sku || !xeroItem.ItemID) {
        result.failed += 1;
        continue;
      }
      const name = (xeroItem.Name || xeroItem.Description || sku).trim().slice(0, 255) || sku;
      const description = (xeroItem.Description || xeroItem.PurchaseDescription || "").trim() || null;
      const category = classifyInventoryItem(name, description, sku);
      const tracked = xeroItem.IsTrackedAsInventory === true;
      const xeroUpdatedAt = xeroDate(xeroItem.UpdatedDateUTC);

      const existing = byXeroId.get(xeroItem.ItemID) ?? bySku.get(sku);

      if (existing && ["pending_push", "failed", "conflict"].includes(existing.xero_sync_status)) {
        conflictIds.push(existing.id);
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
        if (seenNewSkus.has(sku)) {
          result.failed += 1;
          continue;
        }
        seenNewSkus.add(sku);
        newRows.push({
          ...master,
          quantity_on_hand: tracked ? numberOrZero(xeroItem.QuantityOnHand) : 0,
          average_cost: tracked ? averageCost(xeroItem) : numberOrZero(xeroItem.PurchaseDetails?.UnitPrice),
          reorder_point: 0,
          created_by: userId,
        });
        continue;
      }

      existingRows.push({ id: existing.id, ...master });
      if (tracked) {
        const quantity = numberOrZero(xeroItem.QuantityOnHand);
        const cost = averageCost(xeroItem);
        if (Number(existing.quantity_on_hand) !== quantity || Number(existing.average_cost) !== cost) {
          trackedExisting.push({ existing, item: xeroItem, xeroUpdatedAt });
        }
      }
    }

    for (const ids of chunks(conflictIds)) {
      const { error } = await supabase
        .from("inventory_items")
        .update({ xero_sync_status: "conflict", xero_sync_error: "Changed in CRM and Xero before synchronization." })
        .in("id", ids);
      if (error) result.failed += ids.length;
    }

    const inserted = await insertInventoryRows(supabase, newRows);
    result.imported += inserted.succeeded;
    result.failed += inserted.failed;

    const updated = await updateInventoryRows(supabase, existingRows);
    result.updated += updated.succeeded;
    result.failed += updated.failed;

    for (const { existing, item, xeroUpdatedAt } of trackedExisting) {
      const { error: quantityError } = await supabase.rpc("reconcile_inventory_from_xero", {
        p_inventory_item_id: existing.id,
        p_quantity: numberOrZero(item.QuantityOnHand),
        p_average_cost: averageCost(item),
        p_xero_updated_at: xeroUpdatedAt,
      });
      if (quantityError) {
        await supabase
          .from("inventory_items")
          .update({ xero_sync_status: "failed", xero_sync_error: quantityError.message })
          .eq("id", existing.id);
        result.failed += 1;
      }
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
