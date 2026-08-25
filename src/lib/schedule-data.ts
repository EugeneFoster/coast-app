import "server-only";

import { requireOperationsManager, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  EmployeeSpecialty,
  ServiceCategory,
  UserRole,
  WorkOrderPriority,
  WorkOrderStatus,
} from "@/lib/types";

export type ScheduleEmployee = {
  id: string;
  full_name: string | null;
  login: string;
  role: UserRole;
  job_title: string | null;
  specialties: EmployeeSpecialty[];
};

export type ScheduleWorkOrder = {
  id: string;
  work_order_number: string;
  title: string;
  project_id: string;
  project_name: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  location: string | null;
};

export type TeamScheduleSlot = {
  slot_id: string;
  work_order_id: string;
  project_id: string;
  work_order_number: string;
  work_order_title: string;
  work_order_status: WorkOrderStatus;
  work_order_priority: WorkOrderPriority;
  project_name: string;
  location: string | null;
  profile_id: string;
  employee_name: string;
  employee_role: UserRole;
  starts_at: string;
  ends_at: string;
  note: string | null;
};

export type MyScheduleSlot = Omit<
  TeamScheduleSlot,
  "profile_id" | "employee_name" | "employee_role"
> & {
  work_order_description: string | null;
  service_category: ServiceCategory;
};

export type MyUnscheduledWorkOrder = {
  work_order_id: string;
  project_id: string;
  work_order_number: string;
  work_order_title: string;
  work_order_description: string | null;
  work_order_status: WorkOrderStatus;
  work_order_priority: WorkOrderPriority;
  service_category: ServiceCategory;
  project_name: string;
  location: string | null;
};

export async function getTeamSchedule(startDate: string, endDate: string) {
  await requireOperationsManager();
  const supabase = await createClient();
  const [slotsResult, employeesResult, workOrdersResult] = await Promise.all([
    supabase.rpc("team_schedule", {
      p_start_date: startDate,
      p_end_date: endDate,
    }),
    supabase.rpc("schedule_employee_directory"),
    supabase.rpc("schedule_work_order_directory"),
  ]);
  const error = slotsResult.error ?? employeesResult.error ?? workOrdersResult.error;
  if (error) throw new Error(`Could not load team schedule: ${error.message}`);

  return {
    slots: (slotsResult.data ?? []) as TeamScheduleSlot[],
    employees: (employeesResult.data ?? []).map((employee: ScheduleEmployee) => ({
      ...employee,
      specialties: employee.specialties ?? [],
    })) as ScheduleEmployee[],
    workOrders: (workOrdersResult.data ?? []) as ScheduleWorkOrder[],
  };
}

export async function getMyDay(startDate: string, endDate: string) {
  await requireUser();
  const supabase = await createClient();
  const [slotsResult, unscheduledResult] = await Promise.all([
    supabase.rpc("my_schedule", {
      p_start_date: startDate,
      p_end_date: endDate,
    }),
    supabase.rpc("my_unscheduled_work_orders"),
  ]);
  const error = slotsResult.error ?? unscheduledResult.error;
  if (error) throw new Error(`Could not load My day: ${error.message}`);
  return {
    slots: (slotsResult.data ?? []) as MyScheduleSlot[],
    unscheduled: (unscheduledResult.data ?? []) as MyUnscheduledWorkOrder[],
  };
}
