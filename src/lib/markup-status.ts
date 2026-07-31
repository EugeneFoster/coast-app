import type { MarkupStatus } from "@/lib/types";

/** Shared status colours for canvas overlays, chips, and thumbnails. */
export const MARKUP_STATUS: Record<
  MarkupStatus,
  { label: string; text: string; border: string; bg: string; fill?: string }
> = {
  open: {
    label: "Open",
    text: "var(--weld)",
    border: "var(--weld)",
    bg: "transparent",
    fill: "var(--weld)",
  },
  answered: {
    label: "Answered",
    text: "var(--ink)",
    border: "var(--ink)",
    bg: "transparent",
    fill: "transparent",
  },
  resolved: {
    label: "Resolved",
    text: "var(--graph)",
    border: "var(--ink)",
    bg: "color-mix(in srgb, var(--ink) 12%, transparent)",
    fill: "color-mix(in srgb, var(--ink) 35%, transparent)",
  },
};

export function markupStatusStyles(status: MarkupStatus) {
  const s = MARKUP_STATUS[status];
  return { color: s.text, borderColor: s.border, backgroundColor: s.bg };
}
