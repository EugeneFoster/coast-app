"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ModelPreview } from "@/components/model-preview";

export type ProjectModelView = {
  id: string;
  name: string;
  url: string;
  source: "upload" | "onshape";
  isPrimary: boolean;
  fileSizeBytes: number | null;
  sourceUrl: string | null;
  elementType: "PARTSTUDIO" | "ASSEMBLY" | null;
  resolution: "COARSE" | "MEDIUM" | "FINE" | null;
  importedAt: string;
};

type OnshapeElement = {
  id: string;
  name: string;
  elementType: "PARTSTUDIO" | "ASSEMBLY";
};

type Inspection = {
  elements: OnshapeElement[];
  selectedElementId: string;
};

function fileSize(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

function modelKind(model: ProjectModelView) {
  if (model.source === "upload") return "Uploaded file";
  return model.elementType === "ASSEMBLY" ? "Onshape Assembly" : "Onshape Part Studio";
}

async function readJson(response: Response) {
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "Request failed.");
  }
  return result;
}

export function ProjectModelsPanel({
  projectId,
  models,
  canManage,
  onshapeConfigured,
}: {
  projectId: string;
  models: ProjectModelView[];
  canManage: boolean;
  onshapeConfigured: boolean;
}) {
  const router = useRouter();
  const defaultModel = models.find((model) => model.isPrimary) ?? models[0] ?? null;
  const [selectedId, setSelectedId] = useState(defaultModel?.id ?? null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [elementId, setElementId] = useState("");
  const [modelName, setModelName] = useState("");
  const [resolution, setResolution] = useState("FINE");
  const [busy, setBusy] = useState<"inspect" | "import" | "primary" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selected = useMemo(
    () => models.find((model) => model.id === selectedId) ?? defaultModel,
    [defaultModel, models, selectedId],
  );
  const selectedElement = inspection?.elements.find((element) => element.id === elementId);

  async function inspect() {
    setBusy("inspect");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/onshape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "inspect", sourceUrl }),
      });
      const result = await readJson(response);
      const nextInspection = result as unknown as Inspection;
      setInspection(nextInspection);
      setElementId(nextInspection.selectedElementId);
      const element = nextInspection.elements.find(
        (candidate) => candidate.id === nextInspection.selectedElementId,
      );
      setModelName(element?.name ?? "");
    } catch (caught) {
      setInspection(null);
      setError(caught instanceof Error ? caught.message : "Could not read the Onshape document.");
    } finally {
      setBusy(null);
    }
  }

  async function importModel() {
    if (!selectedElement) return;
    setBusy("import");
    setError(null);
    setMessage("Onshape is preparing the model. Large assemblies can take one or two minutes…");
    try {
      const response = await fetch(`/api/projects/${projectId}/onshape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "import",
          sourceUrl,
          elementId,
          name: modelName,
          resolution,
        }),
      });
      const result = await readJson(response);
      if (typeof result.modelId === "string") setSelectedId(result.modelId);
      setMessage(`“${String(result.name)}” was imported and made the primary model.`);
      router.refresh();
    } catch (caught) {
      setMessage(null);
      setError(caught instanceof Error ? caught.message : "Could not import the Onshape model.");
    } finally {
      setBusy(null);
    }
  }

  async function makePrimary(model: ProjectModelView) {
    setBusy("primary");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/onshape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "set-primary", modelId: model.id }),
      });
      await readJson(response);
      setMessage(`“${model.name}” is now the primary model.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the primary model.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-ink">3D models</h2>
          <p className="mt-1 text-sm text-graph">
            Project-ready GLB models with Onshape source traceability and version history.
          </p>
        </div>
        {selected && (
          <a
            href={selected.url}
            download
            className="rounded border border-rule px-3 py-2 text-xs text-graph transition-colors hover:border-weld hover:text-weld"
          >
            Download GLB
          </a>
        )}
      </div>

      {models.length > 0 ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>{selected && <ModelPreview src={selected.url} />}</div>
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => setSelectedId(model.id)}
                className={`w-full rounded border p-3 text-left transition-colors ${
                  selected?.id === model.id
                    ? "border-weld bg-weld/5"
                    : "border-rule hover:border-graph/60"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{model.name}</span>
                  {model.isPrimary && (
                    <span className="rounded-full bg-weld px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-paper">
                      Primary
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs text-graph">
                  {modelKind(model)}
                  {fileSize(model.fileSizeBytes) ? ` · ${fileSize(model.fileSizeBytes)}` : ""}
                </span>
                <span className="mt-1 block font-mono text-[0.65rem] text-graph">
                  {new Date(model.importedAt).toLocaleString("en-CA", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded border border-dashed border-rule px-5 py-8 text-center text-sm text-graph">
          No 3D model has been attached to this project yet.
        </div>
      )}

      {selected && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          {selected.sourceUrl && (
            <a
              href={selected.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-weld hover:underline"
            >
              Open source in Onshape ↗
            </a>
          )}
          {selected.resolution && <span className="text-graph">Quality: {selected.resolution}</span>}
          {canManage && !selected.isPrimary && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => makePrimary(selected)}
              className="text-ink underline decoration-rule underline-offset-4 hover:decoration-weld disabled:opacity-50"
            >
              Make primary
            </button>
          )}
        </div>
      )}

      {canManage && (
        <div className="mt-6 rounded-xl border border-rule bg-ink/[0.02] p-5 dark:bg-paper/[0.03]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-base font-medium text-ink">Import from Onshape</h3>
              <p className="mt-1 text-xs leading-5 text-graph">
                Paste a document URL. COAST reads its tabs and exports a private GLB copy without changing the Onshape document.
              </p>
            </div>
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${onshapeConfigured ? "bg-emerald-500" : "bg-amber-500"}`} />
          </div>

          {!onshapeConfigured ? (
            <p className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-ink">
              Connection is ready for credentials. Add <span className="font-mono text-xs">ONSHAPE_ACCESS_KEY</span> and <span className="font-mono text-xs">ONSHAPE_SECRET_KEY</span> to Railway, then redeploy.
            </p>
          ) : (
            <>
              <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-graph">
                Onshape document URL
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(event) => {
                      setSourceUrl(event.target.value);
                      setInspection(null);
                    }}
                    placeholder="https://cad.onshape.com/documents/…/w/…/e/…"
                    className="min-w-0 flex-1 rounded border border-rule bg-paper px-3 py-2 text-sm normal-case tracking-normal text-ink outline-none focus:border-weld"
                  />
                  <button
                    type="button"
                    disabled={!sourceUrl.trim() || busy !== null}
                    onClick={inspect}
                    className="btn-secondary whitespace-nowrap px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {busy === "inspect" ? "Reading…" : "Read document"}
                  </button>
                </div>
              </label>

              {inspection && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-graph">
                    Model tab
                    <select
                      value={elementId}
                      onChange={(event) => {
                        const value = event.target.value;
                        setElementId(value);
                        const element = inspection.elements.find((candidate) => candidate.id === value);
                        if (element) setModelName(element.name);
                      }}
                      className="mt-2 w-full rounded border border-rule bg-paper px-3 py-2 text-sm normal-case tracking-normal text-ink"
                    >
                      {inspection.elements.map((element) => (
                        <option key={element.id} value={element.id}>
                          {element.name} · {element.elementType === "ASSEMBLY" ? "Assembly" : "Part Studio"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium uppercase tracking-wide text-graph">
                    Display quality
                    <select
                      value={resolution}
                      onChange={(event) => setResolution(event.target.value)}
                      className="mt-2 w-full rounded border border-rule bg-paper px-3 py-2 text-sm normal-case tracking-normal text-ink"
                    >
                      <option value="MEDIUM">Medium · fastest</option>
                      <option value="FINE">Fine · recommended</option>
                      <option value="COARSE">Coarse · preview</option>
                    </select>
                  </label>
                  <label className="text-xs font-medium uppercase tracking-wide text-graph md:col-span-2">
                    Name in COAST
                    <input
                      value={modelName}
                      maxLength={160}
                      onChange={(event) => setModelName(event.target.value)}
                      className="mt-2 w-full rounded border border-rule bg-paper px-3 py-2 text-sm normal-case tracking-normal text-ink outline-none focus:border-weld"
                    />
                  </label>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      disabled={!selectedElement || !modelName.trim() || busy !== null}
                      onClick={importModel}
                      className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
                    >
                      {busy === "import" ? "Exporting from Onshape…" : "Import model"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <p className="mt-4 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
              {error}
            </p>
          )}
          {message && (
            <p className="mt-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-ink">
              {message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
