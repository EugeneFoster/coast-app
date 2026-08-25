"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireBillingManager,
  requirePaintYardManager,
  requirePaintYardWorker,
} from "@/lib/auth";
import {
  APPLICATION_METHODS,
  COATING_OPERATIONS,
  HULL_MATERIALS,
  PAINT_JOB_STAGES,
  PAINT_SCOPE_AREAS,
  type PaintYardActionState,
} from "@/lib/paint-yard";
import { isIsoDate, isLocalDateTime } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import type {
  CoatingApplicationMethod,
  CoatingOperation,
  PaintJobStage,
  PaintScopeArea,
  PaintTaskStatus,
  VesselHullMaterial,
  WorkOrderPriority,
} from "@/lib/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const priorityValues = new Set<WorkOrderPriority>(["low", "normal", "high", "urgent"]);
const stageValues = new Set(PAINT_JOB_STAGES.map(({ value }) => value));
const scopeValues = new Set(PAINT_SCOPE_AREAS.map(({ value }) => value));
const hullValues = new Set(HULL_MATERIALS.map(({ value }) => value));
const operationValues = new Set(COATING_OPERATIONS.map(({ value }) => value));
const methodValues = new Set(APPLICATION_METHODS.map(({ value }) => value));
const taskStatusValues = new Set<PaintTaskStatus>([
  "pending",
  "complete",
  "not_applicable",
]);

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function nullable(formData: FormData, name: string) {
  return clean(formData, name) || null;
}

