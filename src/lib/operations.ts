import type {
  WorkOrderPriority,
  WorkOrderStatus,
} from "@/lib/types";

export type OperationsActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_OPERATIONS_ACTION_STATE: OperationsActionState = {
  status: "idle",
  message: "",
};

export const WORK_ORDER_STATUSES: Array<{
  value: WorkOrderStatus;
  label: string;
}> = [
  { value: "planned", label: "Planned" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const WORK_ORDER_PRIORITIES: Array<{
  value: WorkOrderPriority;
  label: string;
}> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const statusValues = new Set(WORK_ORDER_STATUSES.map(({ value }) => value));
const priorityValues = new Set(WORK_ORDER_PRIORITIES.map(({ value }) => value));

export function isWorkOrderStatus(value: string): value is WorkOrderStatus {
  return statusValues.has(value as WorkOrderStatus);
}

export function isWorkOrderPriority(value: string): value is WorkOrderPriority {
  return priorityValues.has(value as WorkOrderPriority);
}

export function workOrderStatusLabel(status: WorkOrderStatus) {
  return WORK_ORDER_STATUSES.find(({ value }) => value === status)?.label ?? status;
}

export function workOrderPriorityLabel(priority: WorkOrderPriority) {
  return WORK_ORDER_PRIORITIES.find(({ value }) => value === priority)?.label ?? priority;
}

export function allowedWorkOrderTransitions(
  status: WorkOrderStatus,
  canManage: boolean,
): WorkOrderStatus[] {
  const workerTransitions: Partial<Record<WorkOrderStatus, WorkOrderStatus[]>> = {
    ready: ["in_progress", "blocked"],
    in_progress: ["blocked", "completed"],
    blocked: ["in_progress"],
  };
  if (!canManage) return workerTransitions[status] ?? [];

  const managerTransitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
    planned: ["ready", "cancelled"],
    ready: ["in_progress", "blocked", "planned", "cancelled"],
    in_progress: ["blocked", "completed", "ready", "cancelled"],
    blocked: ["in_progress", "ready", "cancelled"],
    completed: ["in_progress"],
    cancelled: ["planned"],
  };
  return managerTransitions[status];
}

export function formatHours(value: number | string | null | undefined) {
  const hours = Number(value ?? 0);
  return `${new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(hours)} h`;
}
