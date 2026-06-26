"use client";

import type { ProjectStatus } from "@/lib/types";
import { updateProjectStatus } from "@/lib/actions/projects";

const options: { value: ProjectStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "in_review", label: "In review" },
  { value: "completed", label: "Completed" },
];

export function StatusSelect({
  projectId,
  current,
}: {
  projectId: string;
  current: ProjectStatus;
}) {
  return (
    <select
      value={current}
      onChange={(e) =>
        updateProjectStatus(projectId, e.target.value as ProjectStatus)
      }
      className="rounded border border-rule bg-paper px-3 py-1.5 text-sm text-ink focus:border-weld focus:outline-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