function numberValue(formData: FormData, name: string, required = false) {
  const raw = clean(formData, name);
  if (!raw) return required ? Number.NaN : null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function revalidatePaintYard(jobId?: string, projectId?: string, workOrderId?: string) {
  revalidatePath("/paint-yard");
  revalidatePath("/work-orders");
  revalidatePath("/schedule");
  revalidatePath("/my-day");
  if (jobId) revalidatePath(`/paint-yard/${jobId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (projectId && workOrderId) {
    revalidatePath(`/projects/${projectId}/work-orders/${workOrderId}`);
  }
}

export async function createPaintJobAction(
  _previous: PaintYardActionState,
  formData: FormData,
): Promise<PaintYardActionState> {
  await requirePaintYardManager();
  const projectId = clean(formData, "project_id");
  const vesselName = clean(formData, "vessel_name");
  const vesselMakeModel = nullable(formData, "vessel_make_model");
  const vesselLength = numberValue(formData, "vessel_length_ft");
  const hullMaterial = clean(formData, "hull_material") as VesselHullMaterial;
  const scopes = [...new Set(formData.getAll("scope_areas").map(String))] as PaintScopeArea[];
  const priority = clean(formData, "priority") as WorkOrderPriority;
  const arrivalDate = clean(formData, "arrival_date");
  const dueDate = clean(formData, "due_date");
  const plannedHours = numberValue(formData, "planned_hours", true);
  const laborRate = numberValue(formData, "labor_rate", true);
  const materialAllowance = numberValue(formData, "material_allowance", true);
  const taxRate = numberValue(formData, "tax_rate_percent", true);
  const yardLocation = nullable(formData, "yard_location");
  const specification = nullable(formData, "specification");
  const assigneeIds = [...new Set(formData.getAll("assignee_ids").map(String))];

  if (!UUID_RE.test(projectId)) return { status: "error", message: "Select a valid project." };
  if (!vesselName || vesselName.length > 120) {
    return { status: "error", message: "Enter the vessel name." };
  }
  if (!hullValues.has(hullMaterial) || scopes.length === 0 || scopes.some((scope) => !scopeValues.has(scope))) {
    return { status: "error", message: "Select the hull material and paint scope." };
  }
  if (!priorityValues.has(priority)) return { status: "error", message: "Select a priority." };
  if (!isIsoDate(arrivalDate) || !isIsoDate(dueDate) || dueDate < arrivalDate) {
    return { status: "error", message: "Enter valid arrival and due dates." };
  }
  if (
    Number.isNaN(plannedHours) || plannedHours === null || plannedHours <= 0 ||
    Number.isNaN(laborRate) || laborRate === null || laborRate < 0 ||
    Number.isNaN(materialAllowance) || materialAllowance === null || materialAllowance < 0 ||
    Number.isNaN(taxRate) || taxRate === null || taxRate < 0 || taxRate > 100
  ) {
    return { status: "error", message: "Check planned hours, quote rates, and tax." };
  }
  if (vesselLength !== null && (Number.isNaN(vesselLength) || vesselLength <= 0)) {
    return { status: "error", message: "Vessel length must be greater than zero." };
  }
  if (assigneeIds.some((id) => !UUID_RE.test(id))) {
    return { status: "error", message: "Select valid crew members." };
  }
  if ((vesselMakeModel?.length ?? 0) > 160 || (yardLocation?.length ?? 0) > 160 || (specification?.length ?? 0) > 5000) {
    return { status: "error", message: "One or more text fields are too long." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_paint_job", {
    p_project_id: projectId,
    p_vessel_name: vesselName,
    p_vessel_make_model: vesselMakeModel,
    p_vessel_length_ft: vesselLength,
    p_hull_material: hullMaterial,
    p_scope_areas: scopes,
    p_priority: priority,
    p_arrival_date: arrivalDate,
    p_due_date: dueDate,
    p_planned_hours: plannedHours,
    p_labor_rate: laborRate,
    p_material_allowance: materialAllowance,
    p_tax_rate_percent: taxRate,
    p_yard_location: yardLocation,
    p_specification: specification,
    p_assignee_ids: assigneeIds,
  });
  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not create paint job." };
  }
  revalidatePaintYard(data, projectId);
  redirect(`/paint-yard/${data}`);
}

export async function updatePaintJobPlanAction(
  jobId: string,
  projectId: string,
  workOrderId: string,
  _previous: PaintYardActionState,
  formData: FormData,
): Promise<PaintYardActionState> {
  await requirePaintYardManager();
  if (![jobId, projectId, workOrderId].every((id) => UUID_RE.test(id))) {
    return { status: "error", message: "Paint job not found." };
  }
  const arrivalDate = clean(formData, "arrival_date");
  const dueDate = clean(formData, "due_date");
  const plannedHours = numberValue(formData, "planned_hours", true);
  const priority = clean(formData, "priority") as WorkOrderPriority;
  const location = nullable(formData, "yard_location");
  const specification = nullable(formData, "specification");
  if (!isIsoDate(arrivalDate) || !isIsoDate(dueDate) || dueDate < arrivalDate) {
    return { status: "error", message: "Enter valid schedule dates." };
  }
  if (Number.isNaN(plannedHours) || plannedHours === null || plannedHours <= 0 || !priorityValues.has(priority)) {
    return { status: "error", message: "Enter valid planned hours and priority." };
  }
  if ((location?.length ?? 0) > 160 || (specification?.length ?? 0) > 5000) {
    return { status: "error", message: "Plan details are too long." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_paint_job_plan", {
    p_paint_job_id: jobId,
    p_arrival_date: arrivalDate,
    p_due_date: dueDate,
    p_planned_hours: plannedHours,
    p_priority: priority,
    p_yard_location: location,
    p_specification: specification,
  });
  if (error) return { status: "error", message: error.message };
  revalidatePaintYard(jobId, projectId, workOrderId);
  return { status: "success", message: "Paint plan updated." };
}

export async function movePaintJobStageAction(
  jobId: string,
  projectId: string,
  workOrderId: string,
  _previous: PaintYardActionState,
  formData: FormData,
): Promise<PaintYardActionState> {
  await requirePaintYardWorker();
  if (![jobId, projectId, workOrderId].every((id) => UUID_RE.test(id))) {
    return { status: "error", message: "Paint job not found." };
  }
  const targetStage = clean(formData, "target_stage") as PaintJobStage;
  const note = nullable(formData, "note");
  if (!stageValues.has(targetStage)) return { status: "error", message: "Select a valid stage." };
  if ((note?.length ?? 0) > 500) return { status: "error", message: "Stage note is too long." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_paint_job_stage", {
    p_paint_job_id: jobId,
    p_target_stage: targetStage,
    p_note: note,
  });
  if (error) return { status: "error", message: error.message };
  revalidatePaintYard(jobId, projectId, workOrderId);
  return { status: "success", message: `Moved to ${targetStage.replaceAll("_", " ")}.` };
}

export async function setPaintTaskStatusAction(
  taskId: string,
  jobId: string,
  _previous: PaintYardActionState,
  formData: FormData,
): Promise<PaintYardActionState> {
  await requirePaintYardWorker();
  if (!UUID_RE.test(taskId) || !UUID_RE.test(jobId)) {
    return { status: "error", message: "Checklist item not found." };
  }
  const status = clean(formData, "status") as PaintTaskStatus;
  const note = nullable(formData, "note");
  if (!taskStatusValues.has(status)) return { status: "error", message: "Select a checklist status." };
  if ((note?.length ?? 0) > 500) return { status: "error", message: "Checklist note is too long." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_paint_job_task_status", {
    p_task_id: taskId,
    p_status: status,
    p_note: note,
  });
  if (error) return { status: "error", message: error.message };
  revalidatePaintYard(jobId);
  return { status: "success", message: "Checklist saved." };
}

export async function logPaintCoatingAction(
  jobId: string,
  projectId: string,
  workOrderId: string,
  _previous: PaintYardActionState,
  formData: FormData,
): Promise<PaintYardActionState> {
  await requirePaintYardWorker();
  if (![jobId, projectId, workOrderId].every((id) => UUID_RE.test(id))) {
    return { status: "error", message: "Paint job not found." };
  }
  const area = clean(formData, "area") as PaintScopeArea;
  const operation = clean(formData, "operation") as CoatingOperation;
  const method = clean(formData, "application_method") as CoatingApplicationMethod;
  const coatNumber = numberValue(formData, "coat_number");
  const manufacturer = clean(formData, "manufacturer");
  const productName = clean(formData, "product_name");
  const quantity = numberValue(formData, "quantity_used", true);
  const unit = clean(formData, "quantity_unit");
  const unitCost = numberValue(formData, "unit_cost", true);
  const appliedLocal = clean(formData, "applied_local");
  const numericFields = {
    p_ambient_temp_c: numberValue(formData, "ambient_temp_c"),
    p_substrate_temp_c: numberValue(formData, "substrate_temp_c"),
    p_relative_humidity_pct: numberValue(formData, "relative_humidity_pct"),
    p_dew_point_c: numberValue(formData, "dew_point_c"),
    p_wet_film_mils: numberValue(formData, "wet_film_mils"),
    p_dry_film_mils: numberValue(formData, "dry_film_mils"),
  };
  if (!scopeValues.has(area) || !operationValues.has(operation) || !methodValues.has(method)) {
    return { status: "error", message: "Select valid area, operation, and method." };
  }
  if (!manufacturer || !productName || !unit || manufacturer.length > 120 || productName.length > 160 || unit.length > 20) {
    return { status: "error", message: "Enter the coating product, manufacturer, and unit." };
  }
  if (Number.isNaN(quantity) || quantity === null || quantity <= 0 || Number.isNaN(unitCost) || unitCost === null || unitCost < 0) {
    return { status: "error", message: "Enter a valid quantity and unit cost." };
  }
  if (coatNumber !== null && (Number.isNaN(coatNumber) || !Number.isInteger(coatNumber) || coatNumber < 1 || coatNumber > 20)) {
    return { status: "error", message: "Coat number must be a whole number from 1 to 20." };
  }
  if (!isLocalDateTime(appliedLocal)) return { status: "error", message: "Enter a valid Vancouver application time." };
  if (Object.values(numericFields).some((value) => Number.isNaN(value))) {
    return { status: "error", message: "Check the environmental and film readings." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("log_paint_coating", {
    p_paint_job_id: jobId,
    p_area: area,
    p_operation: operation,
    p_coat_number: coatNumber,
    p_manufacturer: manufacturer,
    p_product_name: productName,
    p_product_code: nullable(formData, "product_code"),
    p_color: nullable(formData, "color"),
    p_batch_lot: nullable(formData, "batch_lot"),
    p_quantity_used: quantity,
    p_quantity_unit: unit,
    p_unit_cost: unitCost,
    p_mix_ratio: nullable(formData, "mix_ratio"),
    p_reducer_thinner: nullable(formData, "reducer_thinner"),
    p_application_method: method,
    ...numericFields,
    p_tds_checked: checked(formData, "tds_checked"),
    p_sds_checked: checked(formData, "sds_checked"),
    p_ppe_checked: checked(formData, "ppe_checked"),
    p_ventilation_checked: checked(formData, "ventilation_checked"),
    p_surface_clean_dry: checked(formData, "surface_clean_dry"),
    p_applied_local: appliedLocal,
    p_note: nullable(formData, "note"),
  });
  if (error) return { status: "error", message: error.message };
  revalidatePaintYard(jobId, projectId, workOrderId);
  return { status: "success", message: "Coating and material usage logged." };
}

export async function voidPaintCoatingAction(
  logId: string,
  jobId: string,
  _previous: PaintYardActionState,
  formData: FormData,
): Promise<PaintYardActionState> {
  await requirePaintYardManager();
  if (!UUID_RE.test(logId) || !UUID_RE.test(jobId)) {
    return { status: "error", message: "Coating log not found." };
  }
  const reason = clean(formData, "reason");
  if (reason.length < 5 || reason.length > 500) {
    return { status: "error", message: "Enter a reason from 5 to 500 characters." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_paint_coating_log", {
    p_log_id: logId,
    p_reason: reason,
  });
  if (error) return { status: "error", message: error.message };
  revalidatePaintYard(jobId);
  return { status: "success", message: "Coating log voided; material cost removed." };
}

export async function createPaintJobInvoiceAction(
  jobId: string,
  _previous: PaintYardActionState,
  formData: FormData,
): Promise<PaintYardActionState> {
  await requireBillingManager();
  if (!UUID_RE.test(jobId)) return { status: "error", message: "Paint job not found." };
  const issueDate = clean(formData, "issue_date");
  const dueDate = clean(formData, "due_date");
  if (!isIsoDate(issueDate) || !isIsoDate(dueDate) || dueDate < issueDate) {
    return { status: "error", message: "Enter valid invoice dates." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_paint_job_invoice", {
    p_paint_job_id: jobId,
    p_issue_date: issueDate,
    p_due_date: dueDate,
  });
  if (error || !data) return { status: "error", message: error?.message ?? "Could not create invoice." };
  revalidatePaintYard(jobId);
  revalidatePath("/billing");
  redirect(`/billing/${data}`);
}
