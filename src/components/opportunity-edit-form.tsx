"use client";

import { useActionState } from "react";
import { updateOpportunityAction } from "@/lib/actions/sales";
import {
  INITIAL_SALES_ACTION_STATE,
  LEAD_SOURCES,
  OPPORTUNITY_STATUSES,
  SERVICE_CATEGORIES,
} from "@/lib/sales";
import type { Opportunity } from "@/lib/types";

type AssigneeOption = { id: string; full_name: string | null; login: string };

export function OpportunityEditForm({
  opportunity,
  assignees,
}: {
  opportunity: Opportunity;
  assignees: AssigneeOption[];
}) {
  const update = updateOpportunityAction.bind(null, opportunity.id);
  const [state, action, pending] = useActionState(
    update,
    INITIAL_SALES_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="rounded border border-rule bg-paper p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-ink md:col-span-2">
          Title
          <input
            name="title"
            defaultValue={opportunity.title}
            required
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Stage
          {opportunity.project_id && (
            <input type="hidden" name="status" value={opportunity.status} />
          )}
          <select
            name="status"
            defaultValue={opportunity.status}
            disabled={pending || opportunity.project_id !== null}
            className={inputClass}
          >
            {OPPORTUNITY_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Source
          <select
            name="source"
            defaultValue={opportunity.source}
            disabled={pending}
            className={inputClass}
          >
            {LEAD_SOURCES.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Responsible person
          <select
            name="assigned_to"
            defaultValue={opportunity.assigned_to ?? ""}
            disabled={pending}
            className={inputClass}
          >
            <option value="">Unassigned</option>
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name ?? person.login}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Estimated value (CAD)
          <input
            name="estimated_value"
            type="number"
            min="0"
            step="0.01"
            defaultValue={opportunity.estimated_value ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Target date
          <input
            name="target_date"
            type="date"
            defaultValue={opportunity.target_date ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-2">
          Requested work / notes
          <textarea
            name="description"
            rows={4}
            defaultValue={opportunity.description ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-ink">Services</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SERVICE_CATEGORIES.map((category) => (
            <label
              key={category.value}
              className="flex items-center gap-2 rounded border border-rule px-3 py-2 text-sm text-ink"
            >
              <input
                type="checkbox"
                name="service_categories"
                value={category.value}
                defaultChecked={opportunity.service_categories.includes(category.value)}
                disabled={pending}
                className="accent-weld"
              />
              {category.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium text-ink">
          Vessel name
          <input
            name="vessel_name"
            defaultValue={opportunity.vessel_name ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Make / model
          <input
            name="vessel_make_model"
            defaultValue={opportunity.vessel_make_model ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Length (ft)
          <input
            name="vessel_length_ft"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={opportunity.vessel_length_ft ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium text-ink">
        Lost reason
        <textarea
          name="lost_reason"
          rows={2}
          defaultValue={opportunity.lost_reason ?? ""}
          disabled={pending}
          className={inputClass}
        />
      </label>

      <div className="mt-5 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save opportunity"}
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
