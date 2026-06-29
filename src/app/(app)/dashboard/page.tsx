import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusChip } from "@/components/status-chip";
import type { ProjectStatus } from "@/lib/types";

function StatCard({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number | string;
  href?: string;
  accent?: boolean;
}) {
  const body = (
    <div
      className={`rounded border bg-paper p-5 transition-colors ${
        href ? "hover:border-ink/30" : ""
      } ${accent ? "border-weld/50" : "border-rule"}`}
    >
      <p
        className={`font-display text-3xl font-medium ${
          accent ? "text-weld" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-graph">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const admin = isAdmin(profile);

  if (admin) {
    const adminClient = createAdminClient();

    const [{ data: projects }, { data: openTasks }, { data: openPins }] =
      await Promise.all([
        adminClient.from("projects").select("id, name, status, updated_at"),
        adminClient.from("tasks").select("id, status").neq("status", "done"),
        adminClient.from("drawing_pins").select("id").eq("status", "open"),
      ]);

    const all = projects ?? [];
    const byStatus = (s: ProjectStatus) =>
      all.filter((p) => p.status === s).length;
    const active = all.filter((p) => p.status !== "archived");
    const inReview = active.filter((p) => p.status === "in_review");
    const blocked = (openTasks ?? []).filter(
      (t) => t.status === "blocked",
    ).length;

    const monthStart = new Date();
    monthStart.setDate(1);
    const { data: monthLogs } = await adminClient
      .from("time_logs")
      .select("minutes")
      .gte("work_date", monthStart.toISOString().slice(0, 10));
    const monthHours = Math.round(
      ((monthLogs ?? []).reduce((s, l) => s + (l.minutes ?? 0), 0) / 60) * 10,
    ) / 10;

    return (
      <div className="p-8">
        <h1 className="font-display text-3xl font-medium text-ink">Dashboard</h1>
        <p className="mt-2 text-sm text-graph">
          {active.length} active projects.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="In progress"
            value={byStatus("in_progress")}
            href="/projects?status=in_progress"
          />
          <StatCard
            label="In review"
            value={byStatus("in_review")}
            href="/projects?status=in_review"
            accent={inReview.length > 0}
          />
          <StatCard label="Open tasks" value={(openTasks ?? []).length} />
          <StatCard
            label="Open questions"
            value={(openPins ?? []).length}
            accent={(openPins ?? []).length > 0}
          />
          <StatCard label="Planned" value={byStatus("planned")} />
          <StatCard
            label="Blocked tasks"
            value={blocked}
            accent={blocked > 0}
          />
          <StatCard label="Completed" value={byStatus("completed")} />
          <StatCard label="Hours this month" value={monthHours} />
        </div>

        {inReview.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-lg font-medium text-ink">
              Awaiting review
            </h2>
            <ul className="mt-4 divide-y divide-rule/60 overflow-hidden rounded border border-rule">
              {inReview.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-bone"
                  >
                    <span className="text-sm text-ink">{p.name}</span>
                    <StatusChip status={p.status as ProjectStatus} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // Welder dashboard: my open work across assigned projects.
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, project_id, projects(name)")
    .eq("assignee_id", profile.id)
    .neq("status", "done")
    .order("status");

  const myTasks = (tasks ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    project_id: string;
    projects: { name: string } | { name: string }[] | null;
  }>;

  function projectName(p: (typeof myTasks)[number]) {
    const raw = Array.isArray(p.projects) ? p.projects[0] : p.projects;
    return raw?.name ?? "Project";
  }

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl font-medium text-ink">My work</h1>
      <p className="mt-2 text-sm text-graph">
        {myTasks.length} open {myTasks.length === 1 ? "task" : "tasks"} assigned
        to you.
      </p>

      {myTasks.length > 0 ? (
        <ul className="mt-8 divide-y divide-rule/60 overflow-hidden rounded border border-rule">
          {myTasks.map((t) => (
            <li key={t.id}>
              <Link
                href={`/projects/${t.project_id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-bone"
              >
                <span>
                  <span className="block text-sm text-ink">{t.title}</span>
                  <span className="text-xs text-graph">{projectName(t)}</span>
                </span>
                <span className="font-mono text-xs uppercase text-graph">
                  {t.status.replace("_", " ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-12 text-center text-graph">
          No open tasks. Check your projects for drawings and notes.
        </p>
      )}
    </div>
  );
}
