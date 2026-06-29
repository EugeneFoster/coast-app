"use client";

import { useState } from "react";
import { setProjectShare } from "@/lib/actions/projects";

export function ShareControl({
  projectId,
  initialToken,
}: {
  projectId: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [origin] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = token ? `${origin}/share/${token}` : null;

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    const result = await setProjectShare(projectId, enabled);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setToken(result.token);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <section className="border-t border-rule pt-6">
      <h2 className="font-display text-lg font-medium text-ink">
        Client share
      </h2>
      <p className="mt-1 text-sm text-graph">
        A read-only link clients can open without an account.
      </p>

      {error && (
        <p className="mt-3 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
          {error}
        </p>
      )}

      {token ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              suppressHydrationWarning
              value={link ?? ""}
              className="min-w-0 flex-1 rounded border border-rule bg-bone px-3 py-2 font-mono text-xs text-ink"
            />
            <button
              type="button"
              onClick={copy}
              className="rounded border border-rule px-3 py-2 text-sm text-ink hover:border-weld"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => toggle(false)}
            disabled={busy}
            className="text-sm text-graph hover:text-weld disabled:opacity-60"
          >
            Disable link
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => toggle(true)}
          disabled={busy}
          className="mt-4 rounded border border-rule px-4 py-2 text-sm text-ink hover:border-weld disabled:opacity-60"
        >
          {busy ? "Enabling…" : "Enable client link"}
        </button>
      )}
    </section>
  );
}
