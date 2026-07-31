"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  addProjectDrawings,
  deleteProjectDrawing,
  retryDrawingTiling,
  uploadDrawingRevision,
} from "@/lib/actions/projects";
import type { DrawingFile } from "@/components/drawings-viewer";
import { tilingHintLabel } from "@/lib/drawing-status";

const MAX_PDF = 25 * 1024 * 1024;
const PDF_RE = /\.pdf$/i;

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function ProjectDrawingsManager({
  projectId,
  drawings,
}: {
  projectId: string;
  drawings: DrawingFile[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const revisionRef = useRef<HTMLInputElement>(null);
  const [revisionTargetId, setRevisionTargetId] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workerWarning, setWorkerWarning] = useState<string | null>(null);

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);

    try {
      const toInsert: { path: string; originalName: string }[] = [];

      for (const file of Array.from(files)) {
        if (!PDF_RE.test(file.name)) {
          throw new Error(`${file.name} is not a PDF.`);
        }
        if (file.size > MAX_PDF) {
          throw new Error(`${file.name} is too large (max 25 MB).`);
        }

        const path = `${projectId}/${crypto.randomUUID()}-${sanitize(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from("project-drawings")
          .upload(path, file, { contentType: "application/pdf" });
        if (upErr) throw new Error(upErr.message);

        toInsert.push({ path, originalName: file.name });
      }

      const result = await addProjectDrawings(projectId, toInsert);
      if (result.error) throw new Error(result.error);

      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function onRetry(drawingId: string) {
    setError(null);
    setWorkerWarning(null);
    setRetryingId(drawingId);
    try {
      const result = await retryDrawingTiling(projectId, drawingId);
      if (result.error) throw new Error(result.error);
      if (result.queued === false) {
        setWorkerWarning(
          "Tiling worker is not configured (REDIS_URL). Deep zoom will be unavailable until the worker is running.",
        );
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Retry failed.");
    } finally {
      setRetryingId(null);
    }
  }

  async function onRevisionFile(files: FileList | null) {
    if (!files?.[0] || !revisionTargetId) return;
    const file = files[0];
    setError(null);
    setRevisingId(revisionTargetId);

    try {
      if (!PDF_RE.test(file.name)) throw new Error("Revision must be a PDF.");
      if (file.size > MAX_PDF) throw new Error("File is too large (max 25 MB).");

      const path = `${projectId}/${crypto.randomUUID()}-${sanitize(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("project-drawings")
        .upload(path, file, { contentType: "application/pdf" });
      if (upErr) throw new Error(upErr.message);

      const result = await uploadDrawingRevision(
        projectId,
        revisionTargetId,
        path,
        file.name,
      );
      if (result.error) throw new Error(result.error);

      if (result.copied && result.copied > 0) {
        setWorkerWarning(
          `Revision uploaded — ${result.copied} open markup(s) carried forward (needs review).`,
        );
      }

      if (revisionRef.current) revisionRef.current.value = "";
      setRevisionTargetId(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Revision upload failed.");
    } finally {
      setRevisingId(null);
    }
  }

  async function onDelete(drawingId: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError(null);
    setDeletingId(drawingId);
    try {
      const result = await deleteProjectDrawing(projectId, drawingId);
      if (result.error) throw new Error(result.error);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  const statusLabel = (d: DrawingFile) => {
    if (d.status === "ready") return "Ready";
    if (d.status === "failed") return "Failed";
    if (d.tilingHint) return tilingHintLabel(d.tilingHint);
    if (d.pdfOnly) return "Worker not configured";
    return "Processing";
  };

  return (
    <div className="mb-6 rounded-xl border border-rule bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-sm font-medium text-ink">Drawings</h3>
        <div>
          <input
            ref={revisionRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => onRevisionFile(e.target.files)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => onUpload(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="btn-primary px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Add drawings"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
          {error}
        </p>
      )}

      {workerWarning && (
        <p className="mt-3 rounded border border-rule bg-bone px-3 py-2 text-sm text-graph">
          {workerWarning}
        </p>
      )}

      {drawings.length > 0 ? (
        <ul className="mt-4 divide-y divide-rule">
          {drawings.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{d.name}</p>
                <p className="font-mono text-xs text-graph">
                  {statusLabel(d)}
                  {d.pageCount != null ? ` · ${d.pageCount} sheets` : ""}
                  {d.version > 1 ? ` · rev ${d.version}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {d.status === "ready" && (
                  <button
                    type="button"
                    disabled={revisingId === d.id}
                    onClick={() => {
                      setRevisionTargetId(d.id);
                      revisionRef.current?.click();
                    }}
                    className="text-xs text-graph hover:text-ink disabled:opacity-50"
                  >
                    {revisingId === d.id ? "Uploading…" : "New revision"}
                  </button>
                )}
                {(d.status === "processing" || d.status === "failed") && !d.pdfOnly && (
                  <button
                    type="button"
                    disabled={retryingId === d.id}
                    onClick={() => onRetry(d.id)}
                    className="text-xs text-graph hover:text-ink disabled:opacity-50"
                  >
                    {retryingId === d.id ? "Retrying…" : "Retry"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={deletingId === d.id}
                  onClick={() => onDelete(d.id, d.name)}
                  className="text-xs text-graph hover:text-weld disabled:opacity-50"
                >
                  {deletingId === d.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-graph">
          No drawings yet — upload PDFs to get started.
        </p>
      )}
    </div>
  );
}
