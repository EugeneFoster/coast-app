"use client";

import { useActionState } from "react";
import { cancelScheduleSlotAction } from "@/lib/actions/schedule";
import { INITIAL_SCHEDULE_ACTION_STATE } from "@/lib/schedule";

export function CancelScheduleSlotForm({
  slotId,
  weekStart,
}: {
  slotId: string;
  weekStart: string;
}) {
  const [state, action, pending] = useActionState(
    cancelScheduleSlotAction.bind(null, slotId, weekStart),
    INITIAL_SCHEDULE_ACTION_STATE,
  );

  return (
    <form action={action} className="mt-3 border-t border-rule pt-3">
      <label className="block text-xs font-medium text-graph">
        Cancellation reason
        <input
          name="reason"
          required
          minLength={5}
          maxLength={500}
          placeholder="Weather, reassigned, customer delay…"
          disabled={pending}
          className="mt-1 w-full rounded border border-rule bg-bone px-2.5 py-2 text-xs text-ink focus:border-weld focus:outline-none"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="text-xs text-graph hover:text-weld disabled:opacity-50">
          {pending ? "Cancelling…" : "Cancel shift"}
        </button>
        {state.message && <p className="text-xs text-weld" aria-live="polite">{state.message}</p>}
      </div>
    </form>
  );
}
