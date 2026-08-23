import { EmployeeEditForm } from "@/components/employee-edit-form";
import { EmployeeInviteForm } from "@/components/employee-invite-form";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export default async function EmployeesPage() {
  const { profile } = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("status")
    .order("full_name");
  const employees = (data ?? []) as Profile[];

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl font-medium text-ink">Employees</h1>
      <p className="mt-2 text-sm text-graph">
        Invite the team, control access, and record each employee&apos;s trade
        specialties.
      </p>

      <div className="mt-8">
        <EmployeeInviteForm actorRole={profile.role} />
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-medium text-ink">Team</h2>
          <span className="font-mono text-xs text-graph">
            {employees.length} employee{employees.length === 1 ? "" : "s"}
          </span>
        </div>

        {error && (
          <p className="mt-4 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
            Could not load employees: {error.message}
          </p>
        )}

        <div className="mt-4 space-y-4">
          {employees.map((employee) => (
            <EmployeeEditForm
              key={employee.id}
              employee={employee}
              actorRole={profile.role}
            />
          ))}
          {!error && employees.length === 0 && (
            <p className="rounded border border-dashed border-rule py-12 text-center text-sm text-graph">
              No employees yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
