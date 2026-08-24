import Link from "next/link";
import { notFound } from "next/navigation";
import { InventoryIssueForm } from "@/components/inventory-issue-form";
import { MaterialEntryForm } from "@/components/material-entry-form";
import { TimeEntryForm } from "@/components/time-entry-form";
import { WorkOrderDetailsForm } from "@/components/work-order-details-form";
import {
  assignWorkOrderEmployeeAction,
  deleteMaterialEntryAction,
  deleteTimeEntryAction,
  removeWorkOrderEmployeeAction,
  updateWorkOrderStatusAction,
} from "@/lib/actions/operations";
import { reverseInventoryIssueAction } from "@/lib/actions/inventory";
import { requireUser } from "@/lib/auth";
import {
  ASSIGNABLE_WORK_ORDER_ROLES,
  canManageInventory,
  canManageOperations,
  userRoleLabel,
} from "@/lib/employee-roles";
import { getInventoryItemOptions } from "@/lib/inventory-data";
import {
  allowedWorkOrderTransitions,
  formatHours,
  workOrderPriorityLabel,
  workOrderStatusLabel,
} from "@/lib/operations";
import {
  getOperationsDirectory,
  getOperationsProjects,
} from "@/lib/operations-data";
import {
  formatCad,
  formatShortDate,
  serviceCategoryLabel,
} from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type {
  MaterialEntry,
  TimeEntry,
  WorkOrder,
  WorkOrderAssignment,
} from "@/lib/types";

const statusAccent: Record<WorkOrder["status"], string> = {
  planned: "border-rule text-graph",
  ready: "border-ink/30 text-ink",
  in_progress: "border-weld text-weld",
  blocked: "border-weld bg-weld/10 text-weld",
  completed: "border-ink bg-ink text-bone",
  cancelled: "border-rule text-graph opacity-70",
};

function vancouverDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function WorkOrderPage({
  params,
}: {
  params: Promise<{ id: string; workOrderId: string }>;
}) {
  const { id, workOrderId } = await params;
  const { user, profile } = await requireUser();
  const canManage = canManageOperations(profile.role);
  const canManageWarehouse = canManageInventory(profile.role);
  const supabase = await createClient();

  const [
    { data: accessibleProject },
    { data: workOrderData },
    directory,
    operationsProjects,
  ] = await Promise.all([
      supabase.from("projects").select("id, name").eq("id", id).maybeSingle(),
      supabase
        .from("work_orders")
        .select("*")
        .eq("id", workOrderId)
        .eq("project_id", id)
        .maybeSingle(),
      getOperationsDirectory(),
      getOperationsProjects(),
    ]);
  const project =
    accessibleProject ?? operationsProjects.find(({ id: projectId }) => projectId === id);
  if (!project || !workOrderData) notFound();
  const workOrder = workOrderData as WorkOrder;

  const [assignmentResult, timeResult, materialResult, inventoryItems] = await Promise.all([
    supabase
      .from("work_order_assignments")
      .select("*")
      .eq("work_order_id", workOrderId)
      .order("created_at"),
    supabase
      .from("time_entries")
      .select("*")
      .eq("work_order_id", workOrderId)
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("material_entries")
      .select("*")
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: false }),
    canManageWarehouse ? getInventoryItemOptions() : Promise.resolve([]),
  ]);
  const assignments = (assignmentResult.data ?? []) as WorkOrderAssignment[];
  const timeEntries = (timeResult.data ?? []) as TimeEntry[];
  const materialEntries = (materialResult.data ?? []) as MaterialEntry[];
  const employeeMap = new Map(directory.map((employee) => [employee.id, employee]));
  const assignedIds = new Set(assignments.map(({ profile_id }) => profile_id));
  const assignedOperator =
    assignedIds.has(user.id) && ASSIGNABLE_WORK_ORDER_ROLES.includes(profile.role);
  const canLog = canManage || assignedOperator;
  const transitions =
    canManage || assignedOperator
      ? allowedWorkOrderTransitions(workOrder.status, canManage)
      : [];
  const availableEmployees = directory.filter(
    ({ id: employeeId, role }) =>
      ASSIGNABLE_WORK_ORDER_ROLES.includes(role) && !assignedIds.has(employeeId),
  );
  const actualHours = timeEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);
  const materialCost = materialEntries.reduce(
    (sum, entry) => sum + (entry.reversed_at ? 0 : Number(entry.line_total)),
    0,
  );

  return (
    <div className="mx-auto max-w-7xl px-8 pb-12 pt-8">
      <Link
        href={`/projects/${id}/work-orders`}
        className="text-sm text-graph hover:text-ink"
      >
        ← {project.name} work orders
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-medium text-ink">
              {workOrder.title}
            </h1>
            <span
              className={`rounded border px-2.5 py-1 text-xs ${statusAccent[workOrder.status]}`}
            >
              {workOrderStatusLabel(workOrder.status)}
            </span>
          </div>
          <p className="mt-2 font-mono text-xs text-graph">
            {workOrder.work_order_number} · {project.name}
          </p>
        </div>
        {accessibleProject && (
          <Link href={`/projects/${id}`} className="btn-secondary px-4 py-2 text-sm">
            Open project →
          </Link>
        )}
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Schedule</p>
          <p className="mt-2 text-sm text-ink">
            {formatShortDate(workOrder.scheduled_start)}
            {workOrder.scheduled_end
              ? ` – ${formatShortDate(workOrder.scheduled_end)}`
              : ""}
          </p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Labor</p>
          <p className="mt-2 font-mono text-sm text-ink">
            {formatHours(actualHours)} / {formatHours(workOrder.estimated_hours)}
          </p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Materials</p>
          <p className="mt-2 font-mono text-sm text-ink">{formatCad(materialCost)}</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Priority</p>
          <p className="mt-2 text-sm text-ink">
            {workOrderPriorityLabel(workOrder.priority)}
          </p>
        </div>
      </div>

      {transitions.length > 0 && (
        <section className="mt-6 flex flex-wrap items-center gap-3 rounded border border-rule bg-paper p-4">
          <span className="mr-2 text-sm text-graph">Move work order:</span>
          {transitions.map((nextStatus) => (
            <form
              key={nextStatus}
              action={updateWorkOrderStatusAction.bind(
                null,
                id,
                workOrderId,
                nextStatus,
              )}
            >
              <button
                type="submit"
                className={
                  nextStatus === "completed" || nextStatus === "in_progress"
                    ? "btn-primary px-4 py-2 text-sm"
                    : "btn-secondary px-4 py-2 text-sm"
                }
              >
                {workOrderStatusLabel(nextStatus)}
              </button>
            </form>
          ))}
        </section>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        {canManage ? (
          <WorkOrderDetailsForm workOrder={workOrder} />
        ) : (
          <section className="rounded border border-rule bg-paper p-6">
            <h2 className="font-display text-xl font-medium text-ink">Work scope</h2>
            <dl className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <dt className="text-xs text-graph">Service</dt>
                <dd className="mt-1 text-sm">{serviceCategoryLabel(workOrder.service_category)}</dd>
              </div>
              <div>
                <dt className="text-xs text-graph">Location</dt>
                <dd className="mt-1 text-sm">{workOrder.location ?? "—"}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs text-graph">Instructions</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm leading-6">
                  {workOrder.description ?? "—"}
                </dd>
              </div>
            </dl>
          </section>
        )}

        <aside className="rounded border border-rule bg-paper p-5">
          <h2 className="font-display text-xl font-medium text-ink">Assigned crew</h2>
          <ul className="mt-4 space-y-3">
            {assignments.map((assignment) => {
              const employee = employeeMap.get(assignment.profile_id);
              return (
                <li
                  key={assignment.profile_id}
                  className="flex items-start justify-between gap-3 border-b border-rule pb-3 text-sm last:border-0 last:pb-0"
                >
                  <span>
                    <span className="block font-medium text-ink">
                      {employee?.full_name ?? employee?.login ?? "Employee"}
                    </span>
                    <span className="text-xs text-graph">
                      {employee ? userRoleLabel(employee.role) : "Assigned"}
                    </span>
                  </span>
                  {canManage && (
                    <form
                      action={removeWorkOrderEmployeeAction.bind(
                        null,
                        id,
                        workOrderId,
                        assignment.profile_id,
                      )}
                    >
                      <button type="submit" className="text-xs text-graph hover:text-weld">
                        Remove
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
            {assignments.length === 0 && (
              <li className="text-sm text-graph">No crew assigned.</li>
            )}
          </ul>

          {canManage && availableEmployees.length > 0 && (
            <form
              action={assignWorkOrderEmployeeAction.bind(null, id, workOrderId)}
              className="mt-5 flex gap-2"
            >
              <select
                name="profile_id"
                defaultValue=""
                required
                className="min-w-0 flex-1 rounded border border-rule bg-bone px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Add employee…
                </option>
                {availableEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name ?? employee.login}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-secondary px-3 py-2 text-sm">
                Assign
              </button>
            </form>
          )}
        </aside>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-medium text-ink">Labor time</h2>
          <span className="font-mono text-sm text-graph">{formatHours(actualHours)}</span>
        </div>
        <div className="mt-4 overflow-hidden rounded border border-rule bg-paper">
          {timeEntries.map((entry) => {
            const employee = employeeMap.get(entry.profile_id);
            const canDelete = canManage || (canLog && entry.profile_id === user.id);
            return (
              <div
                key={entry.id}
                className="grid gap-2 border-b border-rule px-4 py-3 text-sm last:border-0 sm:grid-cols-[8rem_10rem_1fr_5rem_3rem] sm:items-center"
              >
                <span className="font-mono text-xs text-graph">{entry.work_date}</span>
                <span className="text-ink">
                  {employee?.full_name ?? employee?.login ?? "Employee"}
                </span>
                <span className="text-graph">{entry.note ?? "—"}</span>
                <span className="font-mono text-ink">{formatHours(entry.hours)}</span>
                {canDelete ? (
                  <form
                    action={deleteTimeEntryAction.bind(
                      null,
                      id,
                      workOrderId,
                      entry.id,
                    )}
                  >
                    <button type="submit" className="text-xs text-graph hover:text-weld">
                      ×
                    </button>
                  </form>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
          {timeEntries.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-graph">No time logged yet.</p>
          )}
        </div>
        {canLog && (
          <div className="mt-4">
            <TimeEntryForm
              projectId={id}
              workOrderId={workOrderId}
              defaultWorkDate={vancouverDate()}
            />
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-medium text-ink">Materials and parts</h2>
          <span className="font-mono text-sm text-graph">{formatCad(materialCost)}</span>
        </div>
        {canManageWarehouse && (
          <div className="mt-4">
            <InventoryIssueForm
              projectId={id}
              workOrderId={workOrderId}
              items={inventoryItems}
            />
          </div>
        )}
        <div className="mt-4 overflow-hidden rounded border border-rule bg-paper">
          {materialEntries.map((entry) => {
            const employee = employeeMap.get(entry.entered_by);
            const warehouseEntry = !!entry.inventory_movement_id;
            const canDelete =
              !warehouseEntry &&
              !entry.reversed_at &&
              (canManage || (canLog && entry.entered_by === user.id));
            return (
              <div
                key={entry.id}
                className={`grid gap-2 border-b border-rule px-4 py-3 text-sm last:border-0 lg:grid-cols-[1fr_8rem_7rem_8rem_8rem_10rem_6rem] lg:items-center ${
                  entry.reversed_at ? "opacity-50" : ""
                }`}
              >
                <span className="text-ink">
                  {entry.description}
                  {warehouseEntry && (
                    <span className="ml-2 rounded bg-ink/5 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wide text-graph">
                      Warehouse{entry.reversed_at ? " · reversed" : ""}
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs text-graph">{entry.part_number ?? "—"}</span>
                <span className="font-mono text-xs text-graph">
                  {entry.quantity} {entry.unit}
                </span>
                <span className="font-mono text-xs text-ink">{formatCad(entry.unit_cost)}</span>
                <span
                  className={`font-mono text-sm text-ink ${
                    entry.reversed_at ? "line-through" : ""
                  }`}
                >
                  {formatCad(entry.line_total)}
                </span>
                <span className="truncate text-xs text-graph">
                  {employee?.full_name ?? employee?.login ?? "Employee"}
                </span>
                {canDelete ? (
                  <form
                    action={deleteMaterialEntryAction.bind(
                      null,
                      id,
                      workOrderId,
                      entry.id,
                    )}
                  >
                    <button type="submit" className="text-xs text-graph hover:text-weld">
                      ×
                    </button>
                  </form>
                ) : warehouseEntry && canManageWarehouse && !entry.reversed_at ? (
                  <form
                    action={reverseInventoryIssueAction.bind(
                      null,
                      id,
                      workOrderId,
                      entry.id,
                    )}
                  >
                    <button type="submit" className="text-xs text-graph hover:text-weld">
                      Reverse
                    </button>
                  </form>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
          {materialEntries.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-graph">
              No materials recorded yet.
            </p>
          )}
        </div>
        {canLog && (
          <div className="mt-4">
            <MaterialEntryForm projectId={id} workOrderId={workOrderId} />
          </div>
        )}
      </section>

      {(workOrder.started_at || workOrder.completed_at) && (
        <p className="mt-8 text-xs text-graph">
          Started {formatShortDate(workOrder.started_at)} · completed{" "}
          {formatShortDate(workOrder.completed_at)}
        </p>
      )}
    </div>
  );
}
