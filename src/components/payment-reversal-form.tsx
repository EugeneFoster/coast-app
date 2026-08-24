"use client";

import { useActionState } from "react";
import { reverseInvoicePaymentAction } from "@/lib/actions/billing";
import { INITIAL_BILLING_ACTION_STATE } from "@/lib/billing";

export function PaymentReversalForm({ invoiceId, paymentId }: { invoiceId: string; paymentId: string }) {
  const reverse = reverseInvoicePaymentAction.bind(null, invoiceId, paymentId);
  const [state, action, pending] = useActionState(reverse, INITIAL_BILLING_ACTION_STATE);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2 print-hidden">
      <input
        name="reason"
        required
        placeholder="Correction reason"
        disabled={pending}
        className="min-w-52 flex-1 rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-weld focus:outline-none"
      />
      <button type="submit" disabled={pending} className="text-xs text-graph underline decoration-rule underline-offset-2 hover:text-weld disabled:opacity-50">
        {pending ? "Reversing…" : "Reverse"}
      </button>
      {state.message && <span className="w-full text-xs text-weld" aria-live="polite">{state.message}</span>}
    </form>
  );
}
