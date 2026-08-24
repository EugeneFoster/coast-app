"use client";

import { useActionState } from "react";
import { issueInventoryAction } from "@/lib/actions/inventory";
import type { InventoryItemOption } from "@/lib/inventory-data";
import {
  formatQuantity,
  INITIAL_INVENTORY_ACTION_STATE,
} from "@/lib/inventory";

export function InventoryIssueForm({
  projectId,
  workOrderId,
  items,
}: {
  projectId: string;
  workOrderId: string;
  items: InventoryItemOption[];
}) {
  const submit = issueInventoryAction.bind(null, projectId, workOrderId);
  const [state, action, pending] = useActionState(
    submit,
    INITIAL_INVENTORY_ACTION_STATE,
  );
  const availableItems = items.filter(
    (item) => item.active && Number(item.quantity_on_hand) > 0,
  );

  return (
    <form action={action} className="rounded border border-rule bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-medium text-ink">Issue from warehouse</h3>
          <p className="mt-1 text-xs text-graph">
            Stock and work-order material cost update in one transaction.
          </p>
        </div>
        <span className="rounded bg-ink/5 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-graph">
          Ledger controlled
        </span>
      </div>
      {state.message && (
        <p
          aria-live="polite"
          className={`mt-3 rounded border px-3 py-2 text-sm ${
            state.status === "error"
              ? "border-weld/40 bg-weld/10 text-weld"
              : "border-rule bg-bone text-ink"
          }`}
        >
          {state.message}
        </p>
      )}
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(16rem,2fr)_8rem_minmax(12rem,1fr)_auto] lg:items-end">
        <label className="text-xs font-medium text-ink">
          Inventory item
          <select
            name="inventory_item_id"
            required
            defaultValue=""
            disabled={pending}
            className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Select available stock…
            </option>
            {availableItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} · {item.name} · {formatQuantity(item.quantity_on_hand, item.unit)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-ink">
          Quantity
          <input
            name="quantity"
            type="number"
            min="0.001"
            step="0.001"
            required
            disabled={pending}
            className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-ink">
          Note
          <input
            name="note"
            disabled={pending}
            className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending || availableItems.length === 0}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {pending ? "Issuing…" : "Issue stock"}
        </button>
      </div>
      {availableItems.length === 0 && (
        <p className="mt-3 text-xs text-graph">No active items have available stock.</p>
      )}
    </form>
  );
}
