"use client";

import { useState } from "react";
import type { ProjectStatus } from "@/lib/types";
import { updateProjectStatus } from "@/lib/actions/projects";
import { EDITABLE_STATUSES, STATUS, statusStyles } from "@/lib/status";

export function StatusSelect({
  projectId,
  current,
  compact = false,
}: {
  projectId: string;
  current: ProjectStatus;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<ProjectStatus | null>(null);
  const value = draft ?? current;

  return (
    <select
      value={value}
      onChange={(e) => {
        const next = e.target.value as ProjectStatus;
        setDraft(next);
        void updateProjectStatus(projectId, next).finally(() => setDraft(null));
      }}
      onClick={(e) => e.stopPropagation()}
      style={statusStyles(value)}
      className={`rounded-[14px] border font-mono focus:outline-none focus:ring-1 focus:ring-weld/40 ${
        compact ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-sm"
      }`}
    >
      {EDITABLE_STATUSES.map((status) => (
        <option key={status} value={status}>
          {STATUS[status].label}
        </option>
      ))}
    </select>
  );
}
