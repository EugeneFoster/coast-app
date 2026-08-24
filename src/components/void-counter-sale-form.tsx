"use client";

import { useActionState } from "react";
import { voidCounterSaleAction } from "@/lib/actions/counter-sales";
import { INITIAL_COUNTER_SALE_ACTION_STATE } from "@/lib/counter-sales";

export function VoidCounterSaleForm({ counterSaleId }: { counterSaleId: string }) {
  const [state, action, pending] = useActionState(
    voidCounterSaleAction.bind(null, counterSaleId),
    INITIAL_COUNTER_SALE_ACTION_STATE,
  );

  return (
    <form action={action} className="rounded border border-weld/40 bg-paper p-5">
      <h3 className="font-display text-lg font-medium text-ink">Void & return stock</h3>
      <p className="mt-1 text-sm leading-6 text-graph">
        Returns every item to inventory and keeps the original receipt and ledger history.
      </p>
      <label className="mt-4 block text-sm font-medium text-ink">
        Reason
        <input
          name="reason"
          required
          minLength={5}
          maxLength={500}
          placeholder="Customer return, entry error…"
          disabled={pending}
          className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50"
        />
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">
          {pending ? "Voiding…" : "Void sale and return stock"}
        </button>
        {state.message && <p className="text-sm text-weld" aria-live="polite">{state.message}</p>}
      </div>
    </form>
  );
}
