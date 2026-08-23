"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isEmployeeSpecialty,
  isUserRole,
  isUserStatus,
} from "@/lib/employee-roles";

export type EmployeeActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_EMPLOYEE_ACTION_STATE: EmployeeActionState = {
  status: "idle",
  message: "",
};

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function specialtiesFrom(formData: FormData) {
  return formData
    .getAll("specialties")
    .map(String)
    .filter(isEmployeeSpecialty);
}

async function requestOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredOrigin) return new URL(configuredOrigin).origin;

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) return `https://${railwayDomain}`;

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    requestHeaders.get("host")?.trim();
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (!host) throw new Error("Could not determine the application URL.");
  const protocol = forwardedProtocol ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function inviteEmployeeAction(
  _previous: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const { profile: actor } = await requireAdmin();
  const email = clean(formData, "email").toLowerCase();
  const fullName = clean(formData, "full_name");
  const roleValue = clean(formData, "role");
  const phone = clean(formData, "phone");
  const jobTitle = clean(formData, "job_title");
  const specialties = specialtiesFrom(formData);

  if (!email || !email.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (!fullName) {
    return { status: "error", message: "Employee name is required." };
  }
  if (!isUserRole(roleValue)) {
    return { status: "error", message: "Select a valid role." };
  }
  if (roleValue === "owner" && actor.role !== "owner") {
    return { status: "error", message: "Only an owner can invite another owner." };
  }

  const admin = createAdminClient();
  // The default Supabase invite template verifies the token first, then sends
  // the browser session to this page. /auth/confirm also remains available for
  // projects using a custom token-hash email template.
  const redirectTo = `${await requestOrigin()}/invite/setup`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      full_name: fullName,
      role: roleValue,
      phone: phone || null,
      job_title: jobTitle || null,
      specialties,
    },
  });

  if (error || !data.user) {
    return {
      status: "error",
      message: error?.message ?? "Supabase did not create the invitation.",
    };
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: data.user.id,
      login: email,
      full_name: fullName,
      role: roleValue,
      status: "invited",
      phone: phone || null,
      job_title: jobTitle || null,
      specialties,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return {
      status: "error",
      message: `Invitation sent, but the employee profile needs attention: ${profileError.message}`,
    };
  }

  revalidatePath("/settings/employees");
  return { status: "success", message: `Invitation sent to ${email}.` };
}

export async function updateEmployeeAction(
  profileId: string,
  _previous: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const { user, profile: actor } = await requireAdmin();
  const fullName = clean(formData, "full_name");
  const roleValue = clean(formData, "role");
  const statusValue = clean(formData, "status");
  const phone = clean(formData, "phone");
  const jobTitle = clean(formData, "job_title");
  const specialties = specialtiesFrom(formData);

  if (!fullName) return { status: "error", message: "Employee name is required." };
  if (!isUserRole(roleValue)) return { status: "error", message: "Invalid role." };
  if (!isUserStatus(statusValue)) return { status: "error", message: "Invalid status." };

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, role, status")
    .eq("id", profileId)
    .single();

  if (targetError || !target) {
    return { status: "error", message: "Employee was not found." };
  }
  if ((target.role === "owner" || roleValue === "owner") && actor.role !== "owner") {
    return { status: "error", message: "Only an owner can change owner accounts." };
  }
  if (profileId === user.id && statusValue !== "active") {
    return { status: "error", message: "You cannot disable your own account." };
  }

  const { error } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      role: roleValue,
      status: statusValue,
      phone: phone || null,
      job_title: jobTitle || null,
      specialties,
    })
    .eq("id", profileId);

  if (error) return { status: "error", message: error.message };

  revalidatePath("/settings/employees");
  revalidatePath("/projects");
  return { status: "success", message: "Employee updated." };
}

export async function activateInviteAction(
  _previous: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const password = clean(formData, "password");
  const confirmation = clean(formData, "password_confirmation");

  if (password.length < 12) {
    return { status: "error", message: "Use at least 12 characters." };
  }
  if (password !== confirmation) {
    return { status: "error", message: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { status: "error", message: "The invitation session has expired." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile) {
    return { status: "error", message: "Employee profile was not found." };
  }
  if (profile.status === "disabled") {
    return { status: "error", message: "This invitation has been disabled." };
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) return { status: "error", message: passwordError.message };

  const { error: activationError } = await supabase
    .from("profiles")
    .update({ status: "active" })
    .eq("id", userData.user.id);
  if (activationError) return { status: "error", message: activationError.message };

  redirect("/projects");
}
