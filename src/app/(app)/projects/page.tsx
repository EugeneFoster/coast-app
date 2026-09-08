import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProjectCard } from "@/components/project-card";
import { HairlineMotif } from "@/components/hairline-motif";
import type { ProjectStatus } from "@/lib/types";

const filters: { label: string; value: ProjectStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Planned", value: "planned" },
  { label: "In progress", value: "in_progress" },
  { label: "In review", value: "in_review" },
  { label: "Completed", value: "completed" },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { profile } = await requireUser();
  const admin = isAdmin(profile);
  const { status: statusFilter } = await searchParams;

  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select("*, clients(id, name)")
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  // Status tallies for the tab badges and the actionable subtitle. RLS scopes
  // this to what the user can already see, so the counts match the grid.
  const [{ data: projects }, { data: allRows }] = await Promise.all([
    query,
    supabase.from("projects").select("status").neq("status", "archived"),
  ]);

  const counts = (allRows ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const activeTotal = allRows?.length ?? 0;
  const inReview = counts.in_review ?? 0;
  const countFor = (value: ProjectStatus | "all") =>
    value === "all" ? activeTotal : (counts[value] ?? 0);

  return (
    <>
      <section className="bg-bone px-8 pt-7">
        <p className="kicker">Work</p>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-medium text-ink">Projects</h1>
            <p className="mt-1 text-sm text-graph">
              {activeTotal} active
              {inReview > 0 && (
                <>
                  {" · "}
                  <Link
                    href="/projects?status=in_review"
                    className="text-weld-text underline-offset-2 hover:underline"
                  >
                    {inReview} waiting on review
                  </Link>
                </>
              )}
            </p>
          </div>
          {admin && (
            <Link
              href="/projects/new"
              className="btn-primary px-4 py-2 text-sm transition-opacity hover:opacity-90"
            >
              New project
            </Link>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          {filters.map((f) => {
            const active =
              (f.value === "all" && !statusFilter) || statusFilter === f.value;
            return (
              <Link
                key={f.value}
                href={
                  f.value === "all" ? "/projects" : `/projects?status=${f.value}`
                }
                className={`relative flex items-center gap-2 pb-3 text-sm transition-colors ${
                  active ? "text-ink" : "text-graph hover:text-ink"
                }`}
              >
                {f.label}
                <span className="count-badge">{countFor(f.value)}</span>
                {active && (
                  <span className="absolute bottom-0 left-0 h-0.5 w-full bg-weld" />
                )}
              </Link>
            );
          })}
        </div>

        <HairlineMotif className="mt-4 pb-1" />
      </section>

      <section className="bg-bone px-8 pb-10 pt-8">
        {projects && projects.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} canEdit={admin} />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-rule bg-paper px-6 py-16 text-center">
            <p className="font-display text-lg text-ink">No projects here</p>
            <p className="mt-1 text-sm text-graph">
              {statusFilter && statusFilter !== "all"
                ? "Nothing matches this filter yet."
                : "New projects will appear here as they are created."}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
