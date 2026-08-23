import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>([
  "email",
  "invite",
  "magiclink",
  "recovery",
  "signup",
  "email_change",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const typeValue = url.searchParams.get("type") ?? "";
  const requestedNext = url.searchParams.get("next") ?? "/projects";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/projects";

  if (tokenHash && allowedTypes.has(typeValue as EmailOtpType)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: typeValue as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(
    new URL("/login?error=Invitation%20link%20is%20invalid%20or%20expired.", url.origin),
  );
}
