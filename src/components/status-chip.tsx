import type { ProjectStatus } from "@/lib/types";

const labels: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  in_review: "In review",
  completed: "Completed",
  archived: "Archived",
};

const styles: Record<ProjectStatus, string> = {
  planned: "border-graph text-graph",
  in_progress: "border-weld text-weld",
  in_review: "border-ink text-ink",
  completed: "bg-ink text-paper border-ink",
  archived: "border-rule text-graph opacity-60",
};

export function StatusChip({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono uppercase tracking-wide ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
