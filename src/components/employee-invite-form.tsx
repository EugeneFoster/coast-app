"use client";

import { useActionState } from "react";
import {
  inviteEmployeeAction,
  INITIAL_EMPLOYEE_ACTION_STATE,
} from "@/lib/actions/employees";
import { EMPLOYEE_SPECIALTIES, USER_ROLES } from "@/lib/employee-roles";
import type { UserRole } from "@/lib/types";

export function EmployeeInviteForm({ actorRole }: { actorRole: UserRole }) {
  const [state, action, pending] = useActionState(
    inviteEmployeeAction,
    INITIAL_EMPLOYEE_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none";

  return (
    <form action={action} className="rounded border border-rule bg-paper p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-medium text-ink">
            Invite employee
          </h2>
          <p className="mt-1 text-sm text-graph">
            They will receive an email link to create their password.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-ink">
          Full name
          <input name="full_name" required className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Email
          <input name="email" type="email" required className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Primary role
          <select name="role" defaultValue="welder" className={inputClass}>
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
          Job title
          <input name="job_title" className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-2">
          Phone
          <input name="phone" type="tel" className={inputClass} />
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-ink">Specialties</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {EMPLOYEE_SPECIALTIES.map((specialty) => (
            <label
              key={specialty.value}
              className="flex items-center gap-2 rounded border border-rule px-3 py-2 text-sm text-ink"
            >
              <input
                type="checkbox"
                name="specialties"
                value={specialty.value}
                className="accent-weld"
              />
              {specialty.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send invitation"}
        </button>
        {state.message && (
          <p
            className={`text-sm ${state.status === "error" ? "text-weld" : "text-ink"}`}
            aria-live="polite"
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
