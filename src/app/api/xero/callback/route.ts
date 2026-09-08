import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireInventoryManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exchangeXeroCode, listXeroConnections, saveXeroConnection } from "@/lib/xero/client";
import { pullInventoryFromXero } from "@/lib/xero/inventory-sync";

function sameState(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function inventoryRedirect(request: NextRequest, values: Record<string, string>) {
  const url = new URL("/inventory", request.nextUrl.origin);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { user } = await requireInventoryManager();
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("xero_oauth_state")?.value ?? "";
  cookieStore.delete("xero_oauth_state");

  const denied = request.nextUrl.searchParams.get("error");
  if (denied) return inventoryRedirect(request, { xero: "cancelled" });
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";
  if (!code || !expectedState || !sameState(state, expectedState)) {
    return inventoryRedirect(request, { xero: "invalid_state" });
  }

  try {
    const tokens = await exchangeXeroCode(code);
    const connections = await listXeroConnections(tokens.access_token);
    const connection = connections[0];
    if (!connection) return inventoryRedirect(request, { xero: "no_organisation" });
    await saveXeroConnection(tokens, connection, user.id);
    const supabase = await createClient();
    const sync = await pullInventoryFromXero(supabase, user.id);
    return inventoryRedirect(request, {
      xero: "connected",
      imported: String(sync.imported),
      updated: String(sync.updated),
    });
  } catch (caught) {
    console.error("Xero OAuth callback failed", caught instanceof Error ? caught.message : "unknown error");
    return inventoryRedirect(request, { xero: "failed" });
  }
}

