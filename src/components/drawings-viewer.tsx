"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MarkupWithThread } from "@/lib/types";
import { MARKUP_STATUS } from "@/lib/markup-status";
import {
  bboxFromPath,
  distToPath,
  normBboxToScreenRect,
  normToViewportPixel,
  screenPointToNorm,
  screenRectToNormBbox,
  type NormBbox,
  type NormPoint,
} from "@/lib/markup-coords";
import {
  HIGHLIGHTER_OPACITY,
  INK_COLORS,
  inkStrokeImageWidth,
  type InkWidth,
} from "@/lib/ink-palette";
import { useDrawingMarkups } from "@/components/drawing-markups/use-drawing-markups";
import { MarkupComposePopover } from "@/components/drawing-markups/markup-compose-popover";
import { MarkupThreadPanel } from "@/components/drawing-markups/markup-thread-panel";
import { MarkupsListPanel } from "@/components/drawing-markups/markups-list-panel";
import { InkOverlay } from "@/components/drawing-markups/ink-overlay";
import { InkPalette } from "@/components/drawing-markups/ink-palette";
import { SheetProcessingPlaceholder } from "@/components/drawing-markups/sheet-processing-placeholder";
import {
  registerMarkupPhoto,
  requestMarkupPhotoUpload,
} from "@/lib/actions/markups";
import { enqueueMarkupOp } from "@/lib/offline/markup-queue";
import type { MarkupStatus } from "@/lib/types";

export type DrawingPage = { pageNo: number; width: number; height: number };
export type DrawingFile = {
  id: string;
  name: string;
  status: string | null;
  version: number;
  pageCount: number | null;
  pages: DrawingPage[];
  pdfOnly?: boolean;
};

type Tool = "nav" | "pin" | "area" | "pen" | "highlighter" | "eraser" | "photo";
type PendingPlacement =
  | { kind: "pin"; x: number; y: number }
  | { kind: "area"; x: number; y: number; w: number; h: number };

const TOOLS: { id: Tool; label: string }[] = [
  { id: "nav", label: "Pan" },
  { id: "pin", label: "Pin" },
  { id: "area", label: "Area" },
  { id: "pen", label: "Pen" },
  { id: "highlighter", label: "Hi" },
  { id: "photo", label: "Photo" },
  { id: "eraser", label: "Eraser" },
];

function tileBase(file: DrawingFile, pageNo: number) {
  return `/api/tiles/${file.id}/${file.version}/${pageNo}`;
}

function kindIcon(kind: string) {
  if (kind === "pin") return "●";
  if (kind === "area") return "▢";
  if (kind === "ink") return "✎";
  return "·";
}

