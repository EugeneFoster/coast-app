"use server";

import { revalidatePath } from "next/cache";
import { requireInventoryManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pullInventoryFromXero, pushInventoryItemToXero } from "@/lib/xero/inventory-sync";

export async function syncXeroInventoryAction() {
  const { user } = await requireInventoryManager();
  const supabase = await createClient();
  try {
    const result = await pullInventoryFromXero(supabase, user.id);
    revalidatePath("/inventory");
    return {
      ok: true,
      message: `Xero synced: ${result.imported} imported, ${result.updated} updated${result.conflicts ? `, ${result.conflicts} conflicts` : ""}${result.failed ? `, ${result.failed} failed` : ""}.`,
    };
  } catch (caught) {
    return { ok: false, message: caught instanceof Error ? caught.message : "Xero sync failed." };
  }
}

export async function retryXeroItemAction(itemId: string) {
  await requireInventoryManager();
  const result = await pushInventoryItemToXero(itemId);
  revalidatePath("/inventory");
  revalidatePath(`/inventory/items/${itemId}`);
  return result;
}

