"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

export async function signIn(formData: FormData) {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const safeEmail = email ?? "";
  const password = ((formData.get("password") as string | null) ?? "").trim();

  const redirectWithError = (message: string): never => {
    redirect(`/login?error=${encodeURIComponent(message)}`);
  };

  if (!safeEmail || !password) {
    redirectWithError("Enter email and password.");
  }

  const seedAccount = resolveSeedAccountByEmail(safeEmail);

  if (seedAccount && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await ensureSeedAccountReady(seedAccount);
    } catch (error) {
      console.error("Failed to bootstrap configured account", error);
      const message =
        error instanceof Error ? error.message : "Account setup failed.";
      redirectWithError(`Account setup failed: ${message}`);
    }
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: safeEmail,
      password,
    });
    if (error) {
      if (seedAccount) {
        redirectWithError(
          "Invalid password for configured account. Use the password from GitHub secrets.",
        );
      }
      redirectWithError("Invalid email or password.");
    }
  } catch (error) {
    console.error("Sign-in request failed", error);
    redirectWithError(
      "Sign in failed. Check Supabase URL/ANON key and try again.",
    );
  }

  redirect("/projects");
}
