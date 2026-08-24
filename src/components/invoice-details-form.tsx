"use client";

import { useActionState } from "react";
import { updateInvoiceAction } from "@/lib/actions/billing";
import { INITIAL_BILLING_ACTION_STATE } from "@/lib/billing";
import type { Invoice } from "@/lib/types";

export function InvoiceDetailsForm({ invoice }: { invoice: Invoice }) {
  const update = updateInvoiceAction.bind(null, invoice.id);
  const [state, action, pending] = useActionState(
    update,
    INITIAL_BILLING_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="rounded border border-rule bg-paper p-6">
      <h2 className="font-display text-xl font-medium text-ink">Invoice details</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-ink md:col-span-2">
          Title
          <input name="title" defaultValue={invoice.title} required disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Issue date
          <input name="issue_date" type="date" defaultValue={invoice.issue_date} required disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Due date
          <input name="due_date" type="date" defaultValue={invoice.due_date ?? ""} disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Tax rate (%)
          <input name="tax_rate_percent" type="number" min="0" max="100" step="0.001" defaultValue={invoice.tax_rate_percent} required disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Discount (CAD)
          <input name="discount_amount" type="number" min="0" step="0.01" defaultValue={invoice.discount_amount} required disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-2">
          Customer notes
          <textarea name="notes" rows={3} defaultValue={invoice.notes ?? ""} disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-2">
          Terms
          <textarea name="terms" rows={4} defaultValue={invoice.terms ?? ""} disabled={pending} className={inputClass} />
        </label>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {pending ? "Saving…" : "Save invoice"}
        </button>
        {state.message && (
          <p className={`text-sm ${state.status === "error" ? "text-weld" : "text-graph"}`} aria-live="polite">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
