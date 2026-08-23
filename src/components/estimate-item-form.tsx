"use client";

import { useActionState } from "react";
import {
  addEstimateItemAction,
} from "@/lib/actions/sales";
import { ESTIMATE_ITEM_TYPES, INITIAL_SALES_ACTION_STATE } from "@/lib/sales";

export function EstimateItemForm({
  opportunityId,
  estimateId,
}: {
  opportunityId: string;
  estimateId: string;
}) {
  const addItem = addEstimateItemAction.bind(null, opportunityId, estimateId);
  const [state, action, pending] = useActionState(
    addItem,
    INITIAL_SALES_ACTION_STATE,
  );
  const inputClass =
    "w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="rounded border border-dashed border-rule p-4 print-hidden">
      <div className="grid gap-3 lg:grid-cols-[9rem_1fr_6rem_6rem_8rem_auto]">
        <select
          name="item_type"
          defaultValue="labor"
          disabled={pending}
          className={inputClass}
          aria-label="Line item type"
        >
          {ESTIMATE_ITEM_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <input
          name="description"
          required
          placeholder="Description"
          disabled={pending}
          className={inputClass}
          aria-label="Line item description"
        />
        <input
          name="quantity"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue="1"
          required
          disabled={pending}
          className={inputClass}
          aria-label="Quantity"
        />
        <input
          name="unit"
          defaultValue="hr"
          required
          disabled={pending}
          className={inputClass}
          aria-label="Unit"
        />
        <input
          name="unit_price"
          type="number"
          min="0"
          step="0.01"
          placeholder="Unit price"
          required
          disabled={pending}
          className={inputClass}
          aria-label="Unit price"
        />
        <button
          type="submit"
          disabled={pending}
          className="btn-primary whitespace-nowrap px-4 py-2 text-sm disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add item"}
        </button>
      </div>
      {state.message && (
        <p
          className={`mt-2 text-sm ${state.status === "error" ? "text-weld" : "text-graph"}`}
          aria-live="polite"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
