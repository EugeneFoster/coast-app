"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole, UserStatus } from "@/lib/types";

const MANAGEABLE_ROLES: UserRole[] = ["welder", "draftsperson", "owner"];

export type CreateEmployeeInput = {
  fullName: string;
  login: string;
  password: string;
  role: UserRole;
};

function normalizeLogin(login: string) {
  return login.trim().toLowerCase();
}

export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const fullName = (input.fullName ?? "").trim();
  const login = normalizeLogin(input.login ?? "");
  const password = (input.password ?? "").trim();
  const role = input.role;

  if (!login || !login.includes("@")) {
    return { error: "A valid email login is required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (!MANAGEABLE_ROLES.includes(role)) {
    return { error: "Invalid role." };
  }

  const admin = createAdminClient();

  let userId: string | null = null;
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: login,
      password,
      email_confirm: true,
    });

  if (!createError && created.user) {
    userId = created.user.id;
  } else {
    // Account may already exist — find and reuse it.
    const { data: usersData } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    userId =
      usersData?.users.find(
        (u) => u.email?.trim().toLowerCase() === login,
      )?.id ?? null;
    if (userId) {
      await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
    }
  }

  if (!userId) {
    return { error: createError?.message ?? "Could not create the account." };
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      login,
      full_name: fullName || null,
      role,
      status: "active",
    },
    { onConflict: "id" },
  );
  if (profileError) return { error: profileError.message };

  revalidatePath("/settings/employees");
  return {};
}

export async function setEmployeeStatus(
  profileId: string,
  status: UserStatus,
): Promise<{ error?: string }> {
  const { user } = await requireAdmin();
  if (profileId === user.id) {
    return { error: "You cannot change your own status." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ status })
    .eq("id", profileId);
  if (error) return { error: error.message };

  revalidatePath("/settings/employees");
  return {};
}

export async function setEmployeeRole(
  profileId: string,
  role: UserRole,
): Promise<{ error?: string }> {
  const { user } = await requireAdmin();
  if (profileId === user.id) {
    return { error: "You cannot change your own role." };
  }
  if (!MANAGEABLE_ROLES.includes(role)) {
    return { error: "Invalid role." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", profileId);
  if (error) return { error: error.message };

  revalidatePath("/settings/employees");
  return {};
}

export async function resetEmployeePassword(
  profileId: string,
  password: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  const pwd = (password ?? "").trim();
  if (pwd.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(profileId, {
    password: pwd,
  });
  if (error) return { error: error.message };

  return {};
}
