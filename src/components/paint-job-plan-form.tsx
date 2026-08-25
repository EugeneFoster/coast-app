"use client";

import { useActionState } from "react";
import { updatePaintJobPlanAction } from "@/lib/actions/paint-yard";
import { INITIAL_PAINT_YARD_ACTION_STATE } from "@/lib/paint-yard";
import type { PaintYardJob } from "@/lib/paint-yard-data";

export function PaintJobPlanForm({ job }: { job: PaintYardJob }) {
  const submit = updatePaintJobPlanAction.bind(
    null,
    job.job_id,
    job.project_id,
    job.work_order_id,
  );
  const [state, action, pending] = useActionState(
    submit,
    INITIAL_PAINT_YARD_ACTION_STATE,
  );
  const inputClass = "mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink disabled:opacity-50";

  return (
    <form action={action} className="rounded border border-rule bg-paper p-5">
      <h2 className="font-display text-xl font-medium text-ink">Plan & deadline</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-medium text-ink">Arrival<input name="arrival_date" type="date" required defaultValue={job.arrival_date} disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Due<input name="due_date" type="date" required defaultValue={job.due_date} disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Planned hours<input name="planned_hours" type="number" min="0.25" step="0.25" required defaultValue={job.planned_hours} disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink">Priority<select name="priority" defaultValue={job.priority} disabled={pending} className={inputClass}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label className="text-xs font-medium text-ink sm:col-span-2">Yard row / bay<input name="yard_location" maxLength={160} defaultValue={job.yard_location ?? ""} disabled={pending} className={inputClass} /></label>
        <label className="text-xs font-medium text-ink sm:col-span-2">Specification<textarea name="specification" rows={5} maxLength={5000} defaultValue={job.specification ?? ""} disabled={pending} className={inputClass} /></label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">{pending ? "Saving…" : "Update plan"}</button>
        {state.message && <p className={`text-xs ${state.status === "error" ? "text-weld" : "text-graph"}`} aria-live="polite">{state.message}</p>}
      </div>
    </form>
  );
}
