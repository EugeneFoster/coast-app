"use server";

import { revalidatePath } from "next/cache";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MarkupKind, MarkupStatus, MarkupWithThread } from "@/lib/types";

const PHOTO_BUCKET = "markup-photos";

async function assertDrawingMember(drawingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: drawing } = await supabase
    .from("drawings")
    .select("project_id")
    .eq("id", drawingId)
    .single();
  if (!drawing) throw new Error("Drawing not found");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "owner" || profile?.role === "draftsperson") {
    return { userId: user.id, isAdminUser: true, projectId: drawing.project_id };
  }

  const { data: member } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("project_id", drawing.project_id)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!member) throw new Error("Access denied");
  return { userId: user.id, isAdminUser: false, projectId: drawing.project_id };
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function fetchDrawingMarkups(
  drawingId: string,
  version: number,
): Promise<MarkupWithThread[]> {
  await assertDrawingMember(drawingId);
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: markups } = await supabase
    .from("drawing_markups")
    .select("*, profiles:created_by(full_name, login)")
    .eq("drawing_id", drawingId)
    .eq("version", version)
    .order("created_at");

  if (!markups?.length) return [];

  const ids = markups.map((m) => m.id);
  const { data: comments } = await supabase
    .from("markup_comments")
    .select("*, profiles:author(full_name, login)")
    .in("markup_id", ids)
    .order("created_at");

  const { data: photos } = await supabase
    .from("markup_photos")
    .select("*")
    .in("markup_id", ids)
    .order("created_at");

  const photoUrls = new Map<string, string>();
  if (photos?.length) {
    const { data: signed } = await admin.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(
        photos.map((p) => p.file_path),
        3600,
      );
    (signed ?? []).forEach((s, i) => {
      if (s.signedUrl && photos[i]) photoUrls.set(photos[i].id, s.signedUrl);
    });
  }

  const commentsByMarkup = new Map<string, typeof comments>();
  (comments ?? []).forEach((c) => {
    const list = commentsByMarkup.get(c.markup_id) ?? [];
    list.push(c);
    commentsByMarkup.set(c.markup_id, list);
  });

  const photosByMarkup = new Map<string, NonNullable<typeof photos>>();
  (photos ?? []).forEach((p) => {
    const list = photosByMarkup.get(p.markup_id) ?? [];
    list.push({ ...p, url: photoUrls.get(p.id) ?? null });
    photosByMarkup.set(p.markup_id, list);
  });

  return markups.map((m) => ({
    ...m,
    comments: commentsByMarkup.get(m.id) ?? [],
    photos: photosByMarkup.get(m.id) ?? [],
  })) as MarkupWithThread[];
}

export type CreateMarkupInput = {
  drawingId: string;
  version: number;
  pageNo: number;
  kind: MarkupKind;
  x: number;
  y: number;
  w?: number | null;
  h?: number | null;
  title: string;
  commentBody: string;
  clientId?: string;
};

export async function createMarkupAction(input: CreateMarkupInput) {
  const { userId, isAdminUser, projectId } = await assertDrawingMember(
    input.drawingId,
  );
  const supabase = await createClient();

  const row: Record<string, unknown> = {
    drawing_id: input.drawingId,
    version: input.version,
    page_no: input.pageNo,
    kind: input.kind,
    x: input.x,
    y: input.y,
    w: input.w ?? null,
    h: input.h ?? null,
    status: "open" as MarkupStatus,
    title: input.title.trim(),
    created_by: userId,
  };
  if (input.clientId) row.id = input.clientId;

  const { data: markup, error } = await supabase
    .from("drawing_markups")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { error: commentError } = await supabase.from("markup_comments").insert({
    markup_id: markup.id,
    body: input.commentBody.trim(),
    author: userId,
  });
  if (commentError) throw new Error(commentError.message);

  revalidatePath(`/projects/${projectId}`);
  return { id: markup.id };
}

