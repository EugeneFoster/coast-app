"use client";

import { useState } from "react";
import { updateProjectName } from "@/lib/actions/projects";

export function ProjectNameEditor({
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
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex items-center gap-2"
        aria-label="Rename project"
      >
        <h1 className="font-display text-3xl font-medium text-ink">{name}</h1>
        <span className="text-graph opacity-0 transition-opacity group-hover:opacity-100">
          ✎
        </span>
      </button>
    );
  }

  return (
    <form
      action={async () => {
        await updateProjectName(projectId, name);
        setEditing(false);
      }}
      className="flex items-center gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="font-display text-3xl font-medium text-ink border-b border-weld bg-transparent focus:outline-none"
        autoFocus
      />
      <button
        type="submit"
        className="rounded bg-weld px-3 py-1 text-sm text-paper"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setName(initialName);
          setEditing(false);
        }}
        className="text-sm text-graph"
      >
        Cancel
      </button>
    </form>
  );
}
