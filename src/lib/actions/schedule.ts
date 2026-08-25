"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperationsManager } from "@/lib/auth";
import {
  isIsoDate,
  isLocalDateTime,
  type ScheduleActionState,
} from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function revalidateSchedule(projectId?: string, workOrderId?: string) {
  revalidatePath("/schedule");
  revalidatePath("/my-day");
  revalidatePath("/work-orders");
  if (projectId && workOrderId) {
    revalidatePath(`/projects/${projectId}/work-orders/${workOrderId}`);
  }
}

export async function saveScheduleSlotAction(
  _previous: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  await requireOperationsManager();
  const slotId = clean(formData, "slot_id") || null;
  const workOrderId = clean(formData, "work_order_id");
  const profileId = clean(formData, "profile_id");
  const startsLocal = clean(formData, "starts_local");
  const endsLocal = clean(formData, "ends_local");
  const note = clean(formData, "note") || null;
  const returnWeek = clean(formData, "return_week");

  if (slotId && !UUID_RE.test(slotId)) {
    return { status: "error", message: "Schedule slot not found." };
  }
  if (!UUID_RE.test(workOrderId) || !UUID_RE.test(profileId)) {
    return { status: "error", message: "Select a valid work order and employee." };
  }
  if (!isLocalDateTime(startsLocal) || !isLocalDateTime(endsLocal)) {
    return { status: "error", message: "Enter valid Vancouver start and end times." };
  }
  if (endsLocal <= startsLocal) {
    return { status: "error", message: "Shift end must be after its start." };
  }
  const durationMs = new Date(`${endsLocal}:00Z`).valueOf() -
    new Date(`${startsLocal}:00Z`).valueOf();
  if (durationMs > 24 * 60 * 60 * 1000) {
    return { status: "error", message: "A single shift cannot exceed 24 hours." };
  }
  if (note && note.length > 500) {
    return { status: "error", message: "Schedule note is too long." };
  }

  const supabase = await createClient();
  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("id, project_id")
    .eq("id", workOrderId)
    .maybeSingle();
  if (!workOrder) {
    return { status: "error", message: "Work order not found." };
  }

  const { error } = await supabase.rpc("save_work_order_schedule_slot", {
    p_slot_id: slotId,
    p_work_order_id: workOrderId,
    p_profile_id: profileId,
    p_starts_local: startsLocal,
    p_ends_local: endsLocal,
    p_note: note,
  });
  if (error) return { status: "error", message: error.message };

  revalidateSchedule(workOrder.project_id, workOrder.id);
  redirect(`/schedule?week=${isIsoDate(returnWeek) ? returnWeek : startsLocal.slice(0, 10)}`);
}

export async function cancelScheduleSlotAction(
  slotId: string,
  returnWeek: string,
  _previous: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  await requireOperationsManager();
  if (!UUID_RE.test(slotId)) {
    return { status: "error", message: "Schedule slot not found." };
  }
  const reason = clean(formData, "reason");
  if (reason.length < 5 || reason.length > 500) {
    return { status: "error", message: "Enter a reason from 5 to 500 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_work_order_schedule_slot", {
    p_slot_id: slotId,
    p_reason: reason,
  });
  if (error) return { status: "error", message: error.message };

  revalidateSchedule();
  redirect(`/schedule?week=${isIsoDate(returnWeek) ? returnWeek : ""}`);
}
