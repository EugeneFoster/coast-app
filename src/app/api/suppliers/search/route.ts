import { NextResponse } from "next/server";
import { canProposeSupplierChange, isUserRole } from "@/lib/employee-roles";
import { isValidSearchQuery } from "@/lib/suppliers/normalize";
import { DEFAULT_SUPPLIER_IDS } from "@/lib/suppliers/registry";
import { searchSuppliers } from "@/lib/suppliers/search";
import { isSupplierId, type SupplierId } from "@/lib/suppliers/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Same-origin guard, matching the Onshape import route. Keeps the authenticated
 * supplier lookup from being driven by another site.
 */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const expectedHost = forwardedHost || request.headers.get("host") || requestUrl.host;
    const expectedProtocol = forwardedProto ? `${forwardedProto}:` : requestUrl.protocol;
    const originUrl = new URL(origin);
    return originUrl.host === expectedHost && originUrl.protocol === expectedProtocol;
  } catch {
    return false;
  }
}

/**
 * Read-only supplier lookup.
 *
 * Nothing here writes to the CRM. Supplier credentials and portal URLs stay on
 * the server: the request may only name supplier *ids*, which are intersected
 * with the server-defined list, so a caller can never point the integration at
 * a URL of its own.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Forbidden", 403);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Your session has expired. Please sign in again.", 401);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "active" || !isUserRole(profile.role)) {
    return jsonError("Your employee account is not active.", 403);
  }
  if (!canProposeSupplierChange(profile.role)) {
    return jsonError("Your role cannot search supplier catalogues.", 403);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return jsonError("Request is too large.", 413);
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request.", 400);
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!isValidSearchQuery(query)) {
    return jsonError("Enter a part number between 2 and 64 characters.", 400);
  }

  // Only ids, and only ones the server already knows about.
  let suppliers: readonly SupplierId[] = DEFAULT_SUPPLIER_IDS;
  if (Array.isArray(body.suppliers)) {
    const requested = body.suppliers.filter(isSupplierId);
    if (requested.length === 0) {
      return jsonError("Select at least one known supplier.", 400);
    }
    suppliers = requested;
  }

  const response = await searchSuppliers({ query, suppliers });

  // `outcomes[].message` is the normalized, user-safe text; internal detail
  // stays in the server log.
  return NextResponse.json({
    query: response.query,
    normalizedQuery: response.normalizedQuery,
    results: response.results,
    supplierStatus: response.supplierStatus,
    outcomes: response.outcomes,
  });
}
