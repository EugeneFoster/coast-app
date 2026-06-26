"use client";

import { useState } from "react";
import { inviteEmployee, updateEmployeeRoleFromForm, removeEmployeeById } from "@/lib/actions/employees";
import type { UserRole } from "@/lib/types";

export function InviteForm() {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setInviteUrl(null);
    try {
      const result = await inviteEmployee(formData);
      setInviteUrl(result.inviteUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invite");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded border border-rule bg-paper p-6">
      <h2 className="font-display text-lg font-medium text-ink">Invite employee</h2>
      <p className="mt-1 text-sm text-graph">
        Create a company account and copy the invite link to send.
      </p>

      <form action={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-ink">
            Login email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="full_name" className="block text-sm text-ink">
            Full name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="role" className="block text-sm text-ink">
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue="welder"
            className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          >
            <option value="welder">Welder</option>
            <option value="draftsperson">Draftsperson</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-weld px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create invite"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-weld">{error}</p>}

      {inviteUrl && (
        <div className="mt-4 rounded border border-rule bg-bone p-4">
          <p className="text-sm text-graph">Invite link (single-use, expires in 72h)</p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="flex-1 rounded border border-rule bg-paper px-3 py-2 font-mono text-xs text-ink"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(inviteUrl)}
              className="shrink-0 rounded border border-rule px-3 py-2 text-sm text-ink hover:bg-paper"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EmployeeActions({
  profileId,
  currentRole,
}: {
  profileId: string;
  currentRole: UserRole;
}) {
  return (
    <div className="flex items-center gap-2">
      <form action={updateEmployeeRoleFromForm}>
        <input type="hidden" name="profile_id" value={profileId} />
        <select
          name="role"
          defaultValue={currentRole}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="rounded border border-rule bg-paper px-2 py-1 text-xs text-ink"
        >
          <option value="welder">Welder</option>
          <option value="draftsperson">Draftsperson</option>
          <option value="owner">Owner</option>
        </select>
      </form>
      <form action={removeEmployeeById.bind(null, profileId)}>
        <button
          type="submit"
          className="rounded border border-rule px-2 py-1 text-xs text-graph hover:border-weld hover:text-weld"
        >
          Remove
        </button>
      </form>
    </div>
  );
}
