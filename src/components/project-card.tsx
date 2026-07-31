import Link from "next/link";
import type { Project } from "@/lib/types";
import { StatusChip } from "@/components/status-chip";
import { StatusSelect } from "@/components/status-select";
import { ProjectCardNameEditor } from "@/components/project-card-name-editor";
import { StructureThumbnail } from "@/components/structure-thumbnail";
import { CoverImage } from "@/components/cover-image";
import { resolveCoverUrl } from "@/lib/covers";

export function ProjectCard({
  project,
  canEdit = false,
}: {
  project: Project;
  canEdit?: boolean;
}) {
  const clientName = project.clients?.name ?? "No client";
  const revision = project.revision ?? 1;
  const drawings = project.drawing_count ?? 0;
  const coverSrc = resolveCoverUrl(project.cover_url);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-rule bg-paper transition-colors hover:border-ink/30">
      <Link href={`/projects/${project.id}`} className="block">
        {coverSrc ? (
          <div className="h-32 overflow-hidden border-b border-rule bg-paper">
            <CoverImage
              src={coverSrc}
              coverPath={project.cover_url}
              className="h-full w-full object-cover object-top"
            />
          </div>
        ) : (
          <StructureThumbnail
            projectId={project.id}
            name={project.name}
            structureType={project.structure_type}
          />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          {canEdit ? (
            <ProjectCardNameEditor
              projectId={project.id}
              initialName={project.name}
            />
          ) : (
            <Link href={`/projects/${project.id}`}>
              <h3 className="font-display text-lg font-medium leading-tight text-ink">
                {project.name}
              </h3>
            </Link>
          )}
          <p className="mt-1 text-sm text-graph">{clientName}</p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          {canEdit ? (
            <StatusSelect
              projectId={project.id}
              current={project.status}
              compact
            />
          ) : (
            <StatusChip status={project.status} />
          )}
          <span className="shrink-0 font-mono text-xs text-graph">
            rev{revision} · {drawings}
          </span>
        </div>
      </div>
    </article>
  );
}
