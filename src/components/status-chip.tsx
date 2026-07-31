import type { ProjectStatus } from "@/lib/types";
import { STATUS } from "@/lib/status";

export function StatusChip({ status }: { status: ProjectStatus }) {
  const s = STATUS[status];

  return (
    <span
      className="inline-flex items-center rounded-[14px] border px-2 py-0.5 font-mono text-xs"
      style={{
        color: s.text,
        borderColor: s.border,
        backgroundColor: s.bg,
      }}
    >
      {s.label}
    </span>
  );
}
