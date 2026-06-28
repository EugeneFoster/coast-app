"use client";

import { useMemo, useRef, useState } from "react";
import { ModelPreview } from "@/components/model-preview";
import { createProjectAction } from "@/lib/actions/projects";
import { createClient } from "@/lib/supabase/client";

type ClientOption = { id: string; name: string };
type WelderOption = { id: string; full_name: string | null; login: string };

const MAX_COVER = 10 * 1024 * 1024;
const MAX_MODEL = 80 * 1024 * 1024;
const MAX_PDF = 25 * 1024 * 1024;

const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif)$/i;
const MODEL_RE = /\.(glb|gltf)$/i;
const PDF_RE = /\.pdf$/i;

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function ext(name: string) {
  const m = name.match(/\.[a-zA-Z0-9]+$/);
  return m ? m[0].toLowerCase() : "";
}

export function NewProjectForm({
  clients,
  welders,
}: {
  clients: ClientOption[];
  welders: WelderOption[];
}) {
  const supabase = useMemo(() => createClient(), []);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [clientId, setClientId] = useState<string | null>(null);
  const [clientInput, setClientInput] = useState("");
  const [clientOpen, setClientOpen] = useState(false);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [drawingFiles, setDrawingFiles] = useState<File[]>([]);
  const modelUrl = useMemo(
    () => (modelFile ? URL.createObjectURL(modelFile) : null),
    [modelFile],
  );

  const [welderIds, setWelderIds] = useState<Set<string>>(new Set());

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const filteredClients = clientInput.trim()
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(clientInput.trim().toLowerCase()),
      )
    : clients;
  const exactMatch = clients.find(
    (c) => c.name.toLowerCase() === clientInput.trim().toLowerCase(),
  );

  function pickClient(c: ClientOption) {
    setClientId(c.id);
    setClientInput(c.name);
    setClientOpen(false);
  }

  function toggleWelder(id: string) {
    setWelderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function upload(bucket: string, path: string, file: File) {
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });
    if (upErr) throw new Error(`${file.name}: ${upErr.message}`);
    return path;
  }

  function validate(): string | null {
    if (!name.trim()) return "Project name is required.";
    if (coverFile) {
      if (!IMAGE_RE.test(coverFile.name)) return "Cover must be an image file.";
      if (coverFile.size > MAX_COVER) return "Cover image is too large (max 10 MB).";
    }
    if (modelFile) {
      if (!MODEL_RE.test(modelFile.name))
        return "3D model must be a .glb or .gltf file.";
      if (modelFile.size > MAX_MODEL) return "3D model is too large (max 80 MB).";
    }
    for (const f of drawingFiles) {
      if (!PDF_RE.test(f.name)) return `${f.name} is not a PDF.`;
      if (f.size > MAX_PDF) return `${f.name} is too large (max 25 MB).`;
    }
    return null;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      errorRef.current?.scrollIntoView({ block: "center" });
      return;
    }

    setPending(true);
    const projectId = crypto.randomUUID();

    try {
      let coverPath: string | null = null;
      let modelPath: string | null = null;
      const drawings: { path: string; originalName: string }[] = [];

      if (coverFile) {
        coverPath = await upload(
          "project-covers",
          `${projectId}/cover${ext(coverFile.name)}`,
          coverFile,
        );
      }
      if (modelFile) {
        modelPath = await upload(
          "project-models",
          `${projectId}/model${ext(modelFile.name)}`,
          modelFile,
        );
      }
      for (let i = 0; i < drawingFiles.length; i++) {
        const f = drawingFiles[i];
        const path = await upload(
          "project-drawings",
          `${projectId}/${i + 1}-${sanitize(f.name)}`,
          f,
        );
        drawings.push({ path, originalName: f.name });
      }

      const result = await createProjectAction({
        projectId,
        name: name.trim(),
        description: description.trim() || null,
        clientId,
        newClientName: clientId ? null : clientInput.trim() || null,
        coverPath,
        modelPath,
        drawings,
        welderIds: Array.from(welderIds),
      });

      if (result?.error) {
        setError(result.error);
        setPending(false);
      }
      // On success the server action redirects to /projects/[id].
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
      setPending(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-60";
  const labelClass = "block text-sm font-medium text-ink";

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-6">
      {error && (
        <p
          ref={errorRef}
          className="rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld"
        >
          {error}
        </p>
      )}

      <div>
        <label htmlFor="name" className={labelClass}>
          Project name
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={pending}
          placeholder="Dock · Roberts Creek"
          className={inputClass}
        />
      </div>

      {/* Client combobox */}
      <div className="relative">
        <label htmlFor="client" className={labelClass}>
          Client
        </label>
        <input
          id="client"
          value={clientInput}
          onChange={(e) => {
            setClientInput(e.target.value);
            setClientId(null);
            setClientOpen(true);
          }}
          onFocus={() => setClientOpen(true)}
          onBlur={() => setTimeout(() => setClientOpen(false), 150)}
          disabled={pending}
          autoComplete="off"
          placeholder="Search or add a client"
          className={inputClass}
        />
        {clientOpen && (filteredClients.length > 0 || clientInput.trim()) && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-rule bg-paper shadow-lg">
            {filteredClients.map((c) => (
              <button
                type="button"
                key={c.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickClient(c)}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-bone ${
                  clientId === c.id ? "text-weld" : "text-ink"
                }`}
              >
                {c.name}
              </button>
            ))}
            {clientInput.trim() && !exactMatch && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setClientId(null);
                  setClientOpen(false);
                }}
                className="block w-full border-t border-rule px-3 py-2 text-left text-sm text-graph hover:bg-bone"
              >
                Create “{clientInput.trim()}”
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={pending}
          rows={4}
          className={inputClass}
        />
      </div>

      {/* Cover */}
      <div>
        <label htmlFor="cover" className={labelClass}>
          Cover image
        </label>
        <input
          id="cover"
          type="file"
          accept="image/*"
          disabled={pending}
          onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-graph file:mr-3 file:rounded file:border file:border-rule file:bg-bone file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
        {coverFile && (
          <p className="mt-1 text-xs text-graph">{coverFile.name}</p>
        )}
      </div>

      {/* 3D model */}
      <div>
        <label htmlFor="model" className={labelClass}>
          3D model (.glb / .gltf)
        </label>
        <input
          id="model"
          type="file"
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          disabled={pending}
          onChange={(e) => setModelFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-graph file:mr-3 file:rounded file:border file:border-rule file:bg-bone file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
        {modelUrl && (
          <div className="mt-3">
            <ModelPreview src={modelUrl} />
          </div>
        )}
      </div>

      {/* Drawings */}
      <div>
        <label htmlFor="drawings" className={labelClass}>
          Drawings (PDF)
        </label>
        <input
          id="drawings"
          type="file"
          accept="application/pdf"
          multiple
          disabled={pending}
          onChange={(e) => setDrawingFiles(Array.from(e.target.files ?? []))}
          className="mt-1 block w-full text-sm text-graph file:mr-3 file:rounded file:border file:border-rule file:bg-bone file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
        {drawingFiles.length > 0 && (
          <ul className="mt-2 space-y-1">
            {drawingFiles.map((f, i) => (
              <li key={i} className="text-xs text-graph">
                {f.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Team */}
      <div>
        <span className={labelClass}>Assign team</span>
        {welders.length === 0 ? (
          <p className="mt-1 text-sm text-graph">No active welders to assign.</p>
        ) : (
          <div className="mt-2 space-y-1 rounded border border-rule bg-paper p-3">
            {welders.map((w) => (
              <label
                key={w.id}
                className="flex cursor-pointer items-center gap-2 text-sm text-ink"
              >
                <input
                  type="checkbox"
                  checked={welderIds.has(w.id)}
                  onChange={() => toggleWelder(w.id)}
                  disabled={pending}
                  className="accent-weld"
                />
                {w.full_name ?? w.login}
              </label>
            ))}
          </div>
        )}
        {welderIds.size === 0 && (
          <p className="mt-2 text-xs text-graph">
            No welders assigned — only owners and draftspeople will see this
            project.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-weld px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
