"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addPinComment, createPin, deletePin, setPinStatus } from "@/lib/actions/pins";
import type { DrawingPin } from "@/lib/types";

export type DrawingPage = { pageNo: number; width: number; height: number };
export type DrawingFile = {
  id: string;
  name: string;
  status: string | null;
  version: number;
  pageCount: number | null;
  pages: DrawingPage[];
  pdfUrl: string | null;
  pins: DrawingPin[];
};

type Bbox = { x: number; y: number; w: number; h: number };

function tileBase(file: DrawingFile, pageNo: number) {
  return `/api/tiles/${file.id}/${file.version}/${pageNo}`;
}

export function DrawingsViewer({
  files,
  projectId,
  canAnnotate,
  currentUserId,
}: {
  files: DrawingFile[];
  projectId: string;
  canAnnotate: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [activeId, setActiveId] = useState(files[0]?.id ?? null);
  const active = files.find((f) => f.id === activeId) ?? files[0] ?? null;

  // Realtime: flip from "processing" to the viewer when tiling finishes, and
  // refresh when pins/comments change so the team sees updates live.
  useEffect(() => {
    const channel = supabase
      .channel("drawings-collab")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drawings" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drawing_pins" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pin_comments" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, router]);

  if (!active) {
    return <p className="text-sm text-graph">No drawings uploaded.</p>;
  }

  return (
    <div>
      {files.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {files.map((f) => {
            const open = f.pins.filter((p) => p.status === "open").length;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveId(f.id)}
                className={`flex items-center gap-2 rounded border px-3 py-1.5 text-sm transition-colors ${
                  f.id === active.id
                    ? "border-weld text-weld"
                    : "border-rule text-graph hover:text-ink"
                }`}
              >
                {f.name}
                {open > 0 && (
                  <span className="rounded-full bg-weld px-1.5 text-[0.65rem] font-medium text-paper">
                    {open}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <SheetViewer
        key={active.id}
        file={active}
        projectId={projectId}
        canAnnotate={canAnnotate}
        currentUserId={currentUserId}
      />
    </div>
  );
}

function SheetViewer({
  file,
  projectId,
  canAnnotate,
  currentUserId,
}: {
  file: DrawingFile;
  projectId: string;
  canAnnotate: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const ready = file.status === "ready" && file.pages.length > 0;
  const failed = file.status === "failed";

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osdRef = useRef<any>(null);

  const [pageIdx, setPageIdx] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const [askMode, setAskMode] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ dataUrl: string; bbox: Bbox } | null>(
    null,
  );

  const page = file.pages[pageIdx];

  const pagePins = useMemo(
    () =>
      file.pins.filter(
        (p) => p.pageNo === page?.pageNo && p.version === file.version,
      ),
    [file.pins, file.version, page?.pageNo],
  );

  // Render pins as zoom/pan-anchored OpenSeadragon overlays for the current page.
  const renderPins = useCallback(() => {
    const viewer = viewerRef.current;
    const OSD = osdRef.current;
    if (!viewer || !OSD || !viewer.isOpen() || !page) return;
    viewer.clearOverlays();
    pagePins.forEach((pin, idx) => {
      const el = document.createElement("div");
      el.className =
        "osd-pin" +
        (pin.id === selectedPinId ? " osd-pin--active" : "") +
        (pin.status === "resolved" ? " osd-pin--resolved" : "");
      const badge = document.createElement("span");
      badge.className = "osd-pin__badge";
      badge.textContent = String(idx + 1);
      badge.addEventListener("pointerdown", (e) => e.stopPropagation());
      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelectedPinId(pin.id);
      });
      el.appendChild(badge);
      const rect = viewer.viewport.imageToViewportRectangle(
        new OSD.Rect(
          pin.bbox.x * page.width,
          pin.bbox.y * page.height,
          pin.bbox.w * page.width,
          pin.bbox.h * page.height,
        ),
      );
      viewer.addOverlay({ element: el, location: rect });
    });
  }, [pagePins, page, selectedPinId]);

  const renderPinsRef = useRef(renderPins);
  useEffect(() => {
    renderPinsRef.current = renderPins;
    if (viewerRef.current?.isOpen?.()) renderPins();
  }, [renderPins]);

  // Initialize / swap OpenSeadragon for the current page.
  useEffect(() => {
    if (!ready || !containerRef.current || !page) return;
    let disposed = false;

    (async () => {
      const OpenSeadragon = (await import("openseadragon")).default;
      if (disposed || !containerRef.current) return;
      osdRef.current = OpenSeadragon;

      if (!viewerRef.current) {
        viewerRef.current = OpenSeadragon({
          element: containerRef.current,
          showNavigationControl: false,
          showNavigator: false,
          visibilityRatio: 1,
          constrainDuringPan: true,
          minZoomImageRatio: 0.8,
          maxZoomPixelRatio: 4,
          gestureSettingsTouch: {
            pinchToZoom: true,
            flickEnabled: true,
          },
        });
        viewerRef.current.addHandler("zoom", () => {
          const vp = viewerRef.current?.viewport;
          if (!vp) return;
          const home = vp.getHomeZoom() || 1;
          setZoomPct(Math.round((vp.getZoom() / home) * 100));
        });
        viewerRef.current.addHandler("open", () => renderPinsRef.current());
      }

      viewerRef.current.open(`${tileBase(file, page.pageNo)}/page.dzi`);
    })();

    return () => {
      disposed = true;
    };
  }, [ready, file, page]);

  // Destroy the viewer on unmount.
  useEffect(() => {
    return () => {
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
    };
  }, []);

  function zoomBy(factor: number) {
    const vp = viewerRef.current?.viewport;
    if (!vp) return;
    vp.zoomBy(factor);
    vp.applyConstraints();
  }

  function fit() {
    viewerRef.current?.viewport?.goHome();
  }

  // Ask: draw a rectangle, convert to normalized image bbox, crop the preview.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (!askMode) return;
    const el = overlayRef.current!;
    const b = el.getBoundingClientRect();
    drag.current = { x: e.clientX - b.left, y: e.clientY - b.top };
    setRect({ x: drag.current.x, y: drag.current.y, w: 0, h: 0 });
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!askMode || !drag.current) return;
    const b = overlayRef.current!.getBoundingClientRect();
    const cx = e.clientX - b.left;
    const cy = e.clientY - b.top;
    setRect({
      x: Math.min(drag.current.x, cx),
      y: Math.min(drag.current.y, cy),
      w: Math.abs(cx - drag.current.x),
      h: Math.abs(cy - drag.current.y),
    });
  }

  async function onPointerUp() {
    if (!askMode || !drag.current || !rect || rect.w < 8 || rect.h < 8) {
      drag.current = null;
      setRect(null);
      return;
    }
    drag.current = null;

    const viewer = viewerRef.current;
    const OSD = osdRef.current;
    if (!viewer || !OSD || !page) return;

    const tl = viewer.viewport.pointFromPixel(new OSD.Point(rect.x, rect.y));
    const br = viewer.viewport.pointFromPixel(
      new OSD.Point(rect.x + rect.w, rect.y + rect.h),
    );
    const itl = viewer.viewport.viewportToImageCoordinates(tl);
    const ibr = viewer.viewport.viewportToImageCoordinates(br);

    const nx = Math.max(0, Math.min(1, itl.x / page.width));
    const ny = Math.max(0, Math.min(1, itl.y / page.height));
    const nw = Math.max(0, Math.min(1, (ibr.x - itl.x) / page.width));
    const nh = Math.max(0, Math.min(1, (ibr.y - itl.y) / page.height));
    const bbox: Bbox = { x: nx, y: ny, w: nw, h: nh };

    const dataUrl = await cropPreview(
      `${tileBase(file, page.pageNo)}/preview.webp`,
      bbox,
    );
    setDraft({ dataUrl, bbox });
    setRect(null);
    setAskMode(false);
    viewerRef.current?.setMouseNavEnabled(true);
  }

  if (failed) {
    return (
      <div className="rounded border border-weld/40 bg-weld/10 px-4 py-6 text-sm text-weld">
        Sheet processing failed. Re-upload to try again.
        {file.pdfUrl && (
          <a
            href={file.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-2 underline"
          >
            Open original PDF
          </a>
        )}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center rounded border border-dashed border-rule py-16 text-center">
        <p className="font-display text-lg text-ink">Preparing sheets…</p>
        <p className="mt-2 max-w-sm text-sm text-graph">
          The drawing is being tiled for deep zoom. This view updates
          automatically when it&apos;s ready.
        </p>
        {file.pdfUrl && (
          <a
            href={file.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 text-xs text-graph underline hover:text-weld"
          >
            Open original PDF ↗
          </a>
        )}
      </div>
    );
  }

  const selectedPin = pagePins.find((p) => p.id === selectedPinId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
          <div className="flex items-center gap-3">
            <span className="truncate text-sm text-ink">{file.name}</span>
            <span className="font-mono text-xs text-graph">
              Sheet {pageIdx + 1} / {file.pages.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => zoomBy(0.8)}
              className="rounded border border-rule px-2.5 py-1 text-sm text-ink hover:border-weld"
            >
              −
            </button>
            <span className="w-12 text-center font-mono text-xs text-graph">
              {zoomPct}%
            </span>
            <button
              type="button"
              onClick={() => zoomBy(1.25)}
              className="rounded border border-rule px-2.5 py-1 text-sm text-ink hover:border-weld"
            >
              +
            </button>
            <button
              type="button"
              onClick={fit}
              className="rounded border border-rule px-3 py-1 text-sm text-ink hover:border-weld"
            >
              Fit
            </button>
            {canAnnotate && (
              <button
                type="button"
                onClick={() => {
                  const next = !askMode;
                  setAskMode(next);
                  setRect(null);
                  viewerRef.current?.setMouseNavEnabled(!next);
                }}
                title="Select a region to pin a question or note"
                className={`rounded border px-3 py-1 text-sm transition-colors ${
                  askMode
                    ? "border-weld bg-weld text-paper"
                    : "border-rule text-ink hover:border-weld"
                }`}
              >
                {askMode ? "Cancel" : "Pin a note"}
              </button>
            )}
          </div>
        </div>

        {askMode && (
          <p className="mt-3 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-xs text-weld">
            Drag a rectangle over the area you want to ask about.
          </p>
        )}

        {/* Canvas + selection overlay */}
        <div className="relative mt-4">
          <div
            ref={containerRef}
            className="h-[70vh] w-full rounded border border-rule bg-ink/[0.03] dark:bg-paper/[0.04]"
          />
          <div
            ref={overlayRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute inset-0"
            style={{
              cursor: askMode ? "crosshair" : "default",
              pointerEvents: askMode ? "auto" : "none",
            }}
          >
            {rect && (
              <div
                className="absolute border-2 border-weld bg-weld/10"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                }}
              />
            )}
          </div>
        </div>

        {/* Sheet rail */}
        {file.pages.length > 1 && (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {file.pages.map((p, i) => {
              const open = file.pins.filter(
                (pin) =>
                  pin.pageNo === p.pageNo &&
                  pin.version === file.version &&
                  pin.status === "open",
              ).length;
              return (
                <button
                  key={p.pageNo}
                  type="button"
                  onClick={() => {
                    setPageIdx(i);
                    setSelectedPinId(null);
                  }}
                  className={`relative shrink-0 overflow-hidden rounded border ${
                    i === pageIdx ? "border-weld" : "border-rule"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${tileBase(file, p.pageNo)}/thumb.webp`}
                    alt={`Sheet ${i + 1}`}
                    className="h-24 w-auto"
                  />
                  {open > 0 && (
                    <span className="absolute right-1 top-1 rounded-full bg-weld px-1.5 text-[0.6rem] font-medium text-paper">
                      {open}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Discussion rail */}
      <PinPanel
        projectId={projectId}
        file={file}
        page={page}
        pins={pagePins}
        selectedPin={selectedPin}
        onSelect={setSelectedPinId}
        canAnnotate={canAnnotate}
        currentUserId={currentUserId}
        draft={draft}
        onClearDraft={() => setDraft(null)}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

function PinPanel({
  projectId,
  file,
  page,
  pins,
  selectedPin,
  onSelect,
  canAnnotate,
  currentUserId,
  draft,
  onClearDraft,
  onChanged,
}: {
  projectId: string;
  file: DrawingFile;
  page: DrawingPage | undefined;
  pins: DrawingPin[];
  selectedPin: DrawingPin | null;
  onSelect: (id: string | null) => void;
  canAnnotate: boolean;
  currentUserId: string;
  draft: { dataUrl: string; bbox: Bbox } | null;
  onClearDraft: () => void;
  onChanged: () => void;
}) {
  const [body, setBody] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitPin() {
    if (!draft || !page) return;
    const text = body.trim();
    if (!text) {
      setError("Please describe your question or note.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createPin({
      projectId,
      drawingId: file.id,
      version: file.version,
      pageNo: page.pageNo,
      bbox: draft.bbox,
      body: text,
    });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setBody("");
    onClearDraft();
    onSelect(result.id);
    onChanged();
  }

  async function submitComment() {
    if (!selectedPin) return;
    const text = comment.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    const result = await addPinComment(selectedPin.id, text);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setComment("");
    onChanged();
  }

  async function toggleStatus() {
    if (!selectedPin) return;
    setBusy(true);
    setError(null);
    const result = await setPinStatus(
      selectedPin.id,
      selectedPin.status === "open" ? "resolved" : "open",
    );
    setBusy(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  async function removePin() {
    if (!selectedPin) return;
    setBusy(true);
    setError(null);
    const result = await deletePin(selectedPin.id);
    setBusy(false);
    if (result.error) setError(result.error);
    else {
      onSelect(null);
      onChanged();
    }
  }

  return (
    <aside className="flex flex-col rounded border border-rule bg-paper">
      <div className="border-b border-rule px-4 py-3">
        <h3 className="font-display text-sm font-medium text-ink">
          Sheet discussion
        </h3>
        <p className="mt-0.5 text-xs text-graph">
          {pins.length === 0
            ? "No notes on this sheet yet."
            : `${pins.filter((p) => p.status === "open").length} open · ${pins.length} total`}
        </p>
      </div>

      {error && (
        <p className="mx-4 mt-3 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-xs text-weld">
          {error}
        </p>
      )}

      {/* New pin composer (after a region is selected) */}
      {draft && (
        <div className="border-b border-rule p-4">
          <p className="text-xs font-medium text-ink">New note</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.dataUrl}
            alt="Selected region"
            className="mt-2 max-h-28 w-auto rounded border border-rule"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            autoFocus
            placeholder="What needs clarifying here?"
            className="mt-2 w-full rounded border border-rule bg-bone px-2 py-1.5 text-sm text-ink focus:border-weld focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={submitPin}
              disabled={busy}
              className="rounded bg-weld px-3 py-1.5 text-xs font-medium text-paper disabled:opacity-60"
            >
              {busy ? "Saving…" : "Add note"}
            </button>
            <button
              type="button"
              onClick={() => {
                onClearDraft();
                setBody("");
                setError(null);
              }}
              className="rounded border border-rule px-3 py-1.5 text-xs text-graph hover:text-ink"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Selected pin thread */}
      {selectedPin ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-rule p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide ${
                    selectedPin.status === "open"
                      ? "border-weld text-weld"
                      : "border-graph text-graph"
                  }`}
                >
                  {selectedPin.status}
                </span>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
                  {selectedPin.body}
                </p>
                <p className="mt-1 text-xs text-graph">
                  {selectedPin.author} ·{" "}
                  {new Date(selectedPin.createdAt).toLocaleDateString("en-CA")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="text-xs text-graph hover:text-ink"
                aria-label="Close thread"
              >
                ✕
              </button>
            </div>

            {canAnnotate && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={toggleStatus}
                  disabled={busy}
                  className="rounded border border-rule px-3 py-1 text-xs text-ink hover:border-weld disabled:opacity-60"
                >
                  {selectedPin.status === "open" ? "Mark resolved" : "Reopen"}
                </button>
                {selectedPin.authorId === currentUserId && (
                  <button
                    type="button"
                    onClick={removePin}
                    disabled={busy}
                    className="rounded border border-rule px-3 py-1 text-xs text-weld hover:border-weld disabled:opacity-60"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {selectedPin.comments.length === 0 && (
              <p className="text-xs text-graph">No replies yet.</p>
            )}
            {selectedPin.comments.map((c) => (
              <div key={c.id} className="rounded border border-rule/60 p-2">
                <p className="whitespace-pre-wrap text-sm text-ink">{c.body}</p>
                <p className="mt-1 text-[0.65rem] text-graph">
                  {c.author} ·{" "}
                  {new Date(c.createdAt).toLocaleDateString("en-CA")}
                </p>
              </div>
            ))}
          </div>

          {canAnnotate && (
            <div className="border-t border-rule p-3">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="Reply…"
                className="w-full rounded border border-rule bg-bone px-2 py-1.5 text-sm text-ink focus:border-weld focus:outline-none"
              />
              <button
                type="button"
                onClick={submitComment}
                disabled={busy}
                className="mt-2 rounded border border-rule px-3 py-1.5 text-xs text-ink hover:border-weld disabled:opacity-60"
              >
                Reply
              </button>
            </div>
          )}
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-rule/60 overflow-y-auto">
          {pins.map((pin, idx) => (
            <li key={pin.id}>
              <button
                type="button"
                onClick={() => onSelect(pin.id)}
                className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-bone"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[0.6rem] text-paper ${
                    pin.status === "open" ? "bg-weld" : "bg-graph"
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 block text-sm text-ink">
                    {pin.body}
                  </span>
                  <span className="text-xs text-graph">
                    {pin.author}
                    {pin.comments.length > 0 && ` · ${pin.comments.length} ↩`}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {pins.length === 0 && !draft && (
            <li className="px-4 py-6 text-center text-xs text-graph">
              {canAnnotate
                ? 'Use "Pin a note" to ask about a region of this sheet.'
                : "Nothing to discuss on this sheet yet."}
            </li>
          )}
        </ul>
      )}
    </aside>
  );
}

async function cropPreview(src: string, bbox: Bbox): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const sx = bbox.x * img.naturalWidth;
      const sy = bbox.y * img.naturalHeight;
      const sw = Math.max(1, bbox.w * img.naturalWidth);
      const sh = Math.max(1, bbox.h * img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas ctx"));
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("preview load failed"));
    img.src = src;
  });
}
