import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

function shouldLogAuthError(error: unknown) {
  const digest =
    typeof error === "object" && error && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return digest !== "DYNAMIC_SERVER_USAGE" && !message.includes("Dynamic server usage");
}

export async function getSession() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    if (shouldLogAuthError(error)) {
      console.error("Failed to read auth session", error);
    }
    return null;
  }
}

export async function getProfile(): Promise<Profile | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    return data;
  } catch (error) {
    if (shouldLogAuthError(error)) {
      console.error("Failed to read profile", error);
    }
    return null;
  }
}

export async function requireUser() {
  const user = await getSession();
  if (!user) {
    redirect("/login");
  }

  const profile = await getProfile();
  if (!profile || profile.status !== "active") {
    redirect("/login");
  }

  return { user, profile };
}

export async function requireAdmin() {
  const { user, profile } = await requireUser();

  if (profile.role !== "owner" && profile.role !== "draftsperson") {
    redirect("/projects");
  }

  return { user, profile };
}

export function isAdmin(profile: Profile) {
  return profile.role === "owner" || profile.role === "draftsperson";
}
