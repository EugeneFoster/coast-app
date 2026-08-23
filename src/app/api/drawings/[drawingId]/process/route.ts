import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueTiling } from "@/lib/queue";
import { processDrawingInline } from "@/lib/tiling/process-drawing";
import { canInlineTiling } from "@/lib/tiling/tile-storage";
import { canManageProjects, isUserRole } from "@/lib/employee-roles";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ drawingId: string }> },
) {
  const { drawingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "active" || !isUserRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isAdmin = canManageProjects(profile.role);
  const { data: drawing } = await admin
    .from("drawings")
    .select("id, project_id, file_path, version, status")
    .eq("id", drawingId)
    .maybeSingle();
  if (!drawing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isAdmin) {
    const { data: member } = await admin
      .from("project_members")
      .select("project_id")
      .eq("project_id", drawing.project_id)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (drawing.status === "ready") {
    return NextResponse.json({ ok: true, status: "ready" });
  }

  const version = drawing.version ?? 1;

  await admin
    .from("drawings")
    .update({ status: "processing", error: null })
    .eq("id", drawingId);

  const queued = await enqueueTiling({
    drawingId,
    version,
    pdfStorageKey: drawing.file_path,
  });
  if (queued) {
    return NextResponse.json({ ok: true, mode: "queued" });
  }

  if (!canInlineTiling()) {
    return NextResponse.json(
      { error: "Tiling unavailable — missing server configuration." },
      { status: 503 },
    );
  }

  try {
    const result = await processDrawingInline({
      drawingId,
      version,
      pdfStorageKey: drawing.file_path,
    });
    return NextResponse.json({ ok: true, mode: "inline", pages: result.pages });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Tiling failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
