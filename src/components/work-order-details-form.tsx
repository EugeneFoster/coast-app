"use client";

import { useActionState } from "react";
import { updateWorkOrderAction } from "@/lib/actions/operations";
import {
  INITIAL_OPERATIONS_ACTION_STATE,
  WORK_ORDER_PRIORITIES,
} from "@/lib/operations";
import { SERVICE_CATEGORIES } from "@/lib/sales";
import type { WorkOrder } from "@/lib/types";

type WorkOrderEditorValue = Pick<
  WorkOrder,
  | "id"
  | "project_id"
  | "title"
  | "description"
  | "service_category"
  | "priority"
  | "scheduled_start"
  | "scheduled_end"
  | "estimated_hours"
  | "location"
>;

export function WorkOrderDetailsForm({ workOrder }: { workOrder: WorkOrderEditorValue }) {
  const update = updateWorkOrderAction.bind(
    null,
    workOrder.project_id,
    workOrder.id,
  );
  const [state, action, pending] = useActionState(
    update,
    INITIAL_OPERATIONS_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="rounded border border-rule bg-paper p-6">
      <h2 className="font-display text-xl font-medium text-ink">Work order details</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-ink md:col-span-2">
          Title
          <input
            name="title"
            defaultValue={workOrder.title}
            required
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Service
          <select
            name="service_category"
            defaultValue={workOrder.service_category}
            disabled={pending}
            className={inputClass}
          >
            {SERVICE_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Priority
          <select
            name="priority"
            defaultValue={workOrder.priority}
            disabled={pending}
            className={inputClass}
          >
            {WORK_ORDER_PRIORITIES.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Start date
          <input
            name="scheduled_start"
            type="date"
            defaultValue={workOrder.scheduled_start ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          End date
          <input
            name="scheduled_end"
            type="date"
            defaultValue={workOrder.scheduled_end ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Location
          <input
            name="location"
            defaultValue={workOrder.location ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Estimated hours
          <input
            name="estimated_hours"
            type="number"
            min="0"
            step="0.25"
            defaultValue={workOrder.estimated_hours ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-2">
          Instructions / scope
          <textarea
            name="description"
            rows={6}
            defaultValue={workOrder.description ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save details"}
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
