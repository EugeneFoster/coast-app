import { signIn } from "@/lib/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bone px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-semibold tracking-wide uppercase text-ink">
            COAST
          </p>
          <p className="text-sm text-graph">metal works</p>
        </div>

        <form
          action={signIn}
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
              autoComplete="email"
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
            className="w-full rounded bg-weld px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
