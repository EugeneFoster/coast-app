import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkOrderCard } from "@/components/work-order-card";
import { requireUser } from "@/lib/auth";
import { canManageOperations } from "@/lib/employee-roles";
import {
  getOperationsDirectory,
  getOperationsProjects,
} from "@/lib/operations-data";
import { createClient } from "@/lib/supabase/server";
import type {
  MaterialEntry,
  TimeEntry,
  WorkOrder,
  WorkOrderAssignment,
} from "@/lib/types";

export default async function ProjectWorkOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireUser();
  const canManage = canManageOperations(profile.role);
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
        .eq("project_id", id)
        .order("scheduled_start", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      getOperationsDirectory(),
      getOperationsProjects(),
    ]);
  const project =
    accessibleProject ?? operationsProjects.find(({ id: projectId }) => projectId === id);
  if (!project) notFound();
  const workOrders = (workOrderData ?? []) as WorkOrder[];
  const workOrderIds = workOrders.map(({ id: workOrderId }) => workOrderId);
  let assignments: WorkOrderAssignment[] = [];
  let timeEntries: TimeEntry[] = [];
  let materialEntries: MaterialEntry[] = [];
  if (workOrderIds.length > 0) {
    const [assignmentResult, timeResult, materialResult] = await Promise.all([
      supabase.from("work_order_assignments").select("*").in("work_order_id", workOrderIds),
      supabase.from("time_entries").select("*").in("work_order_id", workOrderIds),
      supabase.from("material_entries").select("*").in("work_order_id", workOrderIds),
    ]);
    assignments = (assignmentResult.data ?? []) as WorkOrderAssignment[];
    timeEntries = (timeResult.data ?? []) as TimeEntry[];
    materialEntries = (materialResult.data ?? []) as MaterialEntry[];
  }
  const employeeNames = new Map(
    directory.map((employee) => [employee.id, employee.full_name ?? employee.login]),
  );

  return (
    <div className="mx-auto max-w-6xl px-8 pb-12 pt-8">
      <Link href={`/projects/${id}`} className="text-sm text-graph hover:text-ink">
        ← {project.name}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-ink">Project work orders</h1>
          <p className="mt-1 text-sm text-graph">{project.name}</p>
        </div>
        {canManage && (
          <Link
            href={`/projects/${id}/work-orders/new`}
            className="btn-primary px-4 py-2 text-sm"
          >
            New work order
          </Link>
        )}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workOrders.map((workOrder) => {
          const assignees = assignments
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
              assignees={assignees}
              actualHours={actualHours}
              materialCost={materialCost}
            />
          );
        })}
      </div>
      {workOrders.length === 0 && (
        <p className="mt-8 rounded border border-dashed border-rule py-16 text-center text-sm text-graph">
          No work orders for this project yet.
        </p>
      )}
    </div>
  );
}
