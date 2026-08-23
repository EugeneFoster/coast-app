"use client";

import { useActionState } from "react";
import {
  INITIAL_EMPLOYEE_ACTION_STATE,
  updateEmployeeAction,
} from "@/lib/actions/employees";
import {
  EMPLOYEE_SPECIALTIES,
  USER_ROLES,
  USER_STATUSES,
} from "@/lib/employee-roles";
import type { Profile, UserRole } from "@/lib/types";

export function EmployeeEditForm({
  employee,
  actorRole,
}: {
  employee: Profile;
  actorRole: UserRole;
}) {
  const updateEmployee = updateEmployeeAction.bind(null, employee.id);
  const [state, action, pending] = useActionState(
    updateEmployee,
    INITIAL_EMPLOYEE_ACTION_STATE,
  );
  const fieldClass =
    "mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none";
  const ownerLocked = employee.role === "owner" && actorRole !== "owner";

  return (
    <form action={action} className="rounded border border-rule bg-paper p-5">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium text-ink">
          Full name
          <input
            name="full_name"
            defaultValue={employee.full_name ?? ""}
            required
            disabled={ownerLocked}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Email
          <input value={employee.login} disabled className={fieldClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Primary role
          <select
            name="role"
            defaultValue={employee.role}
            disabled={ownerLocked}
            className={fieldClass}
          >
            {USER_ROLES.map((role) => (
              <option
                key={role.value}
                value={role.value}
                disabled={role.value === "owner" && actorRole !== "owner"}
              >
                {role.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Status
          <select
            name="status"
            defaultValue={employee.status}
            disabled={ownerLocked}
            className={fieldClass}
          >
            {USER_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Job title
          <input
            name="job_title"
            defaultValue={employee.job_title ?? ""}
            disabled={ownerLocked}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Phone
          <input
            name="phone"
            type="tel"
            defaultValue={employee.phone ?? ""}
            disabled={ownerLocked}
            className={fieldClass}
          />
        </label>
      </div>

      <fieldset className="mt-4" disabled={ownerLocked}>
        <legend className="text-sm font-medium text-ink">Specialties</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {EMPLOYEE_SPECIALTIES.map((specialty) => (
            <label
              key={specialty.value}
              className="flex items-center gap-2 rounded border border-rule px-3 py-1.5 text-xs text-ink"
            >
              <input
                type="checkbox"
                name="specialties"
                value={specialty.value}
                defaultChecked={employee.specialties?.includes(specialty.value)}
                className="accent-weld"
              />
              {specialty.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || ownerLocked}
          className="rounded border border-rule px-4 py-2 text-sm text-ink hover:bg-bone disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save employee"}
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
