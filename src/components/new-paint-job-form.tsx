"use client";

import { useActionState, useState } from "react";
import { createPaintJobAction } from "@/lib/actions/paint-yard";
import { userRoleLabel } from "@/lib/employee-roles";
import {
  HULL_MATERIALS,
  INITIAL_PAINT_YARD_ACTION_STATE,
  PAINT_SCOPE_AREAS,
} from "@/lib/paint-yard";
import type {
  PaintYardProject,
} from "@/lib/paint-yard-data";
import type { OperationsEmployee } from "@/lib/operations-data";

export function NewPaintJobForm({
  projects,
  employees,
  arrivalDate,
  dueDate,
}: {
  projects: PaintYardProject[];
  employees: OperationsEmployee[];
  arrivalDate: string;
  dueDate: string;
}) {
  const [state, action, pending] = useActionState(
    createPaintJobAction,
    INITIAL_PAINT_YARD_ACTION_STATE,
  );
  const [projectId, setProjectId] = useState("");
  const selectedProject = projects.find(({ project_id }) => project_id === projectId);
  const availableProjects = projects.filter(({ has_active_paint_job }) => !has_active_paint_job);
  const paintCrew = employees.filter(
    ({ role, specialties }) => role === "painter" || specialties.includes("boat_painting"),
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="rounded border border-rule bg-bone p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-weld">New vessel</p>
          <h2 className="mt-2 font-display text-2xl font-medium text-ink">Start a paint job</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-graph">
            Creates the paint work order, gated checklist, and editable draft quote in one transaction.
          </p>
        </div>
        <span className="rounded border border-rule bg-paper px-3 py-1.5 text-xs text-graph">
          Vancouver yard workflow
        </span>
      </div>

      {state.message && (
        <p
          aria-live="polite"
          className={`mt-5 rounded border px-4 py-3 text-sm ${
            state.status === "error"
              ? "border-weld/40 bg-weld/10 text-weld"
              : "border-rule bg-paper text-ink"
          }`}
        >
          {state.message}
        </p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-medium text-ink lg:col-span-2">
          Project / customer
          <select
            name="project_id"
            required
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            disabled={pending || availableProjects.length === 0}
            className={inputClass}
          >
            <option value="" disabled>Select a project</option>
            {availableProjects.map((project) => (
              <option key={project.project_id} value={project.project_id}>
                {project.project_name} · {project.client_name}
                {project.vessel_name ? ` · ${project.vessel_name}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Vessel name
          <input
            key={`${projectId}-vessel`}
            name="vessel_name"
            required
            maxLength={120}
            defaultValue={selectedProject?.vessel_name ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Make / model
          <input
            key={`${projectId}-model`}
            name="vessel_make_model"
            maxLength={160}
            defaultValue={selectedProject?.vessel_make_model ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Length (ft)
          <input
            key={`${projectId}-length`}
            name="vessel_length_ft"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={selectedProject?.vessel_length_ft ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Hull material
          <select name="hull_material" defaultValue="unknown" disabled={pending} className={inputClass}>
            {HULL_MATERIALS.map((material) => (
              <option key={material.value} value={material.value}>{material.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Arrival date
          <input name="arrival_date" type="date" required defaultValue={arrivalDate} disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Due date
          <input name="due_date" type="date" required defaultValue={dueDate} disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Planned hours
          <input name="planned_hours" type="number" min="0.25" step="0.25" required placeholder="80" disabled={pending} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-ink">
          Priority
          <select name="priority" defaultValue="normal" disabled={pending} className={inputClass}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="text-sm font-medium text-ink lg:col-span-2">
          Yard location / row
          <input name="yard_location" maxLength={160} placeholder="Row B · Bay 4" disabled={pending} className={inputClass} />
        </label>

        <fieldset className="rounded border border-rule bg-paper p-4 lg:col-span-2">
          <legend className="px-1 text-sm font-medium text-ink">Paint scope</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {PAINT_SCOPE_AREAS.map((area) => (
              <label key={area.value} className="flex items-center gap-2 text-sm text-graph">
                <input type="checkbox" name="scope_areas" value={area.value} disabled={pending} />
                {area.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded border border-rule bg-paper p-4 lg:col-span-2">
          <legend className="px-1 text-sm font-medium text-ink">Assigned paint crew</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {paintCrew.map((employee) => (
              <label key={employee.id} className="flex items-center gap-2 text-sm text-graph">
                <input type="checkbox" name="assignee_ids" value={employee.id} disabled={pending} />
                {employee.full_name ?? employee.login} · {userRoleLabel(employee.role)}
              </label>
            ))}
            {paintCrew.length === 0 && <p className="text-sm text-graph">No active paint crew found.</p>}
          </div>
        </fieldset>

        <fieldset className="rounded border border-rule bg-paper p-4 lg:col-span-2">
          <legend className="px-1 text-sm font-medium text-ink">Draft quote</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-medium text-ink">
              Labor rate / hr
              <input name="labor_rate" type="number" min="0" step="0.01" required defaultValue="125" disabled={pending} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-ink">
              Material allowance
              <input name="material_allowance" type="number" min="0" step="0.01" required defaultValue="0" disabled={pending} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-ink">
              Tax rate (%)
              <input name="tax_rate_percent" type="number" min="0" max="100" step="0.001" required defaultValue="12" disabled={pending} className={inputClass} />
            </label>
          </div>
        </fieldset>

        <label className="text-sm font-medium text-ink lg:col-span-2 xl:col-span-4">
          Paint specification / customer scope
          <textarea
            name="specification"
            rows={4}
            maxLength={5000}
            placeholder="Areas, requested finish, known substrate condition, desired system, exclusions…"
            disabled={pending}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending || availableProjects.length === 0}
          className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
        >
          {pending ? "Creating workflow…" : "Create paint job + draft quote"}
        </button>
        <p className="text-xs text-graph">
          Quote remains Draft until reviewed and sent from Sales CRM.
        </p>
      </div>
    </form>
  );
}
