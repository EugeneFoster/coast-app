import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmployeesManager } from "@/components/employees-manager";
import type { Profile } from "@/lib/types";

export default async function EmployeesPage() {
  const { user } = await requireAdmin();

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("*")
    .order("role")
    .order("full_name");

  const employees = (data ?? []) as Profile[];

  return (
    <div className="p-8">
      <Link href="/settings" className="text-sm text-graph hover:text-ink">
        ← Back to settings
      </Link>
      <h1 className="mt-4 font-display text-3xl font-medium text-ink">
        Employees
      </h1>
      <p className="mt-2 text-sm text-graph">
        Create and manage accounts for owners, drafters and welders.
      </p>

      <EmployeesManager employees={employees} currentUserId={user.id} />
    </div>
  );
}
