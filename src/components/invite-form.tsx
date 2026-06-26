"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { completeInvite } from "@/lib/actions/employees";

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const fullName = formData.get("full_name") as string;
    const avatarFile = formData.get("avatar") as File;

    try {
      const supabase = createClient();

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: "invite",
      });
      if (verifyError) throw new Error(verifyError.message);

      const { error: passwordError } = await supabase.auth.updateUser({
        password,
      });
      if (passwordError) throw new Error(passwordError.message);

      let avatarUrl: string | null = null;
      if (avatarFile && avatarFile.size > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Session not established");

        const ext = avatarFile.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true });

        if (uploadError) throw new Error(uploadError.message);

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = publicUrl;
      }

      await completeInvite(fullName, avatarUrl);

      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete invite");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="full_name" className="block text-sm text-ink">
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
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
          minLength={8}
          className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="avatar" className="block text-sm text-ink">
          Avatar
        </label>
        <input
          id="avatar"
          name="avatar"
          type="file"
          accept="image/*"
          className="mt-1 w-full text-sm text-graph"
        />
      </div>
      {error && <p className="text-sm text-weld">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-weld px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Setting up…" : "Activate account"}
      </button>
    </form>
  );
}
