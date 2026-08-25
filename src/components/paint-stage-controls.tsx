"use client";

import { useActionState } from "react";
import { movePaintJobStageAction } from "@/lib/actions/paint-yard";
import {
  allowedPaintStageTransitions,
  INITIAL_PAINT_YARD_ACTION_STATE,
  paintStageLabel,
} from "@/lib/paint-yard";
import type { PaintJobStage } from "@/lib/types";

export function PaintStageControls({
  jobId,
  projectId,
  workOrderId,
  stage,
  canAdminister,
  compact = false,
}: {
  jobId: string;
  projectId: string;
  workOrderId: string;
  stage: PaintJobStage;
  canAdminister: boolean;
  compact?: boolean;
}) {
  const submit = movePaintJobStageAction.bind(null, jobId, projectId, workOrderId);
  const [state, action, pending] = useActionState(
    submit,
    INITIAL_PAINT_YARD_ACTION_STATE,
  );
  const targets = allowedPaintStageTransitions(stage, canAdminister);

  if (targets.length === 0) return null;

  return (
    <form action={action} className={compact ? "mt-3 space-y-2" : "rounded border border-rule bg-paper p-5"}>
      {!compact && (
        <div>
          <h2 className="font-display text-xl font-medium text-ink">Move the vessel</h2>
          <p className="mt-1 text-sm text-graph">
            Forward moves require every mandatory checklist gate in the current stage.
          </p>
        </div>
      )}
      <div className={`${compact ? "" : "mt-4"} grid gap-2 ${compact ? "" : "sm:grid-cols-[minmax(12rem,1fr)_minmax(14rem,2fr)_auto]"}`}>
        <select
          name="target_stage"
          required
          defaultValue=""
          disabled={pending}
          aria-label="Target paint stage"
          className="w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink"
        >
          <option value="" disabled>Move to…</option>
          {targets.map((target) => (
            <option key={target} value={target}>{paintStageLabel(target)}</option>
          ))}
        </select>
        <input
          name="note"
          maxLength={500}
          placeholder="Required for hold/cancel; optional handoff note"
          disabled={pending}
          className="w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink"
        />
        <button type="submit" disabled={pending} className="btn-primary whitespace-nowrap px-4 py-2 text-sm disabled:opacity-50">
          {pending ? "Moving…" : "Move"}
        </button>
      </div>
      {state.message && (
        <p className={`text-xs ${state.status === "error" ? "text-weld" : "text-graph"}`} aria-live="polite">
          {state.message}
        </p>
      )}
    </form>
  );
}
