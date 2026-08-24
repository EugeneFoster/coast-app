"use client";

import { useActionState } from "react";
import { addPurchaseOrderItemAction } from "@/lib/actions/inventory";
import type { InventoryItemOption } from "@/lib/inventory-data";
import { INITIAL_INVENTORY_ACTION_STATE } from "@/lib/inventory";

export function PurchaseOrderItemForm({
  purchaseOrderId,
  items,
}: {
  purchaseOrderId: string;
  items: InventoryItemOption[];
}) {
  const submit = addPurchaseOrderItemAction.bind(null, purchaseOrderId);
  const [state, action, pending] = useActionState(
    submit,
    INITIAL_INVENTORY_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="space-y-4">
      {state.message && (
        <p
          aria-live="polite"
          className={`rounded border px-3 py-2 text-sm ${
            state.status === "error"
              ? "border-weld/40 bg-weld/10 text-weld"
              : "border-rule bg-bone text-ink"
          }`}
        >
          {state.message}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-medium text-ink md:col-span-2">
          Inventory item
          <select name="inventory_item_id" required defaultValue="" disabled={pending} className={inputClass}>
            <option value="" disabled>
              Select item…
            </option>
            {items
              .filter((item) => item.active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} · {item.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Quantity
          <input
            name="quantity"
            type="number"
            min="0.001"
            step="0.001"
            required
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Unit cost (CAD)
          <input
            name="unit_cost"
            type="number"
            min="0"
            step="0.0001"
            required
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-2">
          Supplier part number
          <input name="supplier_sku" disabled={pending} className={inputClass} />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending || items.every((item) => !item.active)}
        className="btn-secondary px-4 py-2 text-sm disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add line"}
      </button>
    </form>
  );
}
