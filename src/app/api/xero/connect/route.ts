import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireInventoryManager } from "@/lib/auth";
import { xeroAuthorizationUrl } from "@/lib/xero/client";

export async function GET() {
  await requireInventoryManager();
  const state = randomBytes(32).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set("xero_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/xero/callback",
    maxAge: 10 * 60,
  });
  return NextResponse.redirect(xeroAuthorizationUrl(state));
}

