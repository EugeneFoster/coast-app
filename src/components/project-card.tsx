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
    <article className="relative flex overflow-visible rounded-[4px] border border-rule bg-paper transition-colors hover:border-ink/40 md:flex-col">
      <span className="blueprint-corner tl hidden md:block" aria-hidden>+</span>
      <span className="blueprint-corner tr hidden md:block" aria-hidden>+</span>
      <span className="blueprint-corner bl hidden md:block" aria-hidden>+</span>
      <span className="blueprint-corner br hidden md:block" aria-hidden>+</span>
      <Link href={`/projects/${project.id}`} className="project-card-media block w-[88px] shrink-0 overflow-hidden rounded-l-[3px] md:w-auto md:rounded-l-none md:rounded-t-[3px]">
        {coverSrc ? (
          <div className="h-full min-h-[84px] overflow-hidden border-r border-rule bg-paper md:h-[120px] md:min-h-0 md:border-b md:border-r-0">
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
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 md:p-4">
        <div>
          <p className="hidden font-mono text-[10px] uppercase tracking-[0.1em] text-graph md:block">
            PRJ-{project.id.slice(0, 4).toUpperCase()}
          </p>
          {canEdit ? (
            <ProjectCardNameEditor
              projectId={project.id}
              initialName={project.name}
            />
          ) : (
            <Link href={`/projects/${project.id}`}>
              <h3 className="mt-1 font-display text-base font-medium leading-tight text-ink md:text-[17px]">
                {project.name}
              </h3>
            </Link>
          )}
          <p className="mt-1 text-[13px] text-graph">{clientName}</p>
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
          <span className="shrink-0 font-mono text-[11px] text-graph">
            R{revision} · {drawings} dwg
          </span>
        </div>
      </div>
    </article>
  );
}
