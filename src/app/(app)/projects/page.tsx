import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProjectCard } from "@/components/project-card";
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

  const { data: projects } = await query;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-medium text-ink">Projects</h1>
        {admin && (
          <Link
            href="/projects/new"
            className="rounded bg-weld px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            New project
          </Link>
        )}
      </div>

      <div className="mt-6 flex gap-6 border-b border-rule">
        {filters.map((f) => {
          const active =
            (f.value === "all" && !statusFilter) || statusFilter === f.value;
          return (
            <Link
              key={f.value}
              href={
                f.value === "all" ? "/projects" : `/projects?status=${f.value}`
              }
              className={`relative pb-3 text-sm transition-colors ${
                active
                  ? "text-ink"
                  : "text-graph hover:text-ink"
              }`}
            >
              {f.label}
              {active && (
                <span className="absolute bottom-0 left-0 h-0.5 w-full bg-weld" />
              )}
            </Link>
          );
        })}
      </div>

      {projects && projects.length > 0 ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <p className="mt-12 text-center text-graph">No projects yet</p>
      )}
    </div>
  );
}
