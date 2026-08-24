"use client";

import { useActionState } from "react";
import { recordInvoicePaymentAction } from "@/lib/actions/billing";
import {
  INITIAL_BILLING_ACTION_STATE,
  INVOICE_PAYMENT_METHODS,
  INVOICE_PAYMENT_TYPES,
} from "@/lib/billing";

export function InvoicePaymentForm({
  invoiceId,
  balanceDue,
  paymentDate,
}: {
  invoiceId: string;
  balanceDue: number;
  paymentDate: string;
}) {
  const record = recordInvoicePaymentAction.bind(null, invoiceId);
  const [state, action, pending] = useActionState(
    record,
    INITIAL_BILLING_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";
  return (
    <form action={action} className="rounded border border-rule bg-paper p-5">
      <h3 className="font-display text-lg font-medium text-ink">Record money received</h3>
      <p className="mt-1 text-sm text-graph">Deposits and payments both reduce the invoice balance.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium text-ink">
          Type
          <select name="payment_type" defaultValue="payment" disabled={pending} className={inputClass}>
            {INVOICE_PAYMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Date
          <input name="payment_date" type="date" defaultValue={paymentDate} required disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Amount (CAD)
          <input name="amount" type="number" min="0.01" max={balanceDue} step="0.01" defaultValue={balanceDue.toFixed(2)} required disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Method
          <select name="method" defaultValue="e_transfer" disabled={pending} className={inputClass}>
            {INVOICE_PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Reference
          <input name="reference" placeholder="Cheque or transfer #" disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Note
          <input name="note" disabled={pending} className={inputClass} />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {pending ? "Recording…" : "Record payment"}
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
