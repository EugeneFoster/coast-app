import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(): Promise<Profile | null> {
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
