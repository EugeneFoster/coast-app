import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/status-chip";
import { StatusSelect } from "@/components/status-select";
import { ProjectNameEditor } from "@/components/project-name-editor";
import { ProjectKebab } from "@/components/project-kebab";
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

      {project.description && (
        <div className="mt-8 rounded border border-rule bg-paper p-6">
          <h2 className="text-sm font-medium text-ink">Description</h2>
          <p className="mt-2 text-sm text-graph whitespace-pre-wrap">
            {project.description}
          </p>
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
