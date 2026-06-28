import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Object } from "@/lib/r2";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  dzi: "application/xml",
  xml: "application/xml",
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function contentTypeFor(path: string, fallback: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? fallback;
}

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      drawingId: string;
      version: string;
      page: string;
      path: string[];
    }>;
  },
) {
  const { drawingId, version, page, path } = await params;

  // 1. Authenticated session required.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 2. Authorize: admin or member of the drawing's project.
  const admin = createAdminClient();
  const { data: drawing } = await admin
    .from("drawings")
    .select("project_id")
    .eq("id", drawingId)
    .maybeSingle();
  if (!drawing) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin =
    profile?.role === "owner" || profile?.role === "draftsperson";

  if (!isAdmin) {
    const { data: member } = await admin
      .from("project_members")
      .select("project_id")
      .eq("project_id", drawing.project_id)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!member) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  // 3. Fetch the object from R2 (version-pinned, immutable).
  const rel = path.join("/");
  const key = `drawings/${drawingId}/v${version}/p${page}/${rel}`;
  const object = await getR2Object(key);
  if (!object) {
    return new NextResponse("Tile unavailable", { status: 404 });
  }

  return new NextResponse(Buffer.from(object.body), {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(rel, object.contentType),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
