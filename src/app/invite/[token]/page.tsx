export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="flex min-h-full items-center justify-center bg-bone px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-semibold tracking-wide uppercase text-ink">
            COAST
          </p>
          <p className="mt-2 text-sm text-graph">Set up your account</p>
        </div>

        <div className="rounded border border-rule bg-paper p-6">
          <p className="text-sm text-graph">
            Invite activation is disabled in the free deployment profile.
          </p>
          <p className="mt-2 break-all font-mono text-xs text-graph/80">
            token: {token}
          </p>
        </div>
      </div>
    </div>
  );
}
