"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ASSIGNABLE_WORK_ORDER_ROLES,
  canManageOperations,
} from "@/lib/employee-roles";
import {
  isWorkOrderPriority,
  isWorkOrderStatus,
  type OperationsActionState,
} from "@/lib/operations";
import { isServiceCategory } from "@/lib/sales";
import {
  requireOperationsManager,
  requireUser,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function nullable(formData: FormData, name: string) {
  return clean(formData, name) || null;
}

function optionalNumber(formData: FormData, name: string) {
  const raw = clean(formData, name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

function validUuid(value: string) {
  return UUID_RE.test(value);
}

function validDate(value: string | null) {
  if (!value) return true;
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validateIdentifiers(projectId: string, workOrderId?: string) {
  return validUuid(projectId) && (!workOrderId || validUuid(workOrderId));
}

function revalidateOperations(projectId: string, workOrderId?: string) {
  revalidatePath("/work-orders");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/work-orders`);
  if (workOrderId) {
    revalidatePath(`/projects/${projectId}/work-orders/${workOrderId}`);
  }
}

async function assertWorkOrder(projectId: string, workOrderId: string) {
  if (!validateIdentifiers(projectId, workOrderId)) {
    throw new Error("Invalid work order reference.");
  }
  const { user, profile } = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("work_orders")
    .select("id, project_id, status")
    .eq("id", workOrderId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) throw new Error("Work order not found or access denied.");
  return { user, profile, supabase, workOrder: data };
}

async function assertCanLogWorkOrder(projectId: string, workOrderId: string) {
  const context = await assertWorkOrder(projectId, workOrderId);
  if (canManageOperations(context.profile.role)) return context;
  if (!ASSIGNABLE_WORK_ORDER_ROLES.includes(context.profile.role)) {
    throw new Error("Your role cannot log operational work.");
  }
  const { data: assignment } = await context.supabase
    .from("work_order_assignments")
    .select("work_order_id")
    .eq("work_order_id", workOrderId)
    .eq("profile_id", context.user.id)
    .maybeSingle();
  if (!assignment) throw new Error("You are not assigned to this work order.");
  return context;
}

function workOrderPayload(formData: FormData) {
  return {
    title: clean(formData, "title"),
    description: nullable(formData, "description"),
    serviceCategory: clean(formData, "service_category"),
    priority: clean(formData, "priority"),
    scheduledStart: nullable(formData, "scheduled_start"),
    scheduledEnd: nullable(formData, "scheduled_end"),
    estimatedHours: optionalNumber(formData, "estimated_hours"),
    location: nullable(formData, "location"),
  };
}

function validateWorkOrderPayload(payload: ReturnType<typeof workOrderPayload>) {
  if (!payload.title) return "Work order title is required.";
  if (!isServiceCategory(payload.serviceCategory)) {
    return "Select a valid service category.";
  }
  if (!isWorkOrderPriority(payload.priority)) {
    return "Select a valid priority.";
  }
  if (!validDate(payload.scheduledStart) || !validDate(payload.scheduledEnd)) {
    return "Enter valid schedule dates.";
  }
  if (
    payload.scheduledStart &&
    payload.scheduledEnd &&
    payload.scheduledEnd < payload.scheduledStart
  ) {
    return "Scheduled end cannot be before the start date.";
  }
  if (
    Number.isNaN(payload.estimatedHours) ||
    (payload.estimatedHours !== null && payload.estimatedHours < 0)
  ) {
    return "Estimated hours cannot be negative.";
  }
  return null;
}

export async function createWorkOrderAction(
  projectId: string,
  _previous: OperationsActionState,
  formData: FormData,
): Promise<OperationsActionState> {
  const { user } = await requireOperationsManager();
  if (!validateIdentifiers(projectId)) {
    return { status: "error", message: "Invalid project reference." };
  }

  const payload = workOrderPayload(formData);
  const validationError = validateWorkOrderPayload(payload);
  if (validationError) return { status: "error", message: validationError };

  const assigneeIds = [...new Set(formData.getAll("assignee_ids").map(String))];
  if (assigneeIds.some((id) => !validUuid(id))) {
    return { status: "error", message: "Select valid employees." };
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { status: "error", message: "Project not found." };

  if (assigneeIds.length > 0) {
    const { data: assignees } = await supabase
      .from("profiles")
      .select("id")
      .in("id", assigneeIds)
      .in("role", ASSIGNABLE_WORK_ORDER_ROLES)
      .eq("status", "active");
    if ((assignees ?? []).length !== assigneeIds.length) {
      return { status: "error", message: "One or more employees cannot be assigned." };
    }
  }

  const { data: workOrder, error } = await supabase
    .from("work_orders")
    .insert({
      project_id: projectId,
      title: payload.title,
      description: payload.description,
      service_category: payload.serviceCategory,
      priority: payload.priority,
      scheduled_start: payload.scheduledStart,
      scheduled_end: payload.scheduledEnd,
      estimated_hours: payload.estimatedHours,
      location: payload.location,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !workOrder) {
    return { status: "error", message: error?.message ?? "Could not create work order." };
  }

  if (assigneeIds.length > 0) {
    const { error: assignmentError } = await supabase
      .from("work_order_assignments")
      .insert(
        assigneeIds.map((profileId) => ({
          work_order_id: workOrder.id,
          profile_id: profileId,
          assigned_by: user.id,
        })),
      );
    if (assignmentError) {
      await supabase.from("work_orders").delete().eq("id", workOrder.id);
      return { status: "error", message: assignmentError.message };
    }
  }

  revalidateOperations(projectId, workOrder.id);
  redirect(`/projects/${projectId}/work-orders/${workOrder.id}`);
}

export async function updateWorkOrderAction(
  projectId: string,
  workOrderId: string,
  _previous: OperationsActionState,
  formData: FormData,
): Promise<OperationsActionState> {
  await requireOperationsManager();
  if (!validateIdentifiers(projectId, workOrderId)) {
    return { status: "error", message: "Invalid work order reference." };
  }
  const payload = workOrderPayload(formData);
  const validationError = validateWorkOrderPayload(payload);
  if (validationError) return { status: "error", message: validationError };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("work_orders")
    .update({
      title: payload.title,
      description: payload.description,
      service_category: payload.serviceCategory,
      priority: payload.priority,
      scheduled_start: payload.scheduledStart,
      scheduled_end: payload.scheduledEnd,
      estimated_hours: payload.estimatedHours,
      location: payload.location,
    })
    .eq("id", workOrderId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    return {
      status: "error",
      message: error?.message ?? "Work order not found.",
    };
  }

  revalidateOperations(projectId, workOrderId);
  return { status: "success", message: "Work order updated." };
}

export async function assignWorkOrderEmployeeAction(
  projectId: string,
  workOrderId: string,
  formData: FormData,
) {
  const { user } = await requireOperationsManager();
  const profileId = clean(formData, "profile_id");
  if (!validateIdentifiers(projectId, workOrderId) || !validUuid(profileId)) {
    throw new Error("Invalid work order assignment.");
  }

  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .in("role", ASSIGNABLE_WORK_ORDER_ROLES)
    .eq("status", "active")
    .maybeSingle();
  if (!employee) throw new Error("Employee is not available for operations.");

  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("id")
    .eq("id", workOrderId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!workOrder) throw new Error("Work order not found.");

  const { error } = await supabase.from("work_order_assignments").upsert(
    {
      work_order_id: workOrderId,
      profile_id: profileId,
      assigned_by: user.id,
    },
    { onConflict: "work_order_id,profile_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  revalidateOperations(projectId, workOrderId);
}

export async function removeWorkOrderEmployeeAction(
  projectId: string,
  workOrderId: string,
  profileId: string,
) {
  await requireOperationsManager();
  if (
    !validateIdentifiers(projectId, workOrderId) ||
    !validUuid(profileId)
  ) {
    throw new Error("Invalid work order assignment.");
  }
  const supabase = await createClient();
  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("id")
    .eq("id", workOrderId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!workOrder) throw new Error("Work order not found.");
  const { error } = await supabase
    .from("work_order_assignments")
    .delete()
    .eq("work_order_id", workOrderId)
    .eq("profile_id", profileId);
  if (error) throw new Error(error.message);
  revalidateOperations(projectId, workOrderId);
}

export async function updateWorkOrderStatusAction(
  projectId: string,
  workOrderId: string,
  nextStatus: string,
) {
  if (!isWorkOrderStatus(nextStatus)) throw new Error("Invalid work order status.");
  const { supabase } = await assertWorkOrder(projectId, workOrderId);
  const { error } = await supabase.rpc("update_assigned_work_order_status", {
    p_work_order_id: workOrderId,
    p_status: nextStatus,
  });
  if (error) throw new Error(error.message);
  revalidateOperations(projectId, workOrderId);
}

export async function addTimeEntryAction(
  projectId: string,
  workOrderId: string,
  _previous: OperationsActionState,
  formData: FormData,
): Promise<OperationsActionState> {
  const { user, supabase } = await assertCanLogWorkOrder(projectId, workOrderId);
  const workDate = clean(formData, "work_date");
  const hours = optionalNumber(formData, "hours");
  if (!validDate(workDate)) {
    return { status: "error", message: "Enter a valid work date." };
  }
  if (hours === null || Number.isNaN(hours) || hours <= 0 || hours > 24) {
    return { status: "error", message: "Hours must be greater than 0 and no more than 24." };
  }

  const { error } = await supabase.from("time_entries").insert({
    work_order_id: workOrderId,
    profile_id: user.id,
    work_date: workDate,
    hours,
    note: nullable(formData, "note"),
    created_by: user.id,
  });
  if (error) return { status: "error", message: error.message };
  revalidateOperations(projectId, workOrderId);
  return { status: "success", message: "Time entry added." };
}

export async function deleteTimeEntryAction(
  projectId: string,
  workOrderId: string,
  entryId: string,
) {
  if (!validUuid(entryId)) throw new Error("Invalid time entry.");
  const { user, profile, supabase } = await assertCanLogWorkOrder(
    projectId,
    workOrderId,
  );
  const { data: entry } = await supabase
    .from("time_entries")
    .select("id, profile_id")
    .eq("id", entryId)
    .eq("work_order_id", workOrderId)
    .maybeSingle();
  if (!entry) throw new Error("Time entry not found.");
  if (!canManageOperations(profile.role) && entry.profile_id !== user.id) {
    throw new Error("You can only remove your own time entries.");
  }
  const { error } = await supabase.from("time_entries").delete().eq("id", entryId);
  if (error) throw new Error(error.message);
  revalidateOperations(projectId, workOrderId);
}

export async function addMaterialEntryAction(
  projectId: string,
  workOrderId: string,
  _previous: OperationsActionState,
  formData: FormData,
): Promise<OperationsActionState> {
  const { user, supabase } = await assertCanLogWorkOrder(projectId, workOrderId);
  const description = clean(formData, "description");
  const quantity = optionalNumber(formData, "quantity");
  const unitCost = optionalNumber(formData, "unit_cost") ?? 0;
  if (!description) return { status: "error", message: "Material description is required." };
  if (quantity === null || Number.isNaN(quantity) || quantity <= 0) {
    return { status: "error", message: "Quantity must be greater than zero." };
  }
  if (Number.isNaN(unitCost) || unitCost < 0) {
    return { status: "error", message: "Unit cost cannot be negative." };
  }

  const { error } = await supabase.from("material_entries").insert({
    work_order_id: workOrderId,
    description,
    part_number: nullable(formData, "part_number"),
    quantity,
    unit: clean(formData, "unit") || "ea",
    unit_cost: unitCost,
    entered_by: user.id,
  });
  if (error) return { status: "error", message: error.message };
  revalidateOperations(projectId, workOrderId);
  return { status: "success", message: "Material usage added." };
}

export async function deleteMaterialEntryAction(
  projectId: string,
  workOrderId: string,
  entryId: string,
) {
  if (!validUuid(entryId)) throw new Error("Invalid material entry.");
  const { user, profile, supabase } = await assertCanLogWorkOrder(
    projectId,
    workOrderId,
  );
  const { data: entry } = await supabase
    .from("material_entries")
    .select("id, entered_by, inventory_movement_id")
    .eq("id", entryId)
    .eq("work_order_id", workOrderId)
    .maybeSingle();
  if (!entry) throw new Error("Material entry not found.");
  if (entry.inventory_movement_id) {
    throw new Error("Warehouse issues must be reversed through inventory.");
  }
  if (!canManageOperations(profile.role) && entry.entered_by !== user.id) {
    throw new Error("You can only remove your own material entries.");
  }
  const { error } = await supabase.from("material_entries").delete().eq("id", entryId);
  if (error) throw new Error(error.message);
  revalidateOperations(projectId, workOrderId);
}
