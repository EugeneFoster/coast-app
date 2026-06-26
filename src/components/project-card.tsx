import Link from "next/link";
import type { Project } from "@/lib/types";
import { StatusChip } from "@/components/status-chip";

function ProjectThumbnail({ name }: { name: string }) {
  const label = name.split("·")[0]?.trim() ?? name;
  return (
    <div className="relative flex h-28 items-center justify-center overflow-hidden bg-ink/5 dark:bg-ink/10">
      <svg
        viewBox="0 0 200 80"
        className="h-full w-full text-ink/20 dark:text-ink/30"
        aria-hidden
      >
        <line x1="20" y1="60" x2="180" y2="60" stroke="currentColor" strokeWidth="0.5" />
        <rect x="40" y="30" width="120" height="30" fill="none" stroke="currentColor" strokeWidth="0.5" />
        <line x1="40" y1="30" x2="60" y2="15" stroke="currentColor" strokeWidth="0.5" />
        <line x1="160" y1="30" x2="140" y2="15" stroke="currentColor" strokeWidth="0.5" />
        <line x1="60" y1="15" x2="140" y2="15" stroke="currentColor" strokeWidth="0.5" />
        <text x="100" y="55" textAnchor="middle" className="fill-current font-mono text-[6px]">
          {label}
        </text>
      </svg>
    </div>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  const clientName = project.clients?.name ?? "No client";

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col overflow-hidden rounded border border-rule bg-paper transition-colors hover:border-ink/30"
    >
      <ProjectThumbnail name={project.name} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-display text-lg font-medium leading-tight text-ink group-hover:text-weld">
            {project.name}
          </h3>
          <p className="mt-1 text-sm text-graph">{clientName}</p>
        </div>
        <div className="mt-auto flex items-center justify-between">
          <StatusChip status={project.status} />
          <span className="font-mono text-xs text-graph">
            {new Date(project.updated_at).toLocaleDateString("en-CA")}
          </span>
        </div>
      </div>
    </Link>
  );
}
