import type { ProjectStatus } from "@/lib/types";
import { STATUS } from "@/lib/status";

export function StatusChip({ status }: { status: ProjectStatus }) {
  const s = STATUS[status];

  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap text-[12px]"
      style={{
        color: s.text,
      }}
    >
      <span className="flex h-[10px] w-[10px] shrink-0 items-center justify-center border" style={{ borderColor: s.border, backgroundColor: s.bg }} aria-hidden>
        {status === "in_review" && <span className="h-1 w-1 bg-current" />}
      </span>
      {s.label}
    </span>
  );
}
