import Link from "next/link";
import type { Project } from "@/lib/types";
import { StatusChip } from "@/components/status-chip";
import { StatusSelect } from "@/components/status-select";
import { ProjectCardNameEditor } from "@/components/project-card-name-editor";
import { StructureThumbnail } from "@/components/structure-thumbnail";
import {
  isUploadedCover,
  resolveCoverUrl,
} from "@/lib/covers";

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
  const showPhoto = isUploadedCover(project.cover_url) && coverSrc;

  return (
    <article className="flex flex-col overflow-hidden rounded border border-rule bg-paper transition-colors hover:border-ink/30">
      <Link href={`/projects/${project.id}`} className="block">
        {showPhoto ? (
          <div className="h-32 overflow-hidden border-b border-rule bg-paper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverSrc}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : coverSrc ? (
          <div className="h-32 overflow-hidden border-b border-rule bg-paper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverSrc}
              alt=""
              className="h-full w-full object-cover object-top grayscale"
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
