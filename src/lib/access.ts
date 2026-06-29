import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export type AccessContext = {
  userId: string;
  role: UserRole;
  isAdmin: boolean;
};

/**
 * Authorize the current user for a project: owners/draftspeople always pass,
 * welders only when assigned as a project member. Throws on denial.
 */
export async function assertProjectAccess(
  projectId: string,
): Promise<AccessContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "welder") as UserRole;
  const isAdmin = role === "owner" || role === "draftsperson";
  if (isAdmin) return { userId: user.id, role, isAdmin };

  const { data: member } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("project_id", projectId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!member) throw new Error("You do not have access to this project.");
  return { userId: user.id, role, isAdmin };
}
