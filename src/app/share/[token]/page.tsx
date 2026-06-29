import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusChip } from "@/components/status-chip";
import type { ProjectStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_PROGRESS: Record<ProjectStatus, number> = {
  planned: 10,
  in_progress: 45,
  in_review: 75,
  completed: 100,
  archived: 100,
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("id, name, description, status, cover_url, completed_at, share_token")
    .eq("share_token", token)
    .maybeSingle();

  if (!project) notFound();

  const coverUrl = project.cover_url
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-covers/${project.cover_url}`
    : null;

  const [{ count: totalTasks }, { count: doneTasks }] = await Promise.all([
    admin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id),
    admin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .eq("status", "done"),
  ]);

  const status = project.status as ProjectStatus;
  const taskPct =
    totalTasks && totalTasks > 0
      ? Math.round(((doneTasks ?? 0) / totalTasks) * 100)
      : STATUS_PROGRESS[status];

  return (
    <div className="min-h-screen bg-bone px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-graph">
          COAST · metal works
        </p>

        <div className="mt-4 overflow-hidden rounded border border-rule bg-paper">
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="h-56 w-full border-b border-rule object-cover"
            />
          )}
          <div className="p-6">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display text-2xl font-medium text-ink">
                {project.name}
              </h1>
              <StatusChip status={status} />
            </div>

            {project.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-graph">
                {project.description}
              </p>
            )}

            <div className="mt-6">
              <div className="flex items-center justify-between text-xs text-graph">
                <span>Progress</span>
                <span className="font-mono">{taskPct}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-weld"
                  style={{ width: `${taskPct}%` }}
                />
              </div>
            </div>

            {project.completed_at && (
              <p className="mt-6 rounded border border-rule bg-bone px-3 py-2 text-sm text-ink">
                Completed{" "}
                {new Date(project.completed_at).toLocaleDateString("en-CA")}
              </p>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-graph">
          Shared read-only by your fabrication team.
        </p>
      </div>
    </div>
  );
}
