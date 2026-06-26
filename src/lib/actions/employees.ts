"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export async function inviteEmployee(formData: FormData) {
  await requireAdmin();

  const email = (formData.get("email") as string).trim().toLowerCase();
  const fullName = (formData.get("full_name") as string)?.trim() || null;
  const role = formData.get("role") as UserRole;

  if (!email) throw new Error("Email is required");

  const admin = createAdminClient();

  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });

  if (authError) throw new Error(authError.message);

  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    login: email,
    full_name: fullName,
    role,
    status: "invited",
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    throw new Error(profileError.message);
  }

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });

  if (linkError) throw new Error(linkError.message);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const inviteUrl = `${siteUrl}/invite/${linkData.properties.hashed_token}`;

  revalidatePath("/settings/employees");
  return { inviteUrl };
}

export async function updateEmployeeRole(profileId: string, role: UserRole) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", profileId);

  if (error) throw new Error(error.message);
  revalidatePath("/settings/employees");
}

export async function removeEmployee(profileId: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/employees");
}

export async function updateEmployeeRoleFromForm(formData: FormData) {
  const profileId = formData.get("profile_id") as string;
  const role = formData.get("role") as UserRole;
  await updateEmployeeRole(profileId, role);
}

export async function removeEmployeeById(profileId: string) {
  await removeEmployee(profileId);
}

export async function completeInvite(
  fullName: string,
  avatarUrl: string | null,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Session not established");

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      avatar_url: avatarUrl,
      status: "active",
    })
    .eq("id", user.id);

  if (profileError) throw new Error(profileError.message);

  return { success: true };
}
