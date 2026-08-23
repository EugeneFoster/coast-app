"use client";

import { useActionState } from "react";
import { addTimeEntryAction } from "@/lib/actions/operations";
import { INITIAL_OPERATIONS_ACTION_STATE } from "@/lib/operations";

export function TimeEntryForm({
  projectId,
  workOrderId,
  defaultWorkDate,
}: {
  projectId: string;
  workOrderId: string;
  defaultWorkDate: string;
}) {
  const addTime = addTimeEntryAction.bind(null, projectId, workOrderId);
  const [state, action, pending] = useActionState(
    addTime,
    INITIAL_OPERATIONS_ACTION_STATE,
  );
  const inputClass =
    "w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="rounded border border-dashed border-rule p-4">
      <div className="grid gap-3 sm:grid-cols-[9rem_7rem_1fr_auto]">
        <input
          name="work_date"
          type="date"
          defaultValue={defaultWorkDate}
          required
          disabled={pending}
          className={inputClass}
          aria-label="Work date"
        />
        <input
          name="hours"
          type="number"
          min="0.01"
          max="24"
          step="0.25"
          placeholder="Hours"
          required
          disabled={pending}
          className={inputClass}
          aria-label="Hours"
        />
        <input
          name="note"
          placeholder="Work performed"
          disabled={pending}
          className={inputClass}
          aria-label="Time entry note"
        />
        <button
          type="submit"
          disabled={pending}
          className="btn-primary whitespace-nowrap px-4 py-2 text-sm disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add time"}
        </button>
      </div>
      {state.message && (
        <p
          className={`mt-2 text-sm ${state.status === "error" ? "text-weld" : "text-graph"}`}
          aria-live="polite"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
