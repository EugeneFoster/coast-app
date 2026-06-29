"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueTiling } from "@/lib/queue";

const PDF_RE = /\.pdf$/i;

export type DrawingRevisionInput = {
  projectId: string;
  drawingId: string;
  filePath: string;
  originalName: string;
};

/**
 * Replace a drawing's source PDF with a newer revision: bump the version,
 * reset status to processing and enqueue a fresh tiling job. The tile route is
 * version-pinned, so the new pyramid lands under v{version} without clobbering
 * the previous one.
 */
export async function createDrawingRevision(
  input: DrawingRevisionInput,
): Promise<{ version: number } | { error: string }> {
  await requireAdmin();

  if (!PDF_RE.test(input.filePath)) {
    return { error: "Revisions must be PDF files." };
  }

  const admin = createAdminClient();
  const { data: drawing, error: readError } = await admin
    .from("drawings")
    .select("id, project_id, version")
    .eq("id", input.drawingId)
    .maybeSingle();

  if (readError) return { error: readError.message };
  if (!drawing || drawing.project_id !== input.projectId) {
    return { error: "Drawing not found." };
  }

  const nextVersion = (drawing.version ?? 1) + 1;

  const { error: updateError } = await admin
    .from("drawings")
    .update({
      file_path: input.filePath,
      original_name: input.originalName,
      version: nextVersion,
      status: "processing",
      error: null,
    })
    .eq("id", input.drawingId);

  if (updateError) return { error: updateError.message };

  await enqueueTiling({
    drawingId: input.drawingId,
    version: nextVersion,
    pdfStorageKey: input.filePath,
  });

  revalidatePath(`/projects/${input.projectId}`);
  return { version: nextVersion };
}
