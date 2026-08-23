import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { EmployeeSpecialty, UserRole } from "@/lib/types";

export type OperationsEmployee = {
  id: string;
  full_name: string | null;
  login: string;
  role: UserRole;
  specialties: EmployeeSpecialty[];
};

export type OperationsProject = {
  id: string;
  name: string;
  client_name: string | null;
};

export async function getOperationsDirectory(): Promise<OperationsEmployee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("operations_employee_directory");
  if (error) {
    console.error("[operations-directory]", error.message);
    return [];
  }
  return (data ?? []).map((employee: OperationsEmployee) => ({
    id: employee.id,
    full_name: employee.full_name,
    login: employee.login,
    role: employee.role,
    specialties: employee.specialties ?? [],
  }));
}

export async function getOperationsProjects(): Promise<OperationsProject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("operations_project_directory");
  if (error) {
    console.error("[operations-project-directory]", error.message);
    return [];
  }
  return (data ?? []).map((project: OperationsProject) => ({
    id: project.id,
    name: project.name,
    client_name: project.client_name,
  }));
}
