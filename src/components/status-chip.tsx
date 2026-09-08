import type { ProjectStatus } from "@/lib/types";
import { STATUS } from "@/lib/status";

export function StatusChip({ status }: { status: ProjectStatus }) {
  const s = STATUS[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-1 font-mono text-[11px]"
      style={{
        color: s.text,
        borderColor: s.border,
        backgroundColor: s.bg,
      }}
    >
      <span className="h-1.5 w-1.5 bg-current" aria-hidden />
      {s.label}
    </span>
  );
}
