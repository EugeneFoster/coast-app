import Link from "next/link";
import type { Project } from "@/lib/types";
import { StatusChip } from "@/components/status-chip";
import { StructureThumbnail } from "@/components/structure-thumbnail";

export function ProjectCard({ project }: { project: Project }) {
  const clientName = project.clients?.name ?? "No client";
  const revision = project.revision ?? 1;
  const drawings = project.drawing_count ?? 0;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col overflow-hidden rounded border border-rule bg-paper transition-colors hover:border-ink/30"
    >
      <StructureThumbnail
        name={project.name}
        structureType={project.structure_type}
      />
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
            rev{revision} · {drawings}
          </span>
        </div>
      </div>
    </Link>
  );
}
