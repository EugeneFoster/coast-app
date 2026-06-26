"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ProjectStatus } from "@/lib/types";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createProject(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const name = formData.get("name") as string;
  const clientName = formData.get("client_name") as string;
  const description = (formData.get("description") as string) || null;

  let clientId: string | null = null;
  if (clientName?.trim()) {
    const { data: client } = await supabase
      .from("clients")
      .insert({ name: clientName.trim() })
      .select("id")
      .single();
    clientId = client?.id ?? null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name: name.trim(),
      client_id: clientId,
      description,
      created_by: user?.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
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
