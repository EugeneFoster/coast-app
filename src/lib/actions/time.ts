"use server";

import { revalidatePath } from "next/cache";
import { assertProjectAccess } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

export type LogTimeInput = {
  projectId: string;
  taskId?: string | null;
  minutes: number;
  workDate?: string | null;
  note?: string | null;
};

export async function logTime(
  input: LogTimeInput,
): Promise<{ error?: string }> {
  let userId: string;
  try {
    ({ userId } = await assertProjectAccess(input.projectId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied." };
  }

  const minutes = Math.round(Number(input.minutes));
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { error: "Enter a positive amount of time." };
  }
  if (minutes > 24 * 60) {
    return { error: "That is more than 24 hours for one entry." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("time_logs").insert({
    project_id: input.projectId,
    task_id: input.taskId || null,
    profile_id: userId,
    minutes,
    work_date: input.workDate || new Date().toISOString().slice(0, 10),
    note: input.note?.trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/projects/${input.projectId}`);
  return {};
}

export async function deleteTimeLog(
  logId: string,
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data: log } = await admin
    .from("time_logs")
    .select("project_id, profile_id")
    .eq("id", logId)
    .maybeSingle();
  if (!log) return { error: "Entry not found." };

  let ctx;
  try {
    ctx = await assertProjectAccess(log.project_id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied." };
  }
  if (!ctx.isAdmin && ctx.userId !== log.profile_id) {
    return { error: "You can only delete your own entries." };
  }

  const { error } = await admin.from("time_logs").delete().eq("id", logId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${log.project_id}`);
  return {};
}
