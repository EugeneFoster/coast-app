"use client";

import { useActionState } from "react";
import { updateProjectFinancialSettingsAction } from "@/lib/actions/billing";
import { INITIAL_BILLING_ACTION_STATE } from "@/lib/billing";

export function ProjectFinancialSettingsForm({
  projectId,
  laborCostRate,
  overheadCost,
}: {
  projectId: string;
  laborCostRate: number;
  overheadCost: number;
}) {
  const update = updateProjectFinancialSettingsAction.bind(null, projectId);
  const [state, action, pending] = useActionState(update, INITIAL_BILLING_ACTION_STATE);
  const inputClass = "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none";
  return (
    <form action={action} className="rounded border border-rule bg-paper p-5">
      <h2 className="font-display text-xl font-medium text-ink">Cost assumptions</h2>
      <p className="mt-2 text-sm leading-6 text-graph">
        The internal blended labor rate is used for profitability only. It is not an employee payroll rate or a customer billing rate.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink">
          Internal labor cost / hour (CAD)
          <input name="labor_cost_rate" type="number" min="0" step="0.01" defaultValue={laborCostRate} required disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Project overhead (CAD)
          <input name="overhead_cost" type="number" min="0" step="0.01" defaultValue={overheadCost} required disabled={pending} className={inputClass} />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {pending ? "Saving…" : "Save cost assumptions"}
        </button>
        {state.message && (
          <p className={`text-sm ${state.status === "error" ? "text-weld" : "text-graph"}`} aria-live="polite">{state.message}</p>
        )}
      </div>
    </form>
  );
}
