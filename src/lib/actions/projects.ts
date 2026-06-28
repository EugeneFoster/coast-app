"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ProjectStatus } from "@/lib/types";

export type NewProjectInput = {
  projectId: string;
  name: string;
  description?: string | null;
  coverPath?: string | null;
  modelPath?: string | null;
  drawings?: { path: string; originalName: string }[];
  welderIds?: string[];
};

const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif)$/i;
const MODEL_RE = /\.(glb|gltf)$/i;
const PDF_RE = /\.pdf$/i;
const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function createProjectAction(
  input: NewProjectInput,
): Promise<{ error: string } | void> {
  await requireAdmin();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };

  const projectId = (input.projectId ?? "").trim();
  if (!UUID_RE.test(projectId)) return { error: "Invalid project reference." };

  const name = (input.name ?? "").trim();
  if (!name) return { error: "Project name is required." };

  if (input.coverPath && !IMAGE_RE.test(input.coverPath)) {
    return { error: "Cover must be an image file." };
  }
  if (input.modelPath && !MODEL_RE.test(input.modelPath)) {
    return { error: "3D model must be a .glb or .gltf file." };
  }
  const drawings = input.drawings ?? [];
  if (drawings.some((d) => !PDF_RE.test(d.path))) {
    return { error: "Drawings must be PDF files." };
  }

  const projectRow: Record<string, unknown> = {
    id: projectId,
    name,
    description: input.description?.trim() || null,
    status: "planned",
    cover_url: input.coverPath ?? null,
    drawing_count: drawings.length,
    created_by: user.id,
  };
  // Only set model_url when a model is provided so the insert works even
  // before the model_url migration is applied.
  if (input.modelPath) {
    projectRow.model_url = input.modelPath;
  }

  const { error: projectError } = await supabase
    .from("projects")
    .insert(projectRow);
  if (projectError) return { error: projectError.message };

  if (drawings.length > 0) {
    const { error: drawingError } = await supabase.from("drawings").insert(
      drawings.map((d) => ({
        project_id: projectId,
        file_path: d.path,
        original_name: d.originalName,
        uploaded_by: user.id,
      })),
    );
    if (drawingError) return { error: drawingError.message };
  }

  const welderIds = (input.welderIds ?? []).filter(Boolean);
  if (welderIds.length > 0) {
    const { error: memberError } = await supabase
      .from("project_members")
      .insert(
        welderIds.map((profileId) => ({
          project_id: projectId,
          profile_id: profileId,
        })),
      );
    if (memberError) return { error: memberError.message };
  }

  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function updateProjectName(projectId: string, name: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .update({ name: name.trim() })
    .eq("id", projectId);

  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

export async function updateProjectStatus(
  projectId: string,
  status: ProjectStatus,
) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .update({ status })
    .eq("id", projectId);

  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

export async function archiveProject(projectId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .update({ status: "archived" })
    .eq("id", projectId);

  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  redirect("/projects");
}

export async function deleteProject(projectId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("projects").delete().eq("id", projectId);

  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  redirect("/projects");
}

export async function assignWelder(projectId: string, profileId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("project_members")
    .upsert({ project_id: projectId, profile_id: profileId });

  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function assignWelderFromForm(formData: FormData) {
  const projectId = formData.get("project_id") as string;
  const welderId = formData.get("welder_id") as string;
  if (projectId && welderId) {
    await assignWelder(projectId, welderId);
  }
}

export async function removeWelder(projectId: string, profileId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("profile_id", profileId);

  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}
