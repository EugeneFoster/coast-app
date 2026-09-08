import type { ProjectStatus } from "@/lib/types";
import { STATUS } from "@/lib/status";

const MARKER_CLASS: Record<"hollow" | "half" | "filled", string> = {
  hollow: "status-marker",
  half: "status-marker status-marker-half",
  filled: "status-marker status-marker-filled",
};

/**
 * Status as a shape plus a label. The square before the text carries the state
 * on its own — filled for done, half for in-flight, hollow for not-started — so
 * it survives colour-blindness and greyscale printing. Colour is reinforcement,
 * not the only signal.
 */
export function StatusChip({ status }: { status: ProjectStatus }) {
  const s = STATUS[status];

  return (
    <span
      className="inline-flex items-center gap-2 font-mono text-xs"
      style={{ color: s.text === "var(--bone)" ? "var(--ink)" : s.text }}
    >
      <span
        className={MARKER_CLASS[s.marker]}
        style={{ color: s.border }}
        aria-hidden
      />
      {s.label}
    </span>
  );
}
