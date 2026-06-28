"use server";

import { LOGIN_ERRORS, toLoginError } from "@/lib/auth-messages";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";

type SeedAccount = {
  email: string;
  password: string;
  role: UserRole;
  fullName: string;
};

function readSeedAccounts(): SeedAccount[] {
  const adminEmail = process.env.ADMIN_LOGIN?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  const drawEmail = process.env.DRAW_LOGIN?.trim().toLowerCase();
  const drawPassword = process.env.DRAW_PASSWORD?.trim();

  const configuredAccounts: SeedAccount[] = [];

  if (adminEmail && adminPassword) {
    configuredAccounts.push({
      email: adminEmail,
      password: adminPassword,
      role: "owner",
      fullName: "Admin",
    });
  }

  if (drawEmail && drawPassword) {
    configuredAccounts.push({
      email: drawEmail,
      password: drawPassword,
      role: "draftsperson",
      fullName: "Draftsperson",
    });
  }

  return configuredAccounts;
}

function resolveSeedAccountByEmail(email: string): SeedAccount | null {
  return readSeedAccounts().find((account) => account.email === email) ?? null;
}

async function ensureSeedAccountReady(account: SeedAccount) {
  const admin = createAdminClient();

  let userId: string | null = null;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
  });

  if (!createError && created.user) {
    userId = created.user.id;
  }

  if (!userId) {
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (usersError) throw new Error(usersError.message);

    userId =
      usersData.users.find(
        (user) => user.email?.trim().toLowerCase() === account.email,
      )?.id ?? null;
  }

  if (!userId) {
    throw new Error("Configured account was not found in Supabase Auth.");
  }

  const { error: updateUserError } = await admin.auth.admin.updateUserById(userId, {
    password: account.password,
    email_confirm: true,
  });
  if (updateUserError) throw new Error(updateUserError.message);

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      login: account.email,
      full_name: account.fullName,
      role: account.role,
      status: "active",
    },
    { onConflict: "id" },
  );
  if (profileError) throw new Error(profileError.message);
}

async function seedAccountNeedsBootstrap(account: SeedAccount) {
  const admin = createAdminClient();

  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (usersError) throw new Error(usersError.message);

  const userId =
    usersData.users.find(
      (user) => user.email?.trim().toLowerCase() === account.email,
    )?.id ?? null;

  if (!userId) return true;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);

  return !profile || profile.status !== "active";
}

export async function bootstrapConfiguredAccount(email: string) {
  const safeEmail = email.trim().toLowerCase();
  const seedAccount = resolveSeedAccountByEmail(safeEmail);

  if (!seedAccount || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: null as string | null };
  }

  try {
    if (await seedAccountNeedsBootstrap(seedAccount)) {
      await ensureSeedAccountReady(seedAccount);
    }
    return { error: null as string | null };
  } catch (error) {
    console.error("Failed to bootstrap configured account", error);
    return { error: toLoginError(error, LOGIN_ERRORS.unavailable) };
  }
}
