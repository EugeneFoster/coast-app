"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TaskStatus } from "@/lib/types";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];

export type CreateTaskInput = {
  projectId: string;
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  drawingPinId?: string | null;
};

async function taskProjectId(taskId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tasks")
    .select("project_id")
    .eq("id", taskId)
    .maybeSingle();
  return data?.project_id ?? null;
}

export async function createTask(
  input: CreateTaskInput,
): Promise<{ id: string } | { error: string }> {
  const { user } = await requireAdmin();

  const title = (input.title ?? "").trim();
  if (!title) return { error: "Task title is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tasks")
    .insert({
      project_id: input.projectId,
      title,
      description: input.description?.trim() || null,
      assignee_id: input.assigneeId || null,
      due_date: input.dueDate || null,
      drawing_pin_id: input.drawingPinId || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/projects/${input.projectId}`);
  return { id: data.id };
}

export async function setTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<{ error?: string }> {
  if (!STATUSES.includes(status)) return { error: "Invalid status." };

  const projectId = await taskProjectId(taskId);
  if (!projectId) return { error: "Task not found." };

  try {
    await assertProjectAccess(projectId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tasks")
    .update({ status })
    .eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function updateTask(
  taskId: string,
  patch: {
    title?: string;
    description?: string | null;
    assigneeId?: string | null;
    dueDate?: string | null;
  },
): Promise<{ error?: string }> {
  await requireAdmin();

  const projectId = await taskProjectId(taskId);
  if (!projectId) return { error: "Task not found." };

  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { error: "Task title is required." };
    row.title = t;
  }
  if (patch.description !== undefined)
    row.description = patch.description?.trim() || null;
  if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId || null;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate || null;

  const admin = createAdminClient();
  const { error } = await admin.from("tasks").update(row).eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function deleteTask(taskId: string): Promise<{ error?: string }> {
  await requireAdmin();

  const projectId = await taskProjectId(taskId);
  if (!projectId) return { error: "Task not found." };

  const admin = createAdminClient();
  const { error } = await admin.from("tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return {};
}
