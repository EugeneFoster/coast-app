import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/status-chip";
import { StatusSelect } from "@/components/status-select";
import { ProjectNameEditor } from "@/components/project-name-editor";
import { ProjectKebab } from "@/components/project-kebab";
import { ModelPreview } from "@/components/model-preview";
import { assignWelderFromForm, removeWelder } from "@/lib/actions/projects";

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

  let coverUrl: string | null = null;
  if (project.cover_url) {
    coverUrl = supabase.storage
      .from("project-covers")
      .getPublicUrl(project.cover_url).data.publicUrl;
  }

  let modelUrl: string | null = null;
  if (project.model_url) {
    const { data: signed } = await supabase.storage
      .from("project-models")
      .createSignedUrl(project.model_url, 3600);
    modelUrl = signed?.signedUrl ?? null;
  }

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
          <p className="mt-2 text-graph">
            {project.clients?.name ?? "No client"}
          </p>
        </div>
        {admin && <ProjectKebab projectId={id} />}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {admin ? (
          <StatusSelect projectId={id} current={project.status} />
        ) : (
          <StatusChip status={project.status} />
        )}
        <span className="font-mono text-sm text-graph">
          Updated {new Date(project.updated_at).toLocaleDateString("en-CA")}
        </span>
      </div>

      {coverUrl && (
        <div className="mt-8 overflow-hidden rounded border border-rule bg-paper">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt={`${project.name} cover`}
            className="max-h-80 w-full object-cover"
          />
        </div>
      )}

      {project.description && (
        <div className="mt-8 rounded border border-rule bg-paper p-6">
          <h2 className="text-sm font-medium text-ink">Description</h2>
          <p className="mt-2 text-sm text-graph whitespace-pre-wrap">
            {project.description}
          </p>
        </div>
      )}

      {modelUrl && (
        <div className="mt-8 rounded border border-rule bg-paper p-6">
          <h2 className="font-display text-lg font-medium text-ink">3D model</h2>
          <div className="mt-4">
            <ModelPreview src={modelUrl} />
          </div>
        </div>
      )}

      {drawingLinks.length > 0 && (
        <div className="mt-8 rounded border border-rule bg-paper p-6">
          <h2 className="font-display text-lg font-medium text-ink">
            Drawings{" "}
            <span className="font-mono text-sm text-graph">
              ({drawingLinks.length})
            </span>
          </h2>
          <ul className="mt-4 space-y-2">
            {drawingLinks.map((d, i) => (
              <li key={i}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded border border-rule px-3 py-2 text-sm text-ink transition-colors hover:border-weld hover:text-weld"
                >
                  <span className="truncate">{d.name}</span>
                  <span className="ml-3 font-mono text-xs text-graph">PDF</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {admin && (
        <div className="mt-8 rounded border border-rule bg-paper p-6">
          <h2 className="font-display text-lg font-medium text-ink">
            Assigned welders
          </h2>
          <ul className="mt-4 space-y-2">
            {members?.map((m) => {
              const raw = m.profiles;
              const p = (Array.isArray(raw) ? raw[0] : raw) as {
                id: string;
                full_name: string | null;
                login: string;
              } | null;
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
        </div>
      )}

      {!admin && (
        <p className="mt-8 text-sm text-graph">Read-only project view</p>
      )}
    </div>
  );
}
