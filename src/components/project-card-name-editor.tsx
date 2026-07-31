"use client";

import { useState } from "react";
import Link from "next/link";
import { updateProjectName } from "@/lib/actions/projects";

export function ProjectCardNameEditor({
  projectId,
  initialName,
}: {
  projectId: string;
  initialName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);

  if (!editing) {
    return (
      <div className="group flex min-w-0 items-start gap-1.5">
        <Link
          href={`/projects/${projectId}`}
          className="min-w-0 font-display text-lg font-medium leading-tight text-ink hover:text-ink/80"
        >
          {name}
        </Link>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setEditing(true);
          }}
          className="shrink-0 text-graph opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Rename project"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await updateProjectName(projectId, name);
        setEditing(false);
      }}
      className="flex min-w-0 items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 border-b border-weld bg-transparent font-display text-lg font-medium text-ink focus:outline-none"
        autoFocus
      />
      <button
        type="submit"
        className="shrink-0 rounded bg-weld px-2 py-0.5 text-xs text-paper"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setName(initialName);
          setEditing(false);
        }}
        className="shrink-0 text-xs text-graph"
      >
        Cancel
      </button>
    </form>
  );
}
