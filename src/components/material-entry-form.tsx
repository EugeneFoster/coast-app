"use client";

import { useActionState } from "react";
import { addMaterialEntryAction } from "@/lib/actions/operations";
import { INITIAL_OPERATIONS_ACTION_STATE } from "@/lib/operations";

export function MaterialEntryForm({
  projectId,
  workOrderId,
}: {
  projectId: string;
  workOrderId: string;
}) {
  const addMaterial = addMaterialEntryAction.bind(null, projectId, workOrderId);
  const [state, action, pending] = useActionState(
    addMaterial,
    INITIAL_OPERATIONS_ACTION_STATE,
  );
  const inputClass =
    "w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="rounded border border-dashed border-rule p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_8rem_6rem_6rem_8rem_auto]">
        <input
          name="description"
          required
          placeholder="Material or part description"
          disabled={pending}
          className={inputClass}
          aria-label="Material description"
        />
        <input
          name="part_number"
          placeholder="Part #"
          disabled={pending}
          className={inputClass}
          aria-label="Part number"
        />
        <input
          name="quantity"
          type="number"
          min="0.001"
          step="0.001"
          defaultValue="1"
          required
          disabled={pending}
          className={inputClass}
          aria-label="Quantity"
        />
        <input
          name="unit"
          defaultValue="ea"
          required
          disabled={pending}
          className={inputClass}
          aria-label="Unit"
        />
        <input
          name="unit_cost"
          type="number"
          min="0"
          step="0.01"
          placeholder="Unit cost"
          disabled={pending}
          className={inputClass}
          aria-label="Unit cost"
        />
        <button
          type="submit"
          disabled={pending}
          className="btn-primary whitespace-nowrap px-4 py-2 text-sm disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add material"}
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
