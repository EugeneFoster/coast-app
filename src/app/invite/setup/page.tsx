import { InviteSetupForm } from "@/components/invite-setup-form";

export default function InviteSetupPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-bone px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-medium uppercase tracking-wide text-ink">
            COAST
          </p>
          <p className="mt-2 text-sm text-graph">Activate employee account</p>
        </div>

        <div className="rounded border border-rule bg-paper p-6">
          <InviteSetupForm />
        </div>
      </div>
    </div>
  );
}
