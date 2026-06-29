import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusChip } from "@/components/status-chip";
import { StatusSelect } from "@/components/status-select";
import { ProjectNameEditor } from "@/components/project-name-editor";
import { ProjectKebab } from "@/components/project-kebab";
import { ShareControl } from "@/components/share-control";
import { ProjectTabs } from "@/components/project-tabs";
import { assignWelderFromForm, removeWelder } from "@/lib/actions/projects";
import type { DrawingPin, PinComment, Task, TimeLog } from "@/lib/types";

type ProfileLite = {
  id: string;
  full_name: string | null;
  login: string;
  role?: string;
};

function authorName(p: ProfileLite | null) {
  return p?.full_name ?? p?.login ?? "Unknown";
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireUser();
  const admin = isAdmin(profile);

  const supabase = await createClient();
  const adminClient = createAdminClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*, clients(id, name)")
    .eq("id", id)
    .single();

  if (!project) notFound();

  let signedOffBy: string | null = null;
  if (project.completed_at && project.completed_by) {
    const { data: signer } = await adminClient
      .from("profiles")
      .select("full_name, login")
      .eq("id", project.completed_by)
      .maybeSingle();
    signedOffBy = signer ? (signer.full_name ?? signer.login) : null;
  }

  const { data: members } = await supabase
    .from("project_members")
    .select("profile_id, profiles(id, full_name, login, role)")
    .eq("project_id", id);

  const { data: welders } = admin
    ? await supabase
        .from("profiles")
        .select("id, full_name, login")
        .eq("role", "welder")
        .eq("status", "active")
    : { data: null };

  const assignedIds = new Set(members?.map((m) => m.profile_id) ?? []);

  // select("*") stays resilient if the status/version columns aren't migrated yet.
  const { data: drawings } = await supabase
    .from("drawings")
    .select("*")
    .eq("project_id", id)
    .order("created_at");

  // Gallery is read with the service role (access already gated by the project
  // fetch above), so no per-table read policy is required.
  const { data: galleryRows } = await adminClient
    .from("gallery_items")
    .select("id, file_path, media_type, profiles:uploaded_by(full_name, login)")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  // Cover (public bucket → public URL)
  const coverUrl = project.cover_url
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-covers/${project.cover_url}`
    : null;

  // Model (private bucket → signed URL)
  let modelUrl: string | null = null;
  if (project.model_url) {
    const { data: signed } = await supabase.storage
      .from("project-models")
      .createSignedUrl(project.model_url, 3600);
    modelUrl = signed?.signedUrl ?? null;
  }

  // Drawings → deep-zoom viewer files (pages from drawing_pages, PDF fallback).
  type DrawingRow = {
    id: string;
    file_path: string;
    original_name: string | null;
    status: string | null;
    version: number | null;
    page_count: number | null;
  };
  const drawingRows = (drawings ?? []) as DrawingRow[];

  let pagesByDrawing = new Map<
    string,
    { pageNo: number; width: number; height: number }[]
  >();
  if (drawingRows.length > 0) {
    const { data: pageRows } = await adminClient
      .from("drawing_pages")
      .select("drawing_id, page_no, width, height")
      .in(
        "drawing_id",
        drawingRows.map((d) => d.id),
      )
      .order("page_no");
    pagesByDrawing = (pageRows ?? []).reduce((map, r) => {
      const list = map.get(r.drawing_id) ?? [];
      list.push({ pageNo: r.page_no, width: r.width, height: r.height });
      map.set(r.drawing_id, list);
      return map;
    }, new Map<string, { pageNo: number; width: number; height: number }[]>());
  }

  const pdfFallback = new Map<string, string>();
  if (drawingRows.length > 0) {
    const { data: signed } = await supabase.storage
      .from("project-drawings")
      .createSignedUrls(
        drawingRows.map((d) => d.file_path),
        3600,
      );
    (signed ?? []).forEach((s, i) => {
      if (s.signedUrl) pdfFallback.set(drawingRows[i].id, s.signedUrl);
    });
  }

  // Drawing pins (anchored annotations / questions) + their comment threads.
  type PinRow = {
    id: string;
    drawing_id: string;
    version: number | null;
    page_no: number;
    bx: number;
    by: number;
    bw: number;
    bh: number;
    body: string | null;
    status: string | null;
    created_by: string | null;
    created_at: string;
    author: ProfileLite | ProfileLite[] | null;
  };
  type PinCommentRow = {
    id: string;
    pin_id: string;
    body: string;
    created_by: string | null;
    created_at: string;
    author: ProfileLite | ProfileLite[] | null;
  };

  const pinsByDrawing = new Map<string, DrawingPin[]>();
  if (drawingRows.length > 0) {
    const { data: pinRows } = await adminClient
      .from("drawing_pins")
      .select(
        "id, drawing_id, version, page_no, bx, by, bw, bh, body, status, created_by, created_at, author:created_by(full_name, login)",
      )
      .eq("project_id", id)
      .order("created_at");

    const rows = (pinRows ?? []) as PinRow[];
    const pinIds = rows.map((p) => p.id);

    const commentsByPin = new Map<string, PinComment[]>();
    if (pinIds.length > 0) {
      const { data: commentRows } = await adminClient
        .from("pin_comments")
        .select(
          "id, pin_id, body, created_by, created_at, author:created_by(full_name, login)",
        )
        .in("pin_id", pinIds)
        .order("created_at");
      for (const c of (commentRows ?? []) as PinCommentRow[]) {
        const raw = Array.isArray(c.author) ? c.author[0] : c.author;
        const list = commentsByPin.get(c.pin_id) ?? [];
        list.push({
          id: c.id,
          body: c.body,
          author: authorName(raw),
          authorId: c.created_by,
          createdAt: c.created_at,
        });
        commentsByPin.set(c.pin_id, list);
      }
    }

    for (const p of rows) {
      const raw = Array.isArray(p.author) ? p.author[0] : p.author;
      const list = pinsByDrawing.get(p.drawing_id) ?? [];
      list.push({
        id: p.id,
        drawingId: p.drawing_id,
        version: p.version ?? 1,
        pageNo: p.page_no,
        bbox: { x: p.bx, y: p.by, w: p.bw, h: p.bh },
        body: p.body,
        status: (p.status ?? "open") as DrawingPin["status"],
        author: authorName(raw),
        authorId: p.created_by,
        createdAt: p.created_at,
        comments: commentsByPin.get(p.id) ?? [],
      });
      pinsByDrawing.set(p.drawing_id, list);
    }
  }

  // Tasks (Phase 2) for this project + assignee names.
  type TaskRow = {
    id: string;
    title: string;
    description: string | null;
    status: string | null;
    due_date: string | null;
    assignee_id: string | null;
    drawing_pin_id: string | null;
    created_at: string;
    assignee: ProfileLite | ProfileLite[] | null;
  };
  const { data: taskRows } = await adminClient
    .from("tasks")
    .select(
      "id, title, description, status, due_date, assignee_id, drawing_pin_id, created_at, assignee:assignee_id(full_name, login)",
    )
    .eq("project_id", id)
    .order("created_at");
  const tasks: Task[] = ((taskRows ?? []) as TaskRow[]).map((t) => {
    const raw = Array.isArray(t.assignee) ? t.assignee[0] : t.assignee;
    return {
      id: t.id,
      projectId: id,
      title: t.title,
      description: t.description,
      status: (t.status ?? "todo") as Task["status"],
      assigneeId: t.assignee_id,
      assigneeName: raw ? authorName(raw) : null,
      drawingPinId: t.drawing_pin_id,
      dueDate: t.due_date,
      createdAt: t.created_at,
    };
  });

  // Time logs (Phase 4): admins see all entries for the project, welders see
  // only their own.
  type TimeRow = {
    id: string;
    minutes: number;
    work_date: string;
    note: string | null;
    task_id: string | null;
    profile_id: string | null;
    created_at: string;
    author: ProfileLite | ProfileLite[] | null;
  };
  let timeQuery = adminClient
    .from("time_logs")
    .select(
      "id, minutes, work_date, note, task_id, profile_id, created_at, author:profile_id(full_name, login)",
    )
    .eq("project_id", id);
  if (!admin) timeQuery = timeQuery.eq("profile_id", profile.id);
  const { data: logRows } = await timeQuery.order("work_date", {
    ascending: false,
  });
  const timeLogs: TimeLog[] = ((logRows ?? []) as TimeRow[]).map((l) => {
    const raw = Array.isArray(l.author) ? l.author[0] : l.author;
    return {
      id: l.id,
      minutes: l.minutes,
      workDate: l.work_date,
      note: l.note,
      author: authorName(raw),
      authorId: l.profile_id,
      taskId: l.task_id,
      createdAt: l.created_at,
    };
  });
  const totalMinutes = timeLogs.reduce((s, l) => s + (l.minutes ?? 0), 0);

  // People who can be assigned tasks: the project's assigned members.
  const memberOptions = (members ?? []).flatMap((m) => {
    const raw = m.profiles;
    const p = (Array.isArray(raw) ? raw[0] : raw) as ProfileLite | null;
    return p ? [{ id: p.id, name: p.full_name ?? p.login }] : [];
  });

  const drawingFiles = drawingRows.map((d, i) => ({
    id: d.id,
    name: d.original_name ?? `Drawing ${i + 1}`,
    status: d.status ?? "processing",
    version: d.version ?? 1,
    pageCount: d.page_count ?? null,
    pages: pagesByDrawing.get(d.id) ?? [],
    pdfUrl: pdfFallback.get(d.id) ?? null,
    pins: pinsByDrawing.get(d.id) ?? [],
  }));

  // Gallery (private bucket → signed URLs)
  let gallery: {
    id: string;
    url: string;
    type: "photo" | "video";
    author: string;
  }[] = [];
  if (galleryRows && galleryRows.length > 0) {
    const { data: signed } = await adminClient.storage
      .from("project-gallery")
      .createSignedUrls(
        galleryRows.map((g) => g.file_path),
        3600,
      );
    gallery = (galleryRows ?? []).flatMap((g, i) => {
      const url = signed?.[i]?.signedUrl;
      if (!url) return [];
      const raw = g.profiles as ProfileLite | ProfileLite[] | null;
      const author = authorName(Array.isArray(raw) ? raw[0] : raw);
      return [{ id: g.id, url, type: g.media_type as "photo" | "video", author }];
    });
  }

  const weldersSlot = admin ? (
    <>
    <section className="border-t border-rule pt-6">
      <h2 className="font-display text-lg font-medium text-ink">
        Assigned welders
      </h2>
      <ul className="mt-4 space-y-2">
        {members?.map((m) => {
          const raw = m.profiles;
          const p = (Array.isArray(raw) ? raw[0] : raw) as ProfileLite | null;
          if (!p) return null;
          return (
            <li
              key={m.profile_id}
              className="flex items-center justify-between text-sm"
            >
              <span>{p.full_name ?? p.login}</span>
              <form action={removeWelder.bind(null, id, m.profile_id)}>
                <button
                  type="submit"
                  className="text-xs text-graph hover:text-weld"
                >
                  Remove
                </button>
              </form>
            </li>
          );
        })}
        {(!members || members.length === 0) && (
          <li className="text-sm text-graph">No welders assigned</li>
        )}
      </ul>

      {welders && welders.length > 0 && (
        <form action={assignWelderFromForm} className="mt-4 flex gap-2">
          <input type="hidden" name="project_id" value={id} />
          <select
            name="welder_id"
            defaultValue=""
            className="flex-1 rounded border border-rule bg-bone px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Add welder…
            </option>
            {welders
              .filter((w) => !assignedIds.has(w.id))
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name ?? w.login}
                </option>
              ))}
          </select>
          <button
            type="submit"
            className="rounded border border-rule px-4 py-2 text-sm hover:bg-bone"
          >
            Assign
          </button>
        </form>
      )}
    </section>
    <ShareControl projectId={id} initialToken={project.share_token ?? null} />
    </>
  ) : null;

  return (
    <div className="p-6 sm:p-8">
      <Link href="/projects" className="text-sm text-graph hover:text-ink">
        ← Back to projects
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          {admin ? (
            <ProjectNameEditor projectId={id} initialName={project.name} />
          ) : (
            <h1 className="font-display text-3xl font-medium text-ink">
              {project.name}
            </h1>
          )}
          <p className="mt-2 text-graph">{project.clients?.name ?? "No client"}</p>
        </div>
        {admin && <ProjectKebab projectId={id} />}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        {admin ? (
          <StatusSelect projectId={id} current={project.status} />
        ) : (
          <StatusChip status={project.status} />
        )}
        <span className="font-mono text-sm text-graph">
          Updated {new Date(project.updated_at).toLocaleDateString("en-CA")}
        </span>
        {project.completed_at && (
          <span className="font-mono text-sm text-weld">
            Signed off{" "}
            {new Date(project.completed_at).toLocaleDateString("en-CA")}
            {signedOffBy ? ` · ${signedOffBy}` : ""}
          </span>
        )}
      </div>

      <ProjectTabs
        projectId={id}
        name={project.name}
        coverUrl={coverUrl}
        description={project.description}
        modelUrl={modelUrl}
        drawings={drawingFiles}
        gallery={gallery}
        tasks={tasks}
        members={memberOptions}
        timeLogs={timeLogs}
        totalMinutes={totalMinutes}
        canManage={admin}
        canUpload={admin || assignedIds.has(profile.id)}
        currentUserId={profile.id}
        weldersSlot={weldersSlot}
      />
    </div>
  );
}
