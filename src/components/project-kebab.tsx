"use client";

import { useState } from "react";
import { archiveProject, deleteProject } from "@/lib/actions/projects";

export function ProjectKebab({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded border border-rule px-2 py-1 text-graph hover:text-ink"
        aria-label="Project actions"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-40 rounded border border-rule bg-paper py-1 shadow-lg">
          <form action={archiveProject.bind(null, projectId)}>
            <button
              type="submit"
              className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-bone"
            >
              Archive project
            </button>
          </form>
          <form action={deleteProject.bind(null, projectId)}>
            <button
              type="submit"
              className="w-full px-3 py-2 text-left text-sm text-weld hover:bg-bone"
            >
              Delete project
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
