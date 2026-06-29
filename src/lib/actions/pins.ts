"use server";

import { revalidatePath } from "next/cache";
import { assertProjectAccess } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PinStatus } from "@/lib/types";

export type CreatePinInput = {
  projectId: string;
  drawingId: string;
  version: number;
  pageNo: number;
  bbox: { x: number; y: number; w: number; h: number };
  body: string;
};

// Reads use the service role (project access is already gated by the caller),
// mirroring the gallery pattern so no per-table read policy is required here.
async function pinProjectId(pinId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("drawing_pins")
    .select("project_id")
    .eq("id", pinId)
    .maybeSingle();
  return data?.project_id ?? null;
}

export async function createPin(
  input: CreatePinInput,
): Promise<{ id: string } | { error: string }> {
  let userId: string;
  try {
    ({ userId } = await assertProjectAccess(input.projectId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied." };
  }

  const body = (input.body ?? "").trim();
  if (!body) return { error: "Please describe your question or note." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("drawing_pins")
    .insert({
      project_id: input.projectId,
      drawing_id: input.drawingId,
      version: input.version,
      page_no: input.pageNo,
      bx: input.bbox.x,
      by: input.bbox.y,
      bw: input.bbox.w,
      bh: input.bbox.h,
      body,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/projects/${input.projectId}`);
  return { id: data.id };
}

export async function addPinComment(
  pinId: string,
  body: string,
): Promise<{ error?: string }> {
  const projectId = await pinProjectId(pinId);
  if (!projectId) return { error: "Pin not found." };

  let userId: string;
  try {
    ({ userId } = await assertProjectAccess(projectId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied." };
  }

  const text = (body ?? "").trim();
  if (!text) return { error: "Comment cannot be empty." };

  const admin = createAdminClient();
  const { error } = await admin.from("pin_comments").insert({
    pin_id: pinId,
    body: text,
    created_by: userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function setPinStatus(
  pinId: string,
  status: PinStatus,
): Promise<{ error?: string }> {
  const projectId = await pinProjectId(pinId);
  if (!projectId) return { error: "Pin not found." };

  let userId: string;
  try {
    ({ userId } = await assertProjectAccess(projectId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("drawing_pins")
    .update({
      status,
      resolved_by: status === "resolved" ? userId : null,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", pinId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function deletePin(pinId: string): Promise<{ error?: string }> {
  const projectId = await pinProjectId(pinId);
  if (!projectId) return { error: "Pin not found." };

  try {
    await assertProjectAccess(projectId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("drawing_pins").delete().eq("id", pinId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return {};
}
