"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createEmployee,
  resetEmployeePassword,
  setEmployeeRole,
  setEmployeeStatus,
} from "@/lib/actions/employees";
import type { Profile, UserRole } from "@/lib/types";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "welder", label: "Welder" },
  { value: "draftsperson", label: "Drafter" },
  { value: "owner", label: "Owner" },
];

export function EmployeesManager({
  employees,
  currentUserId,
}: {
  employees: Profile[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("welder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await createEmployee({ fullName, login, password, role });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice(`Account created for ${login}.`);
    setFullName("");
    setLogin("");
    setPassword("");
    setRole("welder");
    router.refresh();
  }

  async function changeRole(id: string, value: UserRole) {
    const result = await setEmployeeRole(id, value);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  async function toggleStatus(id: string, status: Profile["status"]) {
    const next = status === "active" ? "disabled" : "active";
    const result = await setEmployeeStatus(id, next);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  async function resetPassword(id: string, label: string) {
    const pwd =
      typeof window !== "undefined"
        ? window.prompt(`New password for ${label} (min 8 chars):`)
        : null;
    if (!pwd) return;
    const result = await resetEmployeePassword(id, pwd);
    if (result.error) setError(result.error);
    else setNotice(`Password updated for ${label}.`);
  }

  return (
    <div className="mt-8 space-y-8">
      <section className="rounded border border-rule bg-paper p-6">
        <h2 className="font-display text-lg font-medium text-ink">
          Add employee
        </h2>
        <p className="mt-1 text-sm text-graph">
          Creates a sign-in account and an active profile.
        </p>

        {error && (
          <p className="mt-3 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 rounded border border-rule bg-bone px-3 py-2 text-sm text-ink">
            {notice}
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          />
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Email (login)"
            type="email"
            className="rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Temporary password (min 8)"
            type="text"
            className="rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="mt-4 rounded bg-weld px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
      </section>

      <section className="overflow-hidden rounded border border-rule">
        <table className="w-full text-sm">
          <thead className="border-b border-rule bg-ink/[0.03] text-left font-mono text-xs uppercase tracking-wide text-graph dark:bg-paper/[0.04]">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Login</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const self = e.id === currentUserId;
              return (
                <tr
                  key={e.id}
                  className="border-b border-rule/60 last:border-0"
                >
                  <td className="px-4 py-3 text-ink">
                    {e.full_name ?? "—"}
                    {self && (
                      <span className="ml-2 text-xs text-graph">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-graph">
                    {e.login}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={e.role}
                      disabled={self}
                      onChange={(ev) =>
                        changeRole(e.id, ev.target.value as UserRole)
                      }
                      className="rounded border border-rule bg-bone px-2 py-1 text-xs text-ink focus:border-weld focus:outline-none disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide ${
                        e.status === "active"
                          ? "border-ink text-ink"
                          : "border-graph text-graph opacity-70"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          resetPassword(e.id, e.full_name ?? e.login)
                        }
                        className="text-xs text-graph hover:text-ink"
                      >
                        Reset password
                      </button>
                      {!self && (
                        <button
                          type="button"
                          onClick={() => toggleStatus(e.id, e.status)}
                          className="text-xs text-graph hover:text-weld"
                        >
                          {e.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
