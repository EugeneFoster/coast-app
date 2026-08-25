"use client";

import { useActionState } from "react";
import { createPaintJobInvoiceAction } from "@/lib/actions/paint-yard";
import { INITIAL_PAINT_YARD_ACTION_STATE } from "@/lib/paint-yard";

export function PaintJobInvoiceForm({
  jobId,
  issueDate,
  dueDate,
}: {
  jobId: string;
  issueDate: string;
  dueDate: string;
}) {
  const submit = createPaintJobInvoiceAction.bind(null, jobId);
  const [state, action, pending] = useActionState(submit, INITIAL_PAINT_YARD_ACTION_STATE);
  return (
    <form action={action} className="rounded border border-weld/40 bg-weld/5 p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-weld">Final billing</p>
      <h2 className="mt-2 font-display text-xl font-medium text-ink">Create invoice from accepted quote</h2>
      <p className="mt-2 text-sm leading-6 text-graph">Copies the approved scope, line items, tax, and terms. The paint job must be Ready.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-medium text-ink">Issue date<input name="issue_date" type="date" required defaultValue={issueDate} disabled={pending} className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm" /></label>
        <label className="text-xs font-medium text-ink">Due date<input name="due_date" type="date" required defaultValue={dueDate} disabled={pending} className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm" /></label>
        <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">{pending ? "Creating…" : "Create invoice"}</button>
      </div>
      {state.message && <p className="mt-3 text-xs text-weld" aria-live="polite">{state.message}</p>}
    </form>
  );
}
