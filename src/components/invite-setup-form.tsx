"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  activateInviteAction,
  INITIAL_EMPLOYEE_ACTION_STATE,
} from "@/lib/actions/employees";
import { createClient } from "@/lib/supabase/client";

export function InviteSetupForm() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [identity, setIdentity] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(
    activateInviteAction,
    INITIAL_EMPLOYEE_ACTION_STATE,
  );

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (cancelled) return;
      if (error || !data.user) {
        setSessionError("This invitation link is invalid or has expired.");
        setChecking(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, login, status")
        .eq("id", data.user.id)
        .single();
      if (cancelled) return;
      if (!profile) {
        setSessionError("Employee profile was not found.");
        setChecking(false);
        return;
      }
      if (profile.status === "active") {
        router.replace("/projects");
        return;
      }
      if (profile.status === "disabled") {
        setSessionError("This invitation has been disabled.");
        setChecking(false);
        return;
      }

      setIdentity(profile.full_name ?? profile.login);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) {
    return <p className="text-sm text-graph">Checking invitation…</p>;
  }

  if (sessionError) {
    return <p className="text-sm text-weld">{sessionError}</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-graph">
        Welcome, {identity}. Create your password to finish joining the team.
      </p>
      <div>
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Create password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-ink focus:border-weld focus:outline-none"
        />
        <p className="mt-1 text-xs text-graph">At least 12 characters.</p>
      </div>
      <div>
        <label
          htmlFor="password_confirmation"
          className="text-sm font-medium text-ink"
        >
          Confirm password
        </label>
        <input
          id="password_confirmation"
          name="password_confirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-ink focus:border-weld focus:outline-none"
        />
      </div>

      {state.message && (
        <p
          className={`text-sm ${state.status === "error" ? "text-weld" : "text-ink"}`}
          aria-live="polite"
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full px-4 py-2 text-sm disabled:opacity-60"
      >
        {pending ? "Activating…" : "Activate account"}
      </button>
    </form>
  );
}
