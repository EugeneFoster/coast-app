import Link from "next/link";
import {
  formatHours,
  workOrderPriorityLabel,
  workOrderStatusLabel,
} from "@/lib/operations";
import { formatCad, formatShortDate } from "@/lib/sales";
import type { WorkOrder } from "@/lib/types";

const statusAccent: Record<WorkOrder["status"], string> = {
  planned: "border-rule",
  ready: "border-ink/30",
  in_progress: "border-weld",
  blocked: "border-weld bg-weld/5",
  completed: "border-ink bg-ink text-bone",
  cancelled: "border-rule opacity-60",
};

export function WorkOrderCard({
  workOrder,
  projectName,
  assignees,
  actualHours,
  materialCost,
}: {
  workOrder: WorkOrder;
  projectName?: string;
  assignees: string[];
  actualHours: number;
  materialCost: number;
}) {
  return (
    <Link
      href={`/projects/${workOrder.project_id}/work-orders/${workOrder.id}`}
      className={`block rounded border bg-paper p-4 transition-colors hover:border-weld ${statusAccent[workOrder.status]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.68rem] uppercase tracking-wide opacity-65">
            {workOrder.work_order_number}
          </p>
          <h3 className="mt-1 font-medium leading-snug">{workOrder.title}</h3>
          {projectName && (
            <p className="mt-1 truncate text-xs opacity-65">{projectName}</p>
          )}
        </div>
        <span className="shrink-0 rounded border border-current/20 px-2 py-1 text-[0.65rem] uppercase tracking-wide opacity-75">
          {workOrderPriorityLabel(workOrder.priority)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs opacity-75">
        <div>
          <p>Schedule</p>
          <p className="mt-0.5 font-mono text-[0.7rem]">
            {formatShortDate(workOrder.scheduled_start)}
            {workOrder.scheduled_end && workOrder.scheduled_end !== workOrder.scheduled_start
              ? ` – ${formatShortDate(workOrder.scheduled_end)}`
              : ""}
          </p>
        </div>
        <div className="text-right">
          <p>Hours</p>
          <p className="mt-0.5 font-mono text-[0.7rem]">
            {formatHours(actualHours)} / {formatHours(workOrder.estimated_hours)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-current/15 pt-3 text-xs">
        <span className="truncate opacity-70">
          {assignees.length > 0 ? assignees.join(", ") : "Unassigned"}
        </span>
        <span className="shrink-0 font-mono opacity-80">
          {formatCad(materialCost)}
        </span>
      </div>
      <p className="sr-only">{workOrderStatusLabel(workOrder.status)}</p>
    </Link>
  );
}
