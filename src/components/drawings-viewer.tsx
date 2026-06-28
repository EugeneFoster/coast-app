"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

type Bbox = { x: number; y: number; w: number; h: number };

function tileBase(file: DrawingFile, pageNo: number) {
  return `/api/tiles/${file.id}/${file.version}/${pageNo}`;
}

export function DrawingsViewer({ files }: { files: DrawingFile[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [activeId, setActiveId] = useState(files[0]?.id ?? null);
  const active = files.find((f) => f.id === activeId) ?? files[0] ?? null;

  // Realtime: flip from "processing" to the viewer when tiling finishes.
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
              className={`rounded border px-3 py-1.5 text-sm transition-colors ${
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

      <SheetViewer key={active.id} file={active} />
    </div>
  );
}

function SheetViewer({ file }: { file: DrawingFile }) {
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
  const [crop, setCrop] = useState<{ dataUrl: string; bbox: Bbox } | null>(null);

  const page = file.pages[pageIdx];

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
    setCrop({ dataUrl, bbox });
    setRect(null);
    setAskMode(false);

    // Chat slice isn't built yet — emit the payload for wiring later.
    console.info("ask:crop", {
      drawingId: file.id,
      version: file.version,
      pageNo: page.pageNo,
      bbox,
    });
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

  return (
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
          <button
            type="button"
            onClick={() => {
              setAskMode((v) => !v);
              setRect(null);
              viewerRef.current?.setMouseNavEnabled(askMode);
            }}
            className={`rounded border px-3 py-1 text-sm transition-colors ${
              askMode
                ? "border-weld bg-weld text-paper"
                : "border-rule text-ink hover:border-weld"
            }`}
          >
            Ask
          </button>
        </div>
      </div>

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
          {file.pages.map((p, i) => (
            <button
              key={p.pageNo}
              type="button"
              onClick={() => setPageIdx(i)}
              className={`shrink-0 overflow-hidden rounded border ${
                i === pageIdx ? "border-weld" : "border-rule"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${tileBase(file, p.pageNo)}/thumb.webp`}
                alt={`Sheet ${i + 1}`}
                className="h-24 w-auto"
              />
            </button>
          ))}
        </div>
      )}

      {/* Ask crop result (chat composer stub) */}
      {crop && (
        <div className="mt-4 flex items-center gap-4 rounded border border-rule bg-paper p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={crop.dataUrl}
            alt="Selected region"
            className="h-24 w-auto rounded border border-rule"
          />
          <div className="text-sm text-graph">
            <p className="text-ink">Region captured</p>
            <p className="font-mono text-xs">
              p{page?.pageNo} · {crop.bbox.w.toFixed(2)}×{crop.bbox.h.toFixed(2)}
            </p>
            <p className="mt-1 text-xs">Chat composer wiring pending.</p>
          </div>
          <button
            type="button"
            onClick={() => setCrop(null)}
            className="ml-auto text-xs text-graph hover:text-weld"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
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
