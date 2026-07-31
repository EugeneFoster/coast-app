import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ drawingId: string }> },
) {
  const { drawingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const { data: drawing } = await admin
    .from("drawings")
    .select("project_id, file_path, original_name")
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

  const { data, error } = await admin.storage
    .from("project-drawings")
    .download(drawing.file_path);
  if (error || !data) {
    return new NextResponse("Drawing file unavailable", { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const filename = (drawing.original_name ?? "drawing.pdf").replace(/"/g, "");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
