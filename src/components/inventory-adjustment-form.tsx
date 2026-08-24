"use client";

import { useActionState } from "react";
import { adjustInventoryAction } from "@/lib/actions/inventory";
import { INITIAL_INVENTORY_ACTION_STATE } from "@/lib/inventory";

export function InventoryAdjustmentForm({
  itemId,
  unit,
}: {
  itemId: string;
  unit: string;
}) {
  const submit = adjustInventoryAction.bind(null, itemId);
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
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink">
          Direction
          <select name="direction" defaultValue="in" disabled={pending} className={inputClass}>
            <option value="in">Add stock</option>
            <option value="out">Remove stock</option>
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Quantity ({unit})
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
        <label className="text-sm font-medium text-ink sm:col-span-2">
          Unit cost for additions (CAD)
          <input
            name="unit_cost"
            type="number"
            min="0"
            step="0.0001"
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink sm:col-span-2">
          Reason
          <input name="note" required disabled={pending} className={inputClass} />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="btn-secondary px-4 py-2 text-sm disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record adjustment"}
      </button>
    </form>
  );
}
