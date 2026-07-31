"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MarkupWithThread } from "@/lib/types";
import { MARKUP_STATUS } from "@/lib/markup-status";
import {
  normBboxToScreenRect,
  normToViewportPixel,
  screenPointToNorm,
  screenRectToNormBbox,
  type NormBbox,
} from "@/lib/markup-coords";
import { useDrawingMarkups } from "@/components/drawing-markups/use-drawing-markups";
import { MarkupComposePopover } from "@/components/drawing-markups/markup-compose-popover";
import { MarkupThreadPanel } from "@/components/drawing-markups/markup-thread-panel";
import { MarkupsListPanel } from "@/components/drawing-markups/markups-list-panel";
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
  pdfUrl: string | null;
};

type Tool = "nav" | "pin" | "area";
type PendingPlacement =
  | { kind: "pin"; x: number; y: number }
  | { kind: "area"; x: number; y: number; w: number; h: number };

function tileBase(file: DrawingFile, pageNo: number) {
  return `/api/tiles/${file.id}/${file.version}/${pageNo}`;
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
        key={active.id}
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
  const processing = file.status === "processing";

  useEffect(() => {
    if (!processing) return;
    const id = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(id);
  }, [processing, router]);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const markupsLayerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osdRef = useRef<any>(null);

  const [pageIdx, setPageIdx] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const [tool, setTool] = useState<Tool>("nav");
  const [draftRect, setDraftRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [pending, setPending] = useState<PendingPlacement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<MarkupStatus | "all">("all");
  const [filterPage, setFilterPage] = useState<number | "all">("all");
  const [, setOverlayTick] = useState(0);

  const page = file.pages[pageIdx];
  const drag = useRef<{ x: number; y: number } | null>(null);

  const {
    markups,
    pendingIds,
    online,
    createMarkup,
    addComment,
    setStatus,
  } = useDrawingMarkups({
    drawingId: file.id,
    version: file.version,
    projectId,
    initial: initialMarkups,
  });

  const pageMarkups = markups.filter((m) => m.page_no === page?.pageNo);

  const repositionMarkups = useCallback(() => {
    const viewer = viewerRef.current;
    const OSD = osdRef.current;
    const layer = markupsLayerRef.current;
    if (!viewer || !OSD || !layer || !page) return;

    layer.querySelectorAll<HTMLElement>("[data-markup-id]").forEach((el) => {
      const id = el.dataset.markupId!;
      const m = pageMarkups.find((mk) => mk.id === id);
      if (!m) return;
      const s = MARKUP_STATUS[m.status];

      if (m.kind === "pin") {
        const pt = normToViewportPixel(m.x, m.y, viewer, OSD, page.width, page.height);
        el.style.left = `${pt.x - 8}px`;
        el.style.top = `${pt.y - 8}px`;
        el.style.width = "16px";
        el.style.height = "16px";
        el.style.borderColor = s.border;
        el.style.background = m.status === "resolved" ? s.fill ?? s.border : s.fill ?? "transparent";
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
  }, [page, pageMarkups]);

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
  }, [pageMarkups, repositionMarkups, pageIdx]);

  function onPointerDown(e: React.PointerEvent) {
    if (tool === "nav") return;
    const el = overlayRef.current!;
    const b = el.getBoundingClientRect();

    if (tool === "pin") {
      const px = e.clientX - b.left;
      const py = e.clientY - b.top;
      const viewer = viewerRef.current;
      const OSD = osdRef.current;
      if (!viewer || !OSD || !page) return;
      const pt = screenPointToNorm(px, py, viewer, OSD, page.width, page.height);
      setPending({ kind: "pin", x: pt.x, y: pt.y });
      setTool("nav");
      return;
    }

    if (tool === "area") {
      drag.current = { x: e.clientX - b.left, y: e.clientY - b.top };
      setDraftRect({ x: drag.current.x, y: drag.current.y, w: 0, h: 0 });
      el.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (tool !== "area" || !drag.current) return;
    const b = overlayRef.current!.getBoundingClientRect();
    const cx = e.clientX - b.left;
    const cy = e.clientY - b.top;
    setDraftRect({
      x: Math.min(drag.current.x, cx),
      y: Math.min(drag.current.y, cy),
      w: Math.abs(cx - drag.current.x),
      h: Math.abs(cy - drag.current.y),
    });
  }

  function onPointerUp() {
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
        if (m.kind === "area" && m.w && m.h) {
        const OSD = osdRef.current;
        const vpRect = viewer.viewport.imageToViewportRectangle(
          new OSD.Rect(
            m.x * p.width,
            m.y * p.height,
            m.w * p.width,
            m.h * p.height,
          ),
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

  if (failed) {
    return (
      <div className="rounded border border-weld/40 bg-weld/10 px-4 py-6 text-sm text-weld">
        Sheet processing failed. Re-upload to try again.
      </div>
    );
  }

  if (!ready) {
    if (file.pdfUrl) {
      return (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-paper px-4 py-3">
            <div>
              <p className="font-display text-sm text-ink">Preparing deep zoom…</p>
              <p className="mt-0.5 text-xs text-graph">
                Showing the original PDF while tiles are generated. This view updates
                automatically.
              </p>
            </div>
            <a
              href={file.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs text-weld hover:underline"
            >
              Open PDF
            </a>
          </div>
          <iframe
            title={file.name}
            src={file.pdfUrl}
            className="h-[70vh] w-full rounded-xl border border-rule bg-paper"
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center rounded border border-dashed border-rule py-16 text-center">
        <p className="font-display text-lg text-ink">Preparing sheets…</p>
        <p className="mt-2 max-w-sm text-sm text-graph">
          The drawing is being tiled for deep zoom. This view updates automatically.
        </p>
      </div>
    );
  }

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
          <button type="button" onClick={() => viewerRef.current?.viewport?.zoomBy(0.8)} className="rounded-lg border border-rule px-2.5 py-1 text-sm text-ink">−</button>
          <span className="w-12 text-center font-mono text-xs text-graph">{zoomPct}%</span>
          <button type="button" onClick={() => viewerRef.current?.viewport?.zoomBy(1.25)} className="rounded-lg border border-rule px-2.5 py-1 text-sm text-ink">+</button>
          <button type="button" onClick={() => viewerRef.current?.viewport?.goHome()} className="rounded-lg border border-rule px-3 py-1 text-sm text-ink">Fit</button>
        </div>
      </div>

      <div className="relative mt-4">
        <div
          ref={containerRef}
          className="h-[70vh] w-full rounded-xl border border-rule bg-ink/[0.03] dark:bg-paper/[0.04]"
        />

        {/* Markup overlays */}
        <div ref={markupsLayerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
          {pageMarkups.map((m) => (
            <button
              key={m.id}
              type="button"
              data-markup-id={m.id}
              onClick={() => setSelectedId(m.id)}
              className={`pointer-events-auto absolute rounded-full border-2 ${
                m.kind === "area" ? "rounded-none" : "rounded-full"
              } ${selectedId === m.id ? "ring-2 ring-weld ring-offset-1" : ""}`}
              style={{ transform: m.kind === "pin" ? undefined : undefined }}
              aria-label={m.title ?? "Markup"}
            />
          ))}
        </div>

        {/* Placement overlay */}
        <div
          ref={overlayRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="absolute inset-0"
          style={{
            cursor: tool === "pin" ? "crosshair" : tool === "area" ? "crosshair" : "default",
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

        {/* Tool rail */}
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-xl border border-rule bg-paper p-1 shadow-md">
          {(
            [
              { id: "nav" as Tool, label: "Pan" },
              { id: "pin" as Tool, label: "Pin" },
              { id: "area" as Tool, label: "Area" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTool(t.id);
                setDraftRect(null);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                tool === t.id
                  ? "bg-weld text-paper"
                  : "text-ink hover:bg-bone"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

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

      {/* Sheet rail with markup dots */}
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
                      {sheetMarkups.map((m) => (
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
                      ))}
                    </svg>
                    <span
                      className={`absolute right-1 top-1 rounded-full px-1.5 py-0.5 font-mono text-[0.6rem] ${
                        openCount > 0 ? "bg-weld text-paper" : "bg-ink/70 text-paper"
                      }`}
                    >
                      {sheetMarkups.length}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      <MarkupsListPanel
        markups={markups}
        open={listOpen}
        onToggle={() => setListOpen((v) => !v)}
        filterStatus={filterStatus}
        onFilterStatus={setFilterStatus}
        filterPage={filterPage}
        onFilterPage={setFilterPage}
        pageCount={file.pages.length}
        onSelect={jumpToMarkup}
      />
    </div>
  );
}
