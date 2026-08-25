"use client";

import { useActionState } from "react";
import { setPaintTaskStatusAction } from "@/lib/actions/paint-yard";
import { INITIAL_PAINT_YARD_ACTION_STATE } from "@/lib/paint-yard";
import type { PaintChecklistTask } from "@/lib/paint-yard-data";

export function PaintTaskForm({
  jobId,
  task,
  canWork,
}: {
  jobId: string;
  task: PaintChecklistTask;
  canWork: boolean;
}) {
  const submit = setPaintTaskStatusAction.bind(null, task.task_id, jobId);
  const [state, action, pending] = useActionState(
    submit,
    INITIAL_PAINT_YARD_ACTION_STATE,
  );

  return (
    <form action={action} className="rounded border border-rule bg-paper p-3">
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
            task.status === "complete"
              ? "bg-ink"
              : task.status === "not_applicable"
                ? "bg-graph/40"
                : "border border-weld bg-transparent"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm leading-5 text-ink">{task.label}</p>
            {task.required && <span className="text-[0.62rem] uppercase tracking-wide text-weld">Gate</span>}
          </div>
          {task.completed_by_name && (
            <p className="mt-1 text-[0.68rem] text-graph">{task.completed_by_name}</p>
          )}
          {canWork && (
            <div className="mt-3 grid gap-2 sm:grid-cols-[9rem_1fr_auto]">
              <select name="status" defaultValue={task.status} disabled={pending} className="rounded border border-rule bg-bone px-2.5 py-2 text-xs text-ink">
                <option value="pending">Pending</option>
                <option value="complete">Complete</option>
                <option value="not_applicable">N/A</option>
              </select>
              <input name="note" maxLength={500} defaultValue={task.note ?? ""} placeholder="Evidence / reading / reason for N/A" disabled={pending} className="rounded border border-rule bg-bone px-2.5 py-2 text-xs text-ink" />
              <button type="submit" disabled={pending} className="btn-secondary px-3 py-2 text-xs disabled:opacity-50">
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          )}
          {!canWork && task.note && <p className="mt-2 text-xs leading-5 text-graph">{task.note}</p>}
          {state.message && <p className={`mt-2 text-xs ${state.status === "error" ? "text-weld" : "text-graph"}`} aria-live="polite">{state.message}</p>}
        </div>
      </div>
    </form>
  );
}
