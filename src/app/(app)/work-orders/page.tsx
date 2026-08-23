import { HairlineMotif } from "@/components/hairline-motif";
import { WorkOrderCard } from "@/components/work-order-card";
import { requireUser } from "@/lib/auth";
import {
  getOperationsDirectory,
  getOperationsProjects,
} from "@/lib/operations-data";
import {
  formatHours,
  WORK_ORDER_STATUSES,
} from "@/lib/operations";
import { formatCad } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type {
  MaterialEntry,
  TimeEntry,
  WorkOrder,
  WorkOrderAssignment,
} from "@/lib/types";

export default async function WorkOrdersPage() {
  await requireUser();
  const supabase = await createClient();
  const [{ data, error }, directory, projects] = await Promise.all([
    supabase
      .from("work_orders")
      .select("*")
      .order("scheduled_start", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    getOperationsDirectory(),
    getOperationsProjects(),
  ]);
  const workOrders = (data ?? []) as WorkOrder[];
  const workOrderIds = workOrders.map(({ id }) => id);

  let assignments: WorkOrderAssignment[] = [];
  let timeEntries: TimeEntry[] = [];
  let materialEntries: MaterialEntry[] = [];
  if (workOrderIds.length > 0) {
    const [assignmentResult, timeResult, materialResult] = await Promise.all([
      supabase
        .from("work_order_assignments")
        .select("*")
        .in("work_order_id", workOrderIds),
      supabase.from("time_entries").select("*").in("work_order_id", workOrderIds),
      supabase
        .from("material_entries")
        .select("*")
        .in("work_order_id", workOrderIds),
    ]);
    assignments = (assignmentResult.data ?? []) as WorkOrderAssignment[];
    timeEntries = (timeResult.data ?? []) as TimeEntry[];
    materialEntries = (materialResult.data ?? []) as MaterialEntry[];
  }

  const employeeNames = new Map(
    directory.map((employee) => [
      employee.id,
      employee.full_name ?? employee.login,
    ]),
  );
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const active = workOrders.filter(
    ({ status }) => status !== "completed" && status !== "cancelled",
  );
  const totalHours = timeEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);
  const totalMaterialCost = materialEntries.reduce(
    (sum, entry) => sum + Number(entry.line_total),
    0,
  );

  return (
    <div className="px-8 pb-12">
      <section className="pt-8">
        <h1 className="font-display text-3xl font-medium text-ink">Work orders</h1>
        <p className="mt-1 text-sm text-graph">
          Crew schedule, shop progress, labor, and materials across accessible projects.
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          <div className="rounded border border-rule bg-paper p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-graph">Open work</p>
            <p className="mt-2 font-display text-2xl text-ink">{active.length}</p>
          </div>
          <div className="rounded border border-rule bg-paper p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-graph">Logged time</p>
            <p className="mt-2 font-display text-2xl text-ink">{formatHours(totalHours)}</p>
          </div>
          <div className="rounded border border-rule bg-paper p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-graph">Materials used</p>
            <p className="mt-2 font-display text-2xl text-ink">{formatCad(totalMaterialCost)}</p>
          </div>
        </div>
        <HairlineMotif className="mt-6 pb-1" />
      </section>

      {error && (
        <p className="mt-6 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
          Could not load work orders: {error.message}
        </p>
      )}

      <section className="mt-8 overflow-x-auto pb-4">
        <div className="grid min-w-[1500px] grid-cols-6 gap-4">
          {WORK_ORDER_STATUSES.map((column) => {
            const rows = workOrders.filter(({ status }) => status === column.value);
            return (
              <div key={column.value} className="min-w-0">
                <div className="mb-3 flex items-center justify-between border-b border-rule pb-2">
                  <h2 className="text-sm font-medium text-ink">{column.label}</h2>
                  <span className="font-mono text-xs text-graph">{rows.length}</span>
                </div>
                <div className="space-y-3">
                  {rows.map((workOrder) => {
                    const assigneeNames = assignments
                      .filter(({ work_order_id }) => work_order_id === workOrder.id)
                      .map(({ profile_id }) => employeeNames.get(profile_id) ?? "Employee");
                    const actualHours = timeEntries
                      .filter(({ work_order_id }) => work_order_id === workOrder.id)
                      .reduce((sum, entry) => sum + Number(entry.hours), 0);
                    const materialCost = materialEntries
                      .filter(({ work_order_id }) => work_order_id === workOrder.id)
                      .reduce((sum, entry) => sum + Number(entry.line_total), 0);
                    return (
                      <WorkOrderCard
                        key={workOrder.id}
                        workOrder={workOrder}
                        projectName={projectNames.get(workOrder.project_id)}
                        assignees={assigneeNames}
                        actualHours={actualHours}
                        materialCost={materialCost}
                      />
                    );
                  })}
                  {rows.length === 0 && (
                    <p className="rounded border border-dashed border-rule px-3 py-8 text-center text-xs text-graph">
                      No {column.label.toLowerCase()} work orders
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
