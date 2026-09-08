"use server";

import { revalidatePath } from "next/cache";
import { requireInventoryManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { syncMarinePartsSupplyOrders } from "@/lib/suppliers/order-sync";

export async function syncSupplierOrdersAction() {
  const { user } = await requireInventoryManager();
  const supabase = await createClient();
  try {
    const result = await syncMarinePartsSupplyOrders(supabase, user.id);
    revalidatePath("/inventory");
    revalidatePath("/inventory/purchase-orders");
    return {
      ok: true,
      message: `Supplier data synced: ${result.ordersImported} new orders, ${result.itemsCreated} new items, ${result.itemsEnriched} catalogue cards enriched${result.failed ? `, ${result.failed} failed` : ""}.`,
    };
  } catch (caught) {
    return { ok: false, message: caught instanceof Error ? caught.message : "Supplier sync failed." };
  }
}
