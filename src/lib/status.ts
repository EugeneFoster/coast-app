import type { ProjectStatus } from "@/lib/types";

/**
 * `marker` picks the shape shown before the label, so status reads without
 * relying on colour alone (colour-blindness, greyscale print):
 *   hollow → not started · half → in flight · filled → done/committed.
 */
export const STATUS: Record<
  ProjectStatus,
  {
    label: string;
    text: string;
    border: string;
    bg: string;
    marker: "hollow" | "half" | "filled";
  }
> = {
  planned: {
    label: "Planned",
    text: "var(--graph)",
    border: "var(--rule)",
    bg: "transparent",
    marker: "hollow",
  },
  in_progress: {
    label: "In progress",
    text: "var(--weld-text)",
    border: "var(--weld)",
    bg: "transparent",
    marker: "half",
  },
  in_review: {
    label: "In review",
    text: "var(--ink)",
    border: "var(--ink)",
    bg: "transparent",
    marker: "half",
  },
  completed: {
    label: "Completed",
    text: "var(--bone)",
    border: "var(--ink)",
    bg: "var(--ink)",
    marker: "filled",
  },
  archived: {
    label: "Archived",
    text: "var(--graph)",
    border: "var(--rule)",
    bg: "transparent",
    marker: "hollow",
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
