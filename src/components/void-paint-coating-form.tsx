"use client";

import { useActionState } from "react";
import { voidPaintCoatingAction } from "@/lib/actions/paint-yard";
import { INITIAL_PAINT_YARD_ACTION_STATE } from "@/lib/paint-yard";

export function VoidPaintCoatingForm({ logId, jobId }: { logId: string; jobId: string }) {
  const submit = voidPaintCoatingAction.bind(null, logId, jobId);
  const [state, action, pending] = useActionState(submit, INITIAL_PAINT_YARD_ACTION_STATE);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
      <input name="reason" required minLength={5} maxLength={500} placeholder="Correction reason" disabled={pending} className="min-w-48 flex-1 rounded border border-rule bg-bone px-2.5 py-2 text-xs" />
      <button type="submit" disabled={pending} className="text-xs text-graph hover:text-weld disabled:opacity-50">{pending ? "Voiding…" : "Void log"}</button>
      {state.message && <p className="w-full text-xs text-weld" aria-live="polite">{state.message}</p>}
    </form>
  );
}
