import "server-only";

import {
  requirePaintYardManager,
  requirePaintYardViewer,
} from "@/lib/auth";
import { getOperationsDirectory, type OperationsEmployee } from "@/lib/operations-data";
import { createClient } from "@/lib/supabase/server";
import type {
  CoatingApplicationMethod,
  CoatingOperation,
  EstimateStatus,
  InvoiceStatus,
  PaintJobStage,
  PaintScopeArea,
  PaintTaskStatus,
  VesselHullMaterial,
  WorkOrderPriority,
  WorkOrderStatus,
} from "@/lib/types";

export type PaintYardJob = {
  job_id: string;
  project_id: string;
  project_name: string;
  client_name: string;
  work_order_id: string;
  work_order_number: string;
  work_order_status: WorkOrderStatus;
  opportunity_id: string | null;
  estimate_id: string | null;
  estimate_number: string | null;
  estimate_status: EstimateStatus | null;
  estimate_total: number | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: InvoiceStatus | null;
  invoice_total: number | null;
  invoice_balance: number | null;
  vessel_name: string;
  vessel_make_model: string | null;
  vessel_length_ft: number | null;
  hull_material: VesselHullMaterial;
  scope_areas: PaintScopeArea[];
  stage: PaintJobStage;
  priority: WorkOrderPriority;
  arrival_date: string;
  due_date: string;
  planned_hours: number;
  actual_hours: number;
  material_cost: number | null;
  yard_location: string | null;
  specification: string | null;
  stage_entered_at: string;
  ready_at: string | null;
  delivered_at: string | null;
  crew_names: string[];
  checklist_done: number;
  checklist_total: number;
  current_user_assigned: boolean;
  last_coating_product: string | null;
  last_coating_color: string | null;
  last_coating_operation: CoatingOperation | null;
  last_coating_at: string | null;
};

export type PaintYardProject = {
  project_id: string;
  project_name: string;
  client_name: string;
  vessel_name: string | null;
  vessel_make_model: string | null;
  vessel_length_ft: number | null;
  has_active_paint_job: boolean;
};

export type PaintChecklistTask = {
  task_id: string;
  stage: PaintJobStage;
  code: string;
  label: string;
  sort_order: number;
  required: boolean;
  status: PaintTaskStatus;
  note: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
};

export type PaintCoatingLog = {
  log_id: string;
  area: PaintScopeArea;
  operation: CoatingOperation;
  coat_number: number | null;
  manufacturer: string;
  product_name: string;
  product_code: string | null;
  color: string | null;
  batch_lot: string | null;
  quantity_used: number;
  quantity_unit: string;
  unit_cost: number | null;
  mix_ratio: string | null;
  reducer_thinner: string | null;
  application_method: CoatingApplicationMethod;
  ambient_temp_c: number | null;
  substrate_temp_c: number | null;
  relative_humidity_pct: number | null;
  dew_point_c: number | null;
  wet_film_mils: number | null;
  dry_film_mils: number | null;
  tds_checked: boolean;
  sds_checked: boolean;
  ppe_checked: boolean;
  ventilation_checked: boolean;
  surface_clean_dry: boolean;
  applied_at: string;
  applied_by_name: string;
  note: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

export type PaintStageEvent = {
  event_id: string;
  old_stage: PaintJobStage | null;
  new_stage: PaintJobStage;
  note: string | null;
  changed_by_name: string;
  created_at: string;
};

export async function getPaintYardBoard() {
  await requirePaintYardViewer();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("paint_yard_board");
  if (error) throw new Error(`Could not load Paint Yard: ${error.message}`);
  return (data ?? []) as PaintYardJob[];
}

export async function getPaintJob(jobId: string) {
  await requirePaintYardViewer();
  const supabase = await createClient();
  const [boardResult, tasksResult, coatingResult, stageResult] = await Promise.all([
    supabase.rpc("paint_yard_board"),
    supabase.rpc("paint_job_checklist", { p_paint_job_id: jobId }),
    supabase.rpc("paint_job_coating_history", { p_paint_job_id: jobId }),
    supabase.rpc("paint_job_stage_history", { p_paint_job_id: jobId }),
  ]);
  const error = boardResult.error ?? tasksResult.error ?? coatingResult.error ?? stageResult.error;
  if (error) throw new Error(`Could not load paint job: ${error.message}`);
  const job = ((boardResult.data ?? []) as PaintYardJob[]).find(
    ({ job_id }) => job_id === jobId,
  );
  return {
    job: job ?? null,
    tasks: (tasksResult.data ?? []) as PaintChecklistTask[],
    coatingLogs: (coatingResult.data ?? []) as PaintCoatingLog[],
    stageEvents: (stageResult.data ?? []) as PaintStageEvent[],
  };
}

export async function getPaintYardCreationOptions(): Promise<{
  projects: PaintYardProject[];
  employees: OperationsEmployee[];
}> {
  await requirePaintYardManager();
  const supabase = await createClient();
  const [projectResult, employees] = await Promise.all([
    supabase.rpc("paint_yard_project_directory"),
    getOperationsDirectory(),
  ]);
  if (projectResult.error) {
    throw new Error(`Could not load paint projects: ${projectResult.error.message}`);
  }
  return {
    projects: (projectResult.data ?? []) as PaintYardProject[],
    employees,
  };
}
