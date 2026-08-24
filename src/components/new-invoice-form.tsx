"use client";

import { useActionState } from "react";
import {
  createInvoiceAction,
  createInvoiceFromEstimateAction,
} from "@/lib/actions/billing";
import { INITIAL_BILLING_ACTION_STATE } from "@/lib/billing";
import type {
  BillingCustomerOption,
  BillingEstimateOption,
  BillingProjectOption,
} from "@/lib/billing-data";
import { formatCad } from "@/lib/sales";

export function NewInvoiceForm({
  customers,
  projects,
  estimates,
  issueDate,
  dueDate,
}: {
  customers: BillingCustomerOption[];
  projects: BillingProjectOption[];
  estimates: BillingEstimateOption[];
  issueDate: string;
  dueDate: string;
}) {
  const [estimateState, estimateAction, estimatePending] = useActionState(
    createInvoiceFromEstimateAction,
    INITIAL_BILLING_ACTION_STATE,
  );
  const [manualState, manualAction, manualPending] = useActionState(
    createInvoiceAction,
    INITIAL_BILLING_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form action={estimateAction} className="rounded border border-rule bg-paper p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-weld">Recommended</p>
        <h2 className="mt-2 font-display text-xl font-medium text-ink">
          From accepted quote
        </h2>
        <p className="mt-2 text-sm leading-6 text-graph">
          Copies the customer, project, line items, tax, discount, notes, and terms.
        </p>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-ink">
            Accepted quote
            <select
              name="estimate_id"
              required
              defaultValue=""
              disabled={estimatePending || estimates.length === 0}
              className={inputClass}
            >
              <option value="" disabled>
                {estimates.length ? "Select quote" : "No accepted quotes ready"}
              </option>
              {estimates.map((estimate) => (
                <option key={estimate.estimate_id} value={estimate.estimate_id}>
                  {estimate.estimate_number} · {estimate.client_name} · {formatCad(estimate.total)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-ink">
              Issue date
              <input
                name="issue_date"
                type="date"
                required
                defaultValue={issueDate}
                disabled={estimatePending}
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium text-ink">
              Due date
              <input
                name="due_date"
                type="date"
                defaultValue={dueDate}
                disabled={estimatePending}
                className={inputClass}
              />
            </label>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-4">
          <button
            type="submit"
            disabled={estimatePending || estimates.length === 0}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            {estimatePending ? "Creating…" : "Create invoice from quote"}
          </button>
          {estimateState.message && (
            <p className="text-sm text-weld" aria-live="polite">
              {estimateState.message}
            </p>
          )}
        </div>
      </form>

      <form action={manualAction} className="rounded border border-rule bg-paper p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-graph">Manual</p>
        <h2 className="mt-2 font-display text-xl font-medium text-ink">Blank invoice</h2>
        <p className="mt-2 text-sm leading-6 text-graph">
          Use for standalone service, parts sales, or work without an accepted quote.
        </p>
        <input type="hidden" name="discount_amount" value="0" />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-ink sm:col-span-2">
            Customer
            <select
              name="client_id"
              required
              defaultValue=""
              disabled={manualPending}
              className={inputClass}
            >
              <option value="" disabled>Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-ink sm:col-span-2">
            Project (optional)
            <select
              name="project_id"
              defaultValue=""
              disabled={manualPending}
              className={inputClass}
            >
              <option value="">No project / counter sale</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} · {project.client_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-ink sm:col-span-2">
            Invoice title
            <input
              name="title"
              required
              placeholder="Parts sale, repair deposit, dock installation…"
              disabled={manualPending}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium text-ink">
            Issue date
            <input
              name="issue_date"
              type="date"
              required
              defaultValue={issueDate}
              disabled={manualPending}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium text-ink">
            Due date
            <input
              name="due_date"
              type="date"
              defaultValue={dueDate}
              disabled={manualPending}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium text-ink">
            Tax rate (%)
            <input
              name="tax_rate_percent"
              type="number"
              min="0"
              max="100"
              step="0.001"
              defaultValue="12"
              required
              disabled={manualPending}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium text-ink sm:col-span-2">
            Customer notes
            <textarea name="notes" rows={2} disabled={manualPending} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-ink sm:col-span-2">
            Terms
            <textarea
              name="terms"
              rows={3}
              defaultValue="Payment due by the date shown above."
              disabled={manualPending}
              className={inputClass}
            />
          </label>
        </div>
        <div className="mt-5 flex items-center gap-4">
          <button
            type="submit"
            disabled={manualPending || customers.length === 0}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            {manualPending ? "Creating…" : "Create blank invoice"}
          </button>
          {manualState.message && (
            <p className="text-sm text-weld" aria-live="polite">
              {manualState.message}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
