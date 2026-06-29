import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function SettingsPage() {
  const { profile } = await requireUser();

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-display text-3xl font-medium text-ink">Settings</h1>

      <div className="mt-8 space-y-4">
        <div className="rounded border border-rule bg-paper p-6">
          <h2 className="text-sm font-medium text-ink">Account</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-graph">Login</dt>
              <dd className="font-mono text-ink">{profile.login}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-graph">Role</dt>
              <dd className="text-ink">{profile.role}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-graph">Status</dt>
              <dd className="text-ink">{profile.status}</dd>
            </div>
          </dl>
        </div>

        {(profile.role === "owner" || profile.role === "draftsperson") && (
          <Link
            href="/settings/employees"
            className="block rounded border border-rule bg-paper p-6 transition-colors hover:border-ink/30"
          >
            <h2 className="text-sm font-medium text-ink">Employees</h2>
            <p className="mt-1 text-sm text-graph">
              Create accounts and manage roles for drafters and welders →
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
