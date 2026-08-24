"use client";

import { useActionState } from "react";
import { addInvoiceItemAction } from "@/lib/actions/billing";
import { INITIAL_BILLING_ACTION_STATE } from "@/lib/billing";
import { ESTIMATE_ITEM_TYPES } from "@/lib/sales";

export function InvoiceItemForm({ invoiceId }: { invoiceId: string }) {
  const addItem = addInvoiceItemAction.bind(null, invoiceId);
  const [state, action, pending] = useActionState(
    addItem,
    INITIAL_BILLING_ACTION_STATE,
  );
  const inputClass =
    "w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";
  return (
    <form action={action} className="rounded border border-dashed border-rule p-4 print-hidden">
      <div className="grid gap-3 lg:grid-cols-[9rem_1fr_6rem_6rem_8rem_auto]">
        <select name="item_type" defaultValue="labor" disabled={pending} className={inputClass} aria-label="Line type">
          {ESTIMATE_ITEM_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <input name="description" required placeholder="Description" disabled={pending} className={inputClass} aria-label="Description" />
        <input name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required disabled={pending} className={inputClass} aria-label="Quantity" />
        <input name="unit" defaultValue="hr" required disabled={pending} className={inputClass} aria-label="Unit" />
        <input name="unit_price" type="number" min="0" step="0.01" placeholder="Unit price" required disabled={pending} className={inputClass} aria-label="Unit price" />
        <button type="submit" disabled={pending} className="btn-primary whitespace-nowrap px-4 py-2 text-sm disabled:opacity-50">
          {pending ? "Adding…" : "Add line"}
        </button>
      </div>
      {state.message && (
        <p className={`mt-2 text-sm ${state.status === "error" ? "text-weld" : "text-graph"}`} aria-live="polite">
          {state.message}
        </p>
      )}
    </form>
  );
}