export async function addMarkupCommentAction(
  markupId: string,
  body: string,
  projectId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: markup } = await supabase
    .from("drawing_markups")
    .select("drawing_id, status")
    .eq("id", markupId)
    .single();
  if (!markup) throw new Error("Markup not found");

  await assertDrawingMember(markup.drawing_id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { error } = await supabase.from("markup_comments").insert({
    markup_id: markupId,
    body: body.trim(),
    author: user.id,
  });
  if (error) throw new Error(error.message);

  // Auto-answer when draftsperson/owner replies to an open thread.
  if (
    markup.status === "open" &&
    (profile?.role === "owner" || profile?.role === "draftsperson")
  ) {
    await supabase
      .from("drawing_markups")
      .update({ status: "answered" })
      .eq("id", markupId);
  }

  revalidatePath(`/projects/${projectId}`);
}

export async function updateMarkupStatusAction(
  markupId: string,
  status: MarkupStatus,
  projectId: string,
) {
  const { profile } = await requireUser();
  const supabase = await createClient();

  if (status === "resolved" && !isAdmin(profile)) {
    throw new Error("Only admins can resolve markups");
  }

  const { data: markup } = await supabase
    .from("drawing_markups")
    .select("drawing_id")
    .eq("id", markupId)
    .single();
  if (!markup) throw new Error("Markup not found");

  await assertDrawingMember(markup.drawing_id);

  const { error } = await supabase
    .from("drawing_markups")
    .update({ status })
    .eq("id", markupId);
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
}

export async function requestMarkupPhotoUpload(
  markupId: string,
  fileName: string,
): Promise<{ path: string; token: string } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: markup } = await supabase
      .from("drawing_markups")
      .select("drawing_id")
      .eq("id", markupId)
      .single();
    if (!markup) return { error: "Markup not found" };
    await assertDrawingMember(markup.drawing_id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied" };
  }

  const admin = createAdminClient();
  const { error: bucketError } = await admin.storage.createBucket(PHOTO_BUCKET, {
    public: false,
  });
  if (bucketError && !/already exists/i.test(bucketError.message)) {
    return { error: bucketError.message };
  }

  const path = `${markupId}/${crypto.randomUUID()}-${sanitizeName(fileName)}`;
  const { data, error } = await admin.storage
    .from(PHOTO_BUCKET)
    .createSignedUploadUrl(path);
  if (error) return { error: error.message };

  return { path, token: data.token };
}

export async function registerMarkupPhoto(
  markupId: string,
  filePath: string,
  projectId: string,
  commentId?: string | null,
) {
  const { userId } = await (async () => {
    const supabase = await createClient();
    const { data: markup } = await supabase
      .from("drawing_markups")
      .select("drawing_id")
      .eq("id", markupId)
      .single();
    if (!markup) throw new Error("Markup not found");
    return assertDrawingMember(markup.drawing_id);
  })();

  const supabase = await createClient();
  const { error } = await supabase.from("markup_photos").insert({
    markup_id: markupId,
    comment_id: commentId ?? null,
    file_path: filePath,
    uploaded_by: userId,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
}

export async function carryForwardMarkupsAction(
  drawingId: string,
  fromVersion: number,
  toVersion: number,
  projectId: string,
) {
  const { profile } = await requireUser();
  if (!isAdmin(profile)) throw new Error("Admin only");

  const supabase = await createClient();
  const { data: openMarkups } = await supabase
    .from("drawing_markups")
    .select("*")
    .eq("drawing_id", drawingId)
    .eq("version", fromVersion)
    .eq("status", "open");

  if (!openMarkups?.length) return { copied: 0 };

  const copies = openMarkups.map((m) => ({
    drawing_id: drawingId,
    version: toVersion,
    page_no: m.page_no,
    kind: m.kind,
    x: m.x,
    y: m.y,
    w: m.w,
    h: m.h,
    path: m.path,
    status: "open" as MarkupStatus,
    title: m.title,
    created_by: m.created_by,
    carried_from_id: m.id,
    needs_review: true,
  }));

  const { error } = await supabase.from("drawing_markups").insert(copies);
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
  return { copied: copies.length };
}
