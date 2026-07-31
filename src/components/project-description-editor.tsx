"use client";

import { useState } from "react";
import { updateProjectDescription } from "@/lib/actions/projects";

export function ProjectDescriptionEditor({
  projectId,
  initialDescription,
}: {
  projectId: string;
  initialDescription: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div className="group mt-3">
        {description ? (
          <p className="whitespace-pre-wrap text-sm text-graph">{description}</p>
        ) : (
          <p className="text-sm text-graph">No description.</p>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 text-xs text-graph opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
        >
          Edit description
        </button>
      </div>
    );
  }

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await updateProjectDescription(projectId, description);
          setEditing(false);
        } finally {
          setSaving(false);
        }
      }}
    >
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        className="w-full resize-y rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary px-3 py-1 text-xs disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDescription(initialDescription ?? "");
            setEditing(false);
          }}
          className="text-xs text-graph hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
