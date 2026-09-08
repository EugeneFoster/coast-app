import "server-only";

import { after } from "next/server";
import { pushInventoryItemToXero } from "@/lib/xero/inventory-sync";

const pendingItems = new Set<string>();

/** Push a CRM catalogue change after the response so saving never waits on Xero. */
export function scheduleXeroItemPush(itemId: string) {
  if (pendingItems.has(itemId)) return;
  pendingItems.add(itemId);

  after(async () => {
    try {
      const result = await pushInventoryItemToXero(itemId);
      if (!result.synced) console.error("[xero-auto-push]", itemId, result.message);
    } catch (error) {
      console.error("[xero-auto-push]", itemId, error);
    } finally {
      pendingItems.delete(itemId);
    }
  });
}
