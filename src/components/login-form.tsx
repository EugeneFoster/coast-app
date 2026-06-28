"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bootstrapConfiguredAccount } from "@/lib/actions/auth";
import { LOGIN_ERRORS, toLoginError } from "@/lib/auth-messages";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") ?? "").trim();

    if (!email || !password) {
      setError(LOGIN_ERRORS.missingFields);
      setPending(false);
      return;
    }

    try {
      const bootstrap = await bootstrapConfiguredAccount(email);
      if (bootstrap.error) {
        setError(bootstrap.error);
        setPending(false);
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(toLoginError(signInError, LOGIN_ERRORS.invalidCredentials));
        setPending(false);
        return;
      }

      router.push("/projects");
      router.refresh();
    } catch (caught) {
      console.error("Client sign-in failed", caught);
      setError(LOGIN_ERRORS.unavailable);
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      method="post"
      autoComplete="on"
      className="rounded border border-rule bg-paper p-6 space-y-4"
    >
      {error && (
        <p className="rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="email" className="block text-sm text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          disabled={pending}
          className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-60"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          disabled={pending}
          className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-60"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-weld px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
