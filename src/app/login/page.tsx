import { LoginForm } from "@/components/login-form";
import { sanitizeLoginErrorParam } from "@/lib/auth-messages";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: rawError } = await searchParams;
  const error = sanitizeLoginErrorParam(rawError);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bone px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-semibold tracking-wide uppercase text-ink">
            COAST
          </p>
          <p className="text-sm text-graph">metal works</p>
        </div>

        <LoginForm initialError={error} />
      </div>
    </div>
  );
}
