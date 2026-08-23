"use client";

import { useActionState } from "react";
import {
  updateEstimateAction,
} from "@/lib/actions/sales";
import { INITIAL_SALES_ACTION_STATE } from "@/lib/sales";
import type { Estimate } from "@/lib/types";

export function EstimateDetailsForm({
  estimate,
}: {
  estimate: Estimate;
}) {
  const update = updateEstimateAction.bind(
    null,
    estimate.opportunity_id,
    estimate.id,
  );
  const [state, action, pending] = useActionState(
    update,
    INITIAL_SALES_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="rounded border border-rule bg-paper p-6">
      <h2 className="font-display text-xl font-medium text-ink">Quote details</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-ink md:col-span-2">
          Title
          <input
            name="title"
            defaultValue={estimate.title}
            required
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Valid until
          <input
            name="valid_until"
            type="date"
            defaultValue={estimate.valid_until ?? ""}
            disabled={pending}
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
            defaultValue={estimate.tax_rate_percent}
            required
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Discount (CAD)
          <input
            name="discount_amount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={estimate.discount_amount}
            required
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-2">
          Scope of work
          <textarea
            name="scope"
            rows={7}
            defaultValue={estimate.scope ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-2">
          Customer notes
          <textarea
            name="notes"
            rows={3}
            defaultValue={estimate.notes ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-2">
          Terms
          <textarea
            name="terms"
            rows={4}
            defaultValue={estimate.terms ?? ""}
            placeholder="Payment schedule, exclusions, warranty, and quote assumptions."
            disabled={pending}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-5 flex items-center gap-4 print-hidden">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save quote"}
        </button>
        {state.message && (
          <p
            className={`text-sm ${state.status === "error" ? "text-weld" : "text-graph"}`}
            aria-live="polite"
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
