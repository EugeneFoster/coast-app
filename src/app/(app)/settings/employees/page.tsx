import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InviteForm, EmployeeActions } from "@/components/employee-forms";
import type { Profile } from "@/lib/types";

export default async function EmployeesPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl font-medium text-ink">Employees</h1>
      <p className="mt-2 text-sm text-graph">
        Manage team members and send invite links.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <InviteForm />

        <div className="rounded border border-rule bg-paper p-6">
          <h2 className="font-display text-lg font-medium text-ink">Team</h2>
          <ul className="mt-4 divide-y divide-rule">
            {employees?.map((emp: Profile) => (
              <li
                key={emp.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {emp.full_name ?? emp.login}
                  </p>
                  <p className="truncate text-xs text-graph">
                    {emp.login} · {emp.status}
                  </p>
                </div>
                <EmployeeActions
                  profileId={emp.id}
                  currentRole={emp.role}
                />
              </li>
            ))}
            {(!employees || employees.length === 0) && (
              <li className="py-6 text-center text-sm text-graph">
                No employees yet
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
