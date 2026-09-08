"use server";

import { revalidatePath } from "next/cache";
import { requireInventoryManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncMarinePartsSupplyOrders } from "@/lib/suppliers/order-sync";
import { pullRecentInventoryFromXero } from "@/lib/xero/inventory-sync";

let inFlight: Promise<{ changed: boolean }> | null = null;

async function runAutomaticSync(userId: string) {
  const supabase = createAdminClient();
  const xero = await pullRecentInventoryFromXero(supabase, userId);

  const { data: latestSupplierRun } = await supabase
    .from("integration_sync_runs")
    .select("started_at")
    .eq("integration", "marinepartssupply")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const supplierDue = !latestSupplierRun?.started_at
    || Date.now() - new Date(latestSupplierRun.started_at).getTime() >= 5 * 60_000;
  const supplier = supplierDue
    ? await syncMarinePartsSupplyOrders(supabase, userId)
    : null;

  const xeroChanged = Boolean(
    xero.result
      && (xero.result.imported || xero.result.updated || xero.result.conflicts || xero.result.failed),
  );
  const supplierChanged = Boolean(
    supplier
      && (supplier.ordersImported || supplier.itemsCreated || supplier.itemsEnriched || supplier.failed),
  );
  const changed = xeroChanged || supplierChanged;
  if (changed) {
    revalidatePath("/inventory");
    revalidatePath("/inventory/purchase-orders");
  }
  return { changed };
}

export async function automaticInventorySyncAction() {
  const { user } = await requireInventoryManager();
  if (inFlight) return { ok: true, changed: false };

  const attempt = runAutomaticSync(user.id);
  inFlight = attempt;
  try {
    return { ok: true, ...(await attempt) };
  } catch (error) {
    console.error("[automatic-inventory-sync]", error);
    return { ok: false, changed: false };
  } finally {
    if (inFlight === attempt) inFlight = null;
  }
}