export function DrawingsViewer({
  files,
  projectId,
  isAdminUser,
  initialMarkupsByDrawing,
}: {
  files: DrawingFile[];
  projectId: string;
  isAdminUser: boolean;
  initialMarkupsByDrawing: Record<string, MarkupWithThread[]>;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [activeId, setActiveId] = useState(files[0]?.id ?? null);
  const active = files.find((f) => f.id === activeId) ?? files[0] ?? null;

  useEffect(() => {
    const channel = supabase
      .channel("drawings-status")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drawings" },
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
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveId(f.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                f.id === active.id
                  ? "border-weld text-weld"
                  : "border-rule text-graph hover:text-ink"
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      <SheetViewer
        key={`${active.id}-v${active.version}`}
        file={active}
        projectId={projectId}
        isAdminUser={isAdminUser}
        initialMarkups={initialMarkupsByDrawing[active.id] ?? []}
      />
    </div>
  );
}

function SheetViewer({
  file,
  projectId,
  isAdminUser,
  initialMarkups,
}: {
  file: DrawingFile;
  projectId: string;
  isAdminUser: boolean;
  initialMarkups: MarkupWithThread[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const ready = file.status === "ready" && file.pages.length > 0;
  const failed = file.status === "failed";
  const processing = file.status === "processing" && !file.pdfOnly;

  useEffect(() => {
    if (!processing) return;
    const id = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(id);
  }, [processing, router]);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const markupsLayerRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osdRef = useRef<any>(null);

  const [pageIdx, setPageIdx] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const [tool, setTool] = useState<Tool>("nav");
  const [inkColor, setInkColor] = useState<string>(INK_COLORS[0]);
  const [inkWidth, setInkWidth] = useState<InkWidth>(4);
  const [draftRect, setDraftRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [draftInk, setDraftInk] = useState<NormPoint[] | null>(null);
  const [pending, setPending] = useState<PendingPlacement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<MarkupStatus | "all">("all");
  const [filterPage, setFilterPage] = useState<number | "all">("all");
  const [showCarriedOnly, setShowCarriedOnly] = useState(false);
  const [, setOverlayTick] = useState(0);

  const page = file.pages[pageIdx];
  const drag = useRef<{ x: number; y: number } | null>(null);
  const inkDrawing = useRef(false);

  const {
    markups,
    pendingIds,
    online,
    createMarkup,
    createInk,
    deleteInk,
    addComment,
    setStatus,
  } = useDrawingMarkups({
    drawingId: file.id,
    version: file.version,
    projectId,
    initial: initialMarkups,
  });

  const visibleMarkups = useMemo(
    () =>
      showCarriedOnly
        ? markups.filter((m) => m.carried_from_id != null)
        : markups,
    [markups, showCarriedOnly],
  );

  const pageMarkups = visibleMarkups.filter((m) => m.page_no === page?.pageNo);
  const pinAreaMarkups = pageMarkups.filter((m) => m.kind !== "ink");

  const repositionMarkups = useCallback(() => {
    const viewer = viewerRef.current;
    const OSD = osdRef.current;
    const layer = markupsLayerRef.current;
    if (!viewer || !OSD || !layer || !page) return;

    layer.querySelectorAll<HTMLElement>("[data-markup-id]").forEach((el) => {
      const id = el.dataset.markupId!;
      const m = pinAreaMarkups.find((mk) => mk.id === id);
      if (!m) return;
      const s = MARKUP_STATUS[m.status];

      if (m.kind === "pin") {
        const pt = normToViewportPixel(m.x, m.y, viewer, OSD, page.width, page.height);
        el.style.left = `${pt.x - 8}px`;
        el.style.top = `${pt.y - 8}px`;
        el.style.width = "16px";
        el.style.height = "16px";
        el.style.borderColor = s.border;
        el.style.background =
          m.status === "resolved" ? (s.fill ?? s.border) : (s.fill ?? "transparent");
      } else if (m.kind === "area" && m.w != null && m.h != null) {
        const rect = normBboxToScreenRect(
          { x: m.x, y: m.y, w: m.w, h: m.h },
          viewer,
          OSD,
          page.width,
          page.height,
        );
        el.style.left = `${rect.x}px`;
        el.style.top = `${rect.y}px`;
        el.style.width = `${rect.w}px`;
        el.style.height = `${rect.h}px`;
        el.style.borderColor = s.border;
        el.style.background = s.bg;
      }
    });
    setOverlayTick((t) => t + 1);
  }, [page, pinAreaMarkups]);

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
          gestureSettingsTouch: { pinchToZoom: true, flickEnabled: true },
        });
        viewerRef.current.addHandler("zoom", () => {
          const vp = viewerRef.current?.viewport;
          if (!vp) return;
          const home = vp.getHomeZoom() || 1;
          setZoomPct(Math.round((vp.getZoom() / home) * 100));
          repositionMarkups();
        });
        viewerRef.current.addHandler("animation", repositionMarkups);
        viewerRef.current.addHandler("open", repositionMarkups);
      }

      viewerRef.current.open(`${tileBase(file, page.pageNo)}/page.dzi`);
    })();

    return () => {
      disposed = true;
    };
  }, [ready, file, page, repositionMarkups]);

  useEffect(() => {
    return () => {
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewerRef.current?.setMouseNavEnabled(tool === "nav");
  }, [tool]);

  useEffect(() => {
    repositionMarkups();
  }, [pinAreaMarkups, repositionMarkups, pageIdx]);

  function screenToNorm(px: number, py: number): NormPoint | null {
    const viewer = viewerRef.current;
    const OSD = osdRef.current;
    if (!viewer || !OSD || !page) return null;
    return screenPointToNorm(px, py, viewer, OSD, page.width, page.height);
  }

  function onPointerDown(e: React.PointerEvent) {
    const el = overlayRef.current!;
    const b = el.getBoundingClientRect();
    const px = e.clientX - b.left;
    const py = e.clientY - b.top;

    if (tool === "photo") {
      if (selectedId) photoInputRef.current?.click();
      return;
    }

    if (tool === "eraser") {
      const pt = screenToNorm(px, py);
      if (!pt) return;
      const hit = pageMarkups
        .filter((m) => m.kind === "ink")
        .find((m) => {
          const path = (m.path as NormPoint[] | null) ?? [];
          const threshold = (m.stroke_width ?? page!.width * 0.004) / page!.width;
          return distToPath(path, pt.x, pt.y) <= threshold * 3;
        });
      if (hit) void deleteInk(hit.id);
      return;
    }

    if (tool === "pen" || tool === "highlighter") {
      inkDrawing.current = true;
      const pt = screenToNorm(px, py);
      if (pt) setDraftInk([pt]);
      el.setPointerCapture(e.pointerId);
      return;
    }

    if (tool === "nav") return;

    if (tool === "pin") {
      const pt = screenToNorm(px, py);
      if (!pt) return;
      setPending({ kind: "pin", x: pt.x, y: pt.y });
      setTool("nav");
      return;
    }

    if (tool === "area") {
      drag.current = { x: px, y: py };
      setDraftRect({ x: px, y: py, w: 0, h: 0 });
      el.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const el = overlayRef.current!;
    const b = el.getBoundingClientRect();
    const cx = e.clientX - b.left;
    const cy = e.clientY - b.top;

    if ((tool === "pen" || tool === "highlighter") && inkDrawing.current) {
      const pt = screenToNorm(cx, cy);
      if (pt) {
        setDraftInk((prev) => (prev ? [...prev, pt] : [pt]));
      }
      return;
    }

    if (tool !== "area" || !drag.current) return;
    setDraftRect({
      x: Math.min(drag.current.x, cx),
      y: Math.min(drag.current.y, cy),
      w: Math.abs(cx - drag.current.x),
      h: Math.abs(cy - drag.current.y),
    });
  }

  async function finishInk(path: NormPoint[]) {
    if (!page || path.length < 2) return;
    const bbox = bboxFromPath(path);
    const strokeWidth = inkStrokeImageWidth(page.width, inkWidth);
    const opacity = tool === "highlighter" ? HIGHLIGHTER_OPACITY : 1;
    await createInk({
      pageNo: page.pageNo,
      path,
      x: bbox.x,
      y: bbox.y,
      w: bbox.w,
      h: bbox.h,
      color: inkColor,
      strokeWidth,
      opacity,
    });
  }

  function onPointerUp() {
    if ((tool === "pen" || tool === "highlighter") && inkDrawing.current) {
      inkDrawing.current = false;
      if (draftInk && draftInk.length >= 2) {
        void finishInk(draftInk);
      }
      setDraftInk(null);
      return;
    }

    if (tool !== "area" || !drag.current || !draftRect) {
      drag.current = null;
      return;
    }
    drag.current = null;

    if (draftRect.w < 8 || draftRect.h < 8) {
      setDraftRect(null);
      return;
    }

    const viewer = viewerRef.current;
    const OSD = osdRef.current;
    if (!viewer || !OSD || !page) return;

    const bbox: NormBbox = screenRectToNormBbox(
      draftRect,
      viewer,
      OSD,
      page.width,
      page.height,
    );
    setPending({ kind: "area", x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h });
    setDraftRect(null);
    setTool("nav");
  }

  async function uploadPhoto(markupId: string, file: File, commentId?: string | null) {
    const signed = await requestMarkupPhotoUpload(markupId, file.name);
    if ("error" in signed) throw new Error(signed.error);

    if (!online) {
      await enqueueMarkupOp({
        type: "upload_photo",
        clientId: crypto.randomUUID(),
        payload: {
          markupId,
          filePath: signed.path,
          projectId,
          blob: file,
          fileName: file.name,
          commentId,
        },
      });
      return;
    }

    const { error } = await supabase.storage
      .from("markup-photos")
      .uploadToSignedUrl(signed.path, signed.token, file, {
        contentType: file.type || undefined,
      });
    if (error) throw new Error(error.message);
    await registerMarkupPhoto(markupId, signed.path, projectId, commentId);
  }

  async function handleCompose(title: string, body: string, photo: File | null) {
    if (!pending || !page) return;
    const id = await createMarkup({
      kind: pending.kind,
      pageNo: page.pageNo,
      x: pending.x,
      y: pending.y,
      w: pending.kind === "area" ? pending.w : null,
      h: pending.kind === "area" ? pending.h : null,
      title,
      commentBody: body,
    });
    if (photo && id) {
      try {
        await uploadPhoto(id, photo);
      } catch (err) {
        console.error("photo upload", err);
      }
    }
    setPending(null);
  }

  function jumpToMarkup(m: MarkupWithThread) {
    const idx = file.pages.findIndex((p) => p.pageNo === m.page_no);
    if (idx >= 0) setPageIdx(idx);
    setSelectedId(m.id);
    setTimeout(() => {
      const viewer = viewerRef.current;
      const OSD = osdRef.current;
      const p = file.pages[idx];
      if (!viewer || !OSD || !p) return;
      if ((m.kind === "area" || m.kind === "ink") && m.w && m.h) {
        const vpRect = viewer.viewport.imageToViewportRectangle(
          new OSD.Rect(m.x * p.width, m.y * p.height, m.w * p.width, m.h * p.height),
        );
        viewer.viewport.fitBounds(vpRect, true);
      } else {
        const vp = viewer.viewport.imageToViewportCoordinates(
          new OSD.Point(m.x * p.width, m.y * p.height),
        );
        viewer.viewport.panTo(vp, true);
      }
    }, 300);
  }

  const selected = markups.find((m) => m.id === selectedId) ?? null;

  if (failed || !ready) {
    return (
      <SheetProcessingPlaceholder failed={failed} processing={processing} />
    );
  }

  const draftStrokeWidth = page
    ? inkStrokeImageWidth(page.width, inkWidth)
    : 4;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div className="flex items-center gap-3">
          <span className="truncate text-sm text-ink">{file.name}</span>
          <span className="font-mono text-xs text-graph">
            Sheet {pageIdx + 1} / {file.pages.length} · rev {file.version}
          </span>
          {!online && (
            <span className="font-mono text-xs text-weld">Offline</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-graph">
            <input
              type="checkbox"
              checked={showCarriedOnly}
              onChange={(e) => setShowCarriedOnly(e.target.checked)}
              className="rounded border-rule"
            />
            Carried only
          </label>
          <button
            type="button"
            onClick={() => viewerRef.current?.viewport?.zoomBy(0.8)}
            className="rounded-lg border border-rule px-2.5 py-1 text-sm text-ink"
          >
            −
          </button>
          <span className="w-12 text-center font-mono text-xs text-graph">
            {zoomPct}%
          </span>
          <button
            type="button"
            onClick={() => viewerRef.current?.viewport?.zoomBy(1.25)}
            className="rounded-lg border border-rule px-2.5 py-1 text-sm text-ink"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => viewerRef.current?.viewport?.goHome()}
            className="rounded-lg border border-rule px-3 py-1 text-sm text-ink"
          >
            Fit
          </button>
        </div>
      </div>

      <div className="relative mt-4">
        <div
          ref={containerRef}
          className="h-[70vh] w-full rounded-xl border border-rule bg-ink/[0.03] dark:bg-paper/[0.04]"
        />

        <InkOverlay
          markups={pageMarkups}
          selectedId={selectedId}
          pageWidth={page.width}
          pageHeight={page.height}
          viewer={viewerRef.current}
          osd={osdRef.current}
          draftPath={draftInk}
          draftColor={inkColor}
          draftWidth={draftStrokeWidth}
          draftOpacity={tool === "highlighter" ? HIGHLIGHTER_OPACITY : 1}
          onSelect={setSelectedId}
        />

        <div ref={markupsLayerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
          {pinAreaMarkups.map((m) => (
            <button
              key={m.id}
              type="button"
              data-markup-id={m.id}
              onClick={() => setSelectedId(m.id)}
              className={`pointer-events-auto absolute border-2 ${
                m.kind === "area" ? "rounded-none" : "rounded-full"
              } ${selectedId === m.id ? "ring-2 ring-weld ring-offset-1" : ""}`}
              aria-label={m.title ?? "Markup"}
            />
          ))}
        </div>

        <div
          ref={overlayRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="absolute inset-0"
          style={{
            cursor:
              tool === "pin" || tool === "area" || tool === "pen" || tool === "highlighter"
                ? "crosshair"
                : tool === "eraser"
                  ? "cell"
                  : "default",
            pointerEvents: tool !== "nav" ? "auto" : "none",
          }}
        >
          {draftRect && (
            <div
              className="absolute border-2 border-weld bg-weld/10"
              style={{
                left: draftRect.x,
                top: draftRect.y,
                width: draftRect.w,
                height: draftRect.h,
              }}
            />
          )}
        </div>

        {(tool === "pen" || tool === "highlighter") && (
          <InkPalette
            color={inkColor}
            width={inkWidth}
            onColor={setInkColor}
            onWidth={setInkWidth}
          />
        )}

        <div className="absolute bottom-4 left-1/2 z-10 flex max-w-[95%] -translate-x-1/2 gap-1 overflow-x-auto rounded-xl border border-rule bg-paper p-1 shadow-md">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTool(t.id);
                setDraftRect(null);
                setDraftInk(null);
              }}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                tool === t.id ? "bg-weld text-paper" : "text-ink hover:bg-bone"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && selectedId) void uploadPhoto(selectedId, f);
            e.target.value = "";
          }}
        />

        {pending && (
          <MarkupComposePopover
            kind={pending.kind}
            onSubmit={handleCompose}
            onCancel={() => setPending(null)}
          />
        )}

        {selected && (
          <MarkupThreadPanel
            markup={selected}
            isAdminUser={isAdminUser}
            pending={pendingIds.has(selected.id)}
            onClose={() => setSelectedId(null)}
            onReply={(body) => addComment(selected.id, body)}
            onStatusChange={(s) => setStatus(selected.id, s)}
            onAttachPhoto={(f) => uploadPhoto(selected.id, f)}
          />
        )}
      </div>

      {file.pages.length >= 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {file.pages.map((p, i) => {
            const sheetMarkups = markups.filter((m) => m.page_no === p.pageNo);
            const openCount = sheetMarkups.filter((m) => m.status === "open").length;
            return (
              <button
                key={p.pageNo}
                type="button"
                onClick={() => setPageIdx(i)}
                className={`relative shrink-0 overflow-hidden rounded-lg border ${
                  i === pageIdx ? "border-weld" : "border-rule"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${tileBase(file, p.pageNo)}/thumb.webp`}
                  alt={`Sheet ${i + 1}`}
                  className="h-24 w-auto"
                />
                {sheetMarkups.length > 0 && (
                  <>
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox={`0 0 ${p.width} ${p.height}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {sheetMarkups.map((m) => {
                        if (m.kind === "area" && m.w && m.h) {
                          return (
                            <rect
                              key={m.id}
                              x={m.x * p.width}
                              y={m.y * p.height}
                              width={m.w * p.width}
                              height={m.h * p.height}
                              fill="none"
                              stroke={
                                m.status === "open"
                                  ? "var(--weld)"
                                  : "var(--ink)"
                              }
                              strokeWidth={Math.max(p.width, p.height) * 0.004}
                            />
                          );
                        }
                        if (m.kind === "ink") {
                          const path = (m.path as NormPoint[] | null) ?? [];
                          if (path.length < 2) return null;
                          const pts = path
                            .map((pt) => `${pt.x * p.width},${pt.y * p.height}`)
                            .join(" ");
                          return (
                            <polyline
                              key={m.id}
                              points={pts}
                              fill="none"
                              stroke={m.color ?? "#000"}
                              strokeWidth={Math.max(p.width, p.height) * 0.003}
                              opacity={m.opacity ?? 1}
                            />
                          );
                        }
                        return (
                          <circle
                            key={m.id}
                            cx={m.x * p.width}
                            cy={m.y * p.height}
                            r={Math.max(p.width, p.height) * 0.012}
                            fill={
                              m.status === "open"
                                ? "var(--weld)"
                                : m.status === "resolved"
                                  ? "color-mix(in srgb, var(--ink) 35%, transparent)"
                                  : "var(--ink)"
                            }
                          />
                        );
                      })}
                    </svg>
                    <span
                      className={`absolute right-1 top-1 rounded-full px-1.5 py-0.5 font-mono text-[0.6rem] ${
                        openCount > 0 ? "bg-weld text-paper" : "bg-ink/70 text-paper"
                      }`}
                    >
                      {openCount > 0 ? openCount : sheetMarkups.length}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      <MarkupsListPanel
        markups={visibleMarkups}
        open={listOpen}
        onToggle={() => setListOpen((v) => !v)}
        filterStatus={filterStatus}
        onFilterStatus={setFilterStatus}
        filterPage={filterPage}
        onFilterPage={setFilterPage}
        pageCount={file.pages.length}
        onSelect={jumpToMarkup}
        kindIcon={kindIcon}
      />
    </div>
  );
}
