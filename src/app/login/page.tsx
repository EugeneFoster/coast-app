import { signIn } from "@/lib/actions/auth";
import { sanitizeLoginErrorParam } from "@/lib/auth-messages";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: rawError } = await searchParams;
  const error = sanitizeLoginErrorParam(rawError);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex flex-col items-center rounded-[4px] bg-sidebar px-4 py-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/quantum-marine-white.png" alt="Quantum Marine" className="h-[91px] w-[156px] object-contain" />
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-graph">COAST workspace</p>
        </div>

        <form
          action={signIn}
          className="space-y-4 rounded border border-rule bg-paper p-6"
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
              className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
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
              className="mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="btn-primary w-full px-4 py-2 text-sm transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
