import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/status-chip";
import { StatusSelect } from "@/components/status-select";
import { ProjectNameEditor } from "@/components/project-name-editor";
import { ProjectKebab } from "@/components/project-kebab";
import { ProjectTabs } from "@/components/project-tabs";
import { assignWelderFromForm, removeWelder } from "@/lib/actions/projects";

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
  const { data: project } = await supabase
    .from("projects")
    .select("*, clients(id, name)")
    .eq("id", id)
    .single();

  if (!project) notFound();

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

  const { data: drawings } = await supabase
    .from("drawings")
    .select("id, file_path, original_name")
    .eq("project_id", id)
    .order("created_at");

  const { data: galleryRows } = await supabase
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

  // Drawings (private bucket → signed URLs, rendered inline)
  let drawingLinks: { name: string; url: string }[] = [];
  if (drawings && drawings.length > 0) {
    const { data: signed } = await supabase.storage
      .from("project-drawings")
      .createSignedUrls(
        drawings.map((d) => d.file_path),
        3600,
      );
    drawingLinks = (signed ?? []).flatMap((s, i) =>
      s.signedUrl
        ? [{ name: drawings[i].original_name ?? `Drawing ${i + 1}`, url: s.signedUrl }]
        : [],
    );
  }

  // Gallery (private bucket → signed URLs)
  let gallery: {
    id: string;
    url: string;
    type: "photo" | "video";
    author: string;
  }[] = [];
  if (galleryRows && galleryRows.length > 0) {
    const { data: signed } = await supabase.storage
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
    <section className="rounded border border-rule bg-paper p-6">
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
  ) : null;

  return (
    <div className="p-8">
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
      </div>

      <ProjectTabs
        projectId={id}
        coverUrl={coverUrl}
        description={project.description}
        modelUrl={modelUrl}
        drawings={drawingLinks}
        gallery={gallery}
        canUpload={admin || assignedIds.has(profile.id)}
        weldersSlot={weldersSlot}
      />
    </div>
  );
}
