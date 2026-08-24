"use client";

import { useActionState } from "react";
import { receivePurchaseOrderItemAction } from "@/lib/actions/inventory";
import { INITIAL_INVENTORY_ACTION_STATE } from "@/lib/inventory";

export function ReceivePurchaseOrderItemForm({
  purchaseOrderId,
  lineId,
  remaining,
  unit,
}: {
  purchaseOrderId: string;
  lineId: string;
  remaining: number;
  unit: string;
}) {
  const submit = receivePurchaseOrderItemAction.bind(
    null,
    purchaseOrderId,
    lineId,
  );
  const [state, action, pending] = useActionState(
    submit,
    INITIAL_INVENTORY_ACTION_STATE,
  );

  return (
    <form action={action} className="mt-3 rounded border border-rule bg-bone p-3">
      {state.message && (
        <p
          aria-live="polite"
          className={`mb-3 text-xs ${state.status === "error" ? "text-weld" : "text-ink"}`}
        >
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-32 flex-1 text-xs font-medium text-ink">
          Receive ({unit})
          <input
            name="quantity"
            type="number"
            min="0.001"
            max={remaining}
            step="0.001"
            defaultValue={remaining}
            required
            disabled={pending}
            className="mt-1 w-full rounded border border-rule bg-paper px-2 py-1.5 text-sm"
          />
        </label>
        <label className="min-w-44 flex-[2] text-xs font-medium text-ink">
          Delivery note
          <input
            name="note"
            disabled={pending}
            className="mt-1 w-full rounded border border-rule bg-paper px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary px-3 py-1.5 text-xs disabled:opacity-60"
        >
          {pending ? "Receiving…" : "Receive"}
        </button>
      </div>
    </form>
  );
}
