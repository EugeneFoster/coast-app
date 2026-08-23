"use client";

import { useActionState } from "react";
import { createWorkOrderAction } from "@/lib/actions/operations";
import { userRoleLabel } from "@/lib/employee-roles";
import {
  INITIAL_OPERATIONS_ACTION_STATE,
  WORK_ORDER_PRIORITIES,
} from "@/lib/operations";
import type { OperationsEmployee } from "@/lib/operations-data";
import { SERVICE_CATEGORIES } from "@/lib/sales";

export function NewWorkOrderForm({
  projectId,
  employees,
}: {
  projectId: string;
  employees: OperationsEmployee[];
}) {
  const create = createWorkOrderAction.bind(null, projectId);
  const [state, action, pending] = useActionState(
    create,
    INITIAL_OPERATIONS_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";
  const labelClass = "text-sm font-medium text-ink";

  return (
    <form action={action} className="mt-8 space-y-6">
      {state.message && (
        <p
          className={`rounded border px-3 py-2 text-sm ${
            state.status === "error"
              ? "border-weld/40 bg-weld/10 text-weld"
              : "border-rule bg-paper text-ink"
          }`}
          aria-live="polite"
        >
          {state.message}
        </p>
      )}

      <section className="rounded border border-rule bg-paper p-6">
        <h2 className="font-display text-xl font-medium text-ink">Work scope</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className={`${labelClass} md:col-span-2`}>
            Title
            <input
              name="title"
              required
              placeholder="Fabricate and install aluminum swim grid"
              disabled={pending}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Service
            <select
              name="service_category"
              defaultValue="marine_fabrication"
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
          <label className={labelClass}>
            Priority
            <select
              name="priority"
              defaultValue="normal"
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
          <label className={`${labelClass} md:col-span-2`}>
            Instructions / scope
            <textarea
              name="description"
              rows={6}
              disabled={pending}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Location
            <input
              name="location"
              placeholder="Shop, marina, vessel, or site"
              disabled={pending}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Estimated hours
            <input
              name="estimated_hours"
              type="number"
              min="0"
              step="0.25"
              disabled={pending}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className="rounded border border-rule bg-paper p-6">
        <h2 className="font-display text-xl font-medium text-ink">Schedule</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Start date
            <input
              name="scheduled_start"
              type="date"
              disabled={pending}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            End date
            <input
              name="scheduled_end"
              type="date"
              disabled={pending}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className="rounded border border-rule bg-paper p-6">
        <h2 className="font-display text-xl font-medium text-ink">Assigned crew</h2>
        <p className="mt-1 text-sm text-graph">
          Assigned employees automatically receive access to this project.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {employees.map((employee) => (
            <label
              key={employee.id}
              className="flex items-start gap-3 rounded border border-rule px-3 py-3 text-sm text-ink"
            >
              <input
                type="checkbox"
                name="assignee_ids"
                value={employee.id}
                disabled={pending}
                className="mt-0.5 accent-weld"
              />
              <span>
                <span className="block font-medium">
                  {employee.full_name ?? employee.login}
                </span>
                <span className="text-xs text-graph">
                  {userRoleLabel(employee.role)}
                </span>
              </span>
            </label>
          ))}
          {employees.length === 0 && (
            <p className="text-sm text-graph">No active operational employees.</p>
          )}
        </div>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="btn-primary px-5 py-2.5 text-sm disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create work order"}
      </button>
    </form>
  );
}
