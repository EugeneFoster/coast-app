import Link from "next/link";
import { ChevronRight, Grid2X2, List, Plus, SlidersHorizontal } from "lucide-react";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProjectCard } from "@/components/project-card";
import { StatusChip } from "@/components/status-chip";
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
  searchParams: Promise<{ status?: string; q?: string; view?: string; sort?: string }>;
}) {
  const { profile } = await requireUser();
  const admin = isAdmin(profile);
  const {
    status: statusFilter,
    q = "",
    view = "grid",
    sort = "recent",
  } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*, clients(id, name)")
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  const allProjects = data ?? [];
  const normalizedQuery = q.trim().toLowerCase();
  let projects = allProjects.filter((project) => {
    const statusMatches =
      !statusFilter || statusFilter === "all" || project.status === statusFilter;
    const searchMatches =
      !normalizedQuery ||
      project.name.toLowerCase().includes(normalizedQuery) ||
      (project.clients?.name ?? "").toLowerCase().includes(normalizedQuery);
    return statusMatches && searchMatches;
  });

  if (sort === "name") {
    projects = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  }

  const counts = Object.fromEntries(
    filters.map((filter) => [
      filter.value,
      filter.value === "all"
        ? allProjects.length
        : allProjects.filter((project) => project.status === filter.value).length,
    ]),
  );
  const updatedToday = allProjects.filter((project) => {
    const updated = new Date(project.updated_at);
    return updated.toDateString() === new Date().toDateString();
  }).length;

  function queryHref(next: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const values = { status: statusFilter, q, view, sort, ...next };
    for (const [key, value] of Object.entries(values)) {
      if (value && value !== "all" && value !== "recent" && value !== "grid") {
        params.set(key, value);
      }
    }
    const queryString = params.toString();
    return queryString ? `/projects?${queryString}` : "/projects";
  }

  return (
    <div className="px-3 pb-8 pt-3 md:px-4 md:pt-4 xl:px-6 xl:pb-10 xl:pt-6">
      <section>
        <div className="hidden items-end justify-between gap-4 md:flex">
          <div>
            <h1 className="font-display text-[28px] font-medium leading-none text-ink">
              Projects
            </h1>
            <p className="mt-2 text-[13px] text-graph">
              {allProjects.length} active · {updatedToday} updated today ·{" "}
              <span className="text-weld-text">
                {counts.in_review ?? 0} waiting on review
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="#project-filters"
              className="btn-secondary flex h-10 items-center gap-2 px-3.5 text-sm"
            >
              <SlidersHorizontal size={17} strokeWidth={1.5} aria-hidden />
              Filters
            </Link>
            {admin && (
              <Link
                href="/projects/new"
                className="btn-primary flex h-10 items-center gap-2 px-4 text-sm transition-opacity hover:opacity-90"
              >
                <Plus size={17} strokeWidth={1.5} aria-hidden />
                New project
              </Link>
            )}
          </div>
        </div>

        <div
          id="project-filters"
          className="-mx-3 flex gap-2 overflow-x-auto border-b border-rule px-3 pb-3 md:mx-0 md:mt-5 md:items-end md:gap-1 md:overflow-visible md:px-0 md:pb-0"
        >
          {filters.map((filter) => {
            const active =
              (filter.value === "all" &&
                (!statusFilter || statusFilter === "all")) ||
              statusFilter === filter.value;
            return (
              <Link
                key={filter.value}
                href={queryHref({ status: filter.value })}
                className={`relative flex h-9 shrink-0 items-center gap-1.5 rounded-[4px] border px-3 text-[13px] transition-colors md:h-10 md:rounded-none md:border-0 md:px-3 md:pb-3 ${
                  active
                    ? "border-ink bg-ink text-bone md:bg-transparent md:text-ink"
                    : "border-rule bg-paper text-graph hover:text-ink md:bg-transparent"
                }`}
              >
                {filter.label}
                <span className="rounded-[3px] border border-current/25 px-1.5 font-mono text-[10px] opacity-75">
                  {counts[filter.value] ?? 0}
                </span>
                {active && (
                  <span className="absolute bottom-[-1px] left-0 hidden h-0.5 w-full bg-weld md:block" />
                )}
              </Link>
            );
          })}

          <div className="ml-auto hidden items-center gap-2 pb-2 md:flex">
            <form action="/projects" className="flex items-center gap-2">
              {statusFilter && statusFilter !== "all" && (
                <input type="hidden" name="status" value={statusFilter} />
              )}
              {q && <input type="hidden" name="q" value={q} />}
              {view !== "grid" && <input type="hidden" name="view" value={view} />}
              <label htmlFor="project-sort" className="text-[13px] text-graph">
                Sort
              </label>
              <select
                id="project-sort"
                name="sort"
                defaultValue={sort}
                className="h-9 rounded-[4px] border border-rule bg-paper px-2.5 text-[13px] text-ink"
              >
                <option value="recent">Recently updated</option>
                <option value="name">Project name</option>
              </select>
              <button type="submit" className="sr-only">Apply sort</button>
            </form>
            <div className="flex overflow-hidden rounded-[4px] border border-rule">
              <Link
                href={queryHref({ view: "grid" })}
                aria-label="Grid view"
                className={`flex h-9 w-9 items-center justify-center ${view !== "table" ? "bg-ink text-bone" : "bg-paper text-graph"}`}
              >
                <Grid2X2 size={16} strokeWidth={1.5} aria-hidden />
              </Link>
              <Link
                href={queryHref({ view: "table" })}
                aria-label="Table view"
                className={`flex h-9 w-9 items-center justify-center ${view === "table" ? "bg-ink text-bone" : "bg-paper text-graph"}`}
              >
                <List size={17} strokeWidth={1.5} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="pt-3 md:pt-5">
        {projects.length > 0 ? (
          view === "table" ? (
            <>
              <div className="grid gap-3 md:hidden">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} canEdit={admin} />
                ))}
              </div>
              <div className="hidden overflow-hidden rounded-[4px] border border-rule bg-paper md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="border-b border-rule bg-ink/[0.03] font-mono text-[10px] uppercase tracking-[0.14em] text-graph">
                    <tr>
                      <th className="px-4 py-2.5 font-normal">Project</th>
                      <th className="px-4 py-2.5 font-normal">Client</th>
                      <th className="px-4 py-2.5 font-normal">Status</th>
                      <th className="px-4 py-2.5 text-right font-normal">Rev</th>
                      <th className="px-4 py-2.5 text-right font-normal">Drawings</th>
                      <th className="px-4 py-2.5 text-right font-normal">Updated</th>
                      <th className="w-11" />
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr
                        key={project.id}
                        className="border-b border-rule last:border-0 hover:bg-ink/[0.025]"
                      >
                        <td className="px-4 py-3 font-medium text-ink">
                          <Link href={`/projects/${project.id}`}>{project.name}</Link>
                          <p className="mt-0.5 font-mono text-[11px] text-graph">
                            PRJ-{project.id.slice(0, 4).toUpperCase()}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-graph">
                          {project.clients?.name ?? "No client"}
                        </td>
                        <td className="px-4 py-3"><StatusChip status={project.status} /></td>
                        <td className="px-4 py-3 text-right font-mono">{project.revision ?? 1}</td>
                        <td className="px-4 py-3 text-right font-mono">{project.drawing_count ?? 0}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-graph">
                          {new Intl.DateTimeFormat("en-CA", {
                            month: "short",
                            day: "numeric",
                          }).format(new Date(project.updated_at))}
                        </td>
                        <td className="px-4 py-3 text-right text-graph">
                          <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} canEdit={admin} />
              ))}
            </div>
          )
        ) : (
          <div className="rounded-[4px] border border-dashed border-rule bg-paper px-4 py-12 text-center">
            <p className="text-sm text-graph">No projects match these filters.</p>
            <Link href="/projects" className="mt-3 inline-flex text-sm font-medium text-weld-text">
              Clear filters
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
