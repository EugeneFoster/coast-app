import type { ProjectStatus } from "@/lib/types";

export const STATUS: Record<
  ProjectStatus,
  { label: string; text: string; border: string; bg: string }
> = {
  planned: {
    label: "Planned",
    text: "var(--graph)",
    border: "var(--rule)",
    bg: "transparent",
  },
  in_progress: {
    label: "In progress",
    text: "var(--weld)",
    border: "var(--weld)",
    bg: "transparent",
  },
  in_review: {
    label: "In review",
    text: "var(--ink)",
    border: "var(--ink)",
    bg: "transparent",
  },
  completed: {
    label: "Completed",
    text: "var(--bone)",
    border: "var(--ink)",
    bg: "var(--ink)",
  },
  archived: {
    label: "Archived",
    text: "var(--graph)",
    border: "var(--rule)",
    bg: "transparent",
  },
};

export const EDITABLE_STATUSES: ProjectStatus[] = [
  "planned",
  "in_progress",
  "in_review",
  "completed",
];

export function statusStyles(status: ProjectStatus) {
  const s = STATUS[status];
  return {
    color: s.text,
    borderColor: s.border,
    backgroundColor: s.bg,
  };
}
