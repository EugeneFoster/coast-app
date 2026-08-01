import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createAdminClient } from "@/lib/supabase/admin";
import { canInlineTiling } from "@/lib/tiling/tile-storage";
import { tilingConfig } from "@/lib/tiling/config";
import { putTileDir, putTileFile } from "@/lib/tiling/tile-storage";

const run = promisify(execFile);

async function pdfPageCount(pdfPath: string) {
  const { stdout } = await run("pdfinfo", [pdfPath]);
  const m = stdout.match(/Pages:\s+(\d+)/);
  if (!m) throw new Error("Could not read page count from pdfinfo");
  return Number(m[1]);
}

async function pageLongEdgePts(pdfPath: string, page: number) {
  const { stdout } = await run("pdfinfo", [
    "-f",
    String(page),
    "-l",
    String(page),
    pdfPath,
  ]);
  const m = stdout.match(/Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)/i);
  if (!m) {
    const g = stdout.match(/Page size:\s+([\d.]+)\s+x\s+([\d.]+)/i);
    if (g) return Math.max(Number(g[1]), Number(g[2]));
    return 612;
  }
  return Math.max(Number(m[1]), Number(m[2]));
}

function computeDpi(longEdgePts: number) {
  const inches = longEdgePts / 72;
  let dpi = Math.round(tilingConfig.targetLongEdge / inches);
  const maxDpiForCap = Math.floor(tilingConfig.maxLongEdge / inches);
  dpi = Math.min(dpi, maxDpiForCap, tilingConfig.maxDpi);
  return Math.max(dpi, tilingConfig.minDpi);
}

async function vipsHeader(field: string, file: string) {
  const { stdout } = await run("vipsheader", ["-f", field, file]);
  return Number(stdout.trim());
}

async function renderPage(pdfPath: string, page: number, dpi: number, outBase: string) {
  await run("pdftoppm", [
    "-png",
    "-r",
    String(dpi),
    "-f",
    String(page),
    "-l",
    String(page),
    "-singlefile",
    pdfPath,
    outBase,
  ]);
  return `${outBase}.png`;
}

async function buildPyramid(pngPath: string, outBase: string) {
  await run("vips", [
    "dzsave",
    pngPath,
    outBase,
    "--layout",
    "dz",
    "--suffix",
    `.webp[Q=${tilingConfig.webpQuality}]`,
    "--tile-size",
    String(tilingConfig.tileSize),
    "--overlap",
    String(tilingConfig.tileOverlap),
  ]);
}

async function makeThumb(pngPath: string, outPath: string, size: number) {
  await run("vips", ["thumbnail", pngPath, outPath, String(size)]);
}

async function downloadPdf(storageKey: string, destPath: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(tilingConfig.pdfBucket)
    .download(storageKey);
  if (error) throw new Error(`Download PDF failed: ${error.message}`);
  await writeFile(destPath, Buffer.from(await data.arrayBuffer()));
}

async function setProcessing(drawingId: string) {
  const supabase = createAdminClient();
  await supabase
    .from("drawings")
    .update({ status: "processing", error: null })
    .eq("id", drawingId);
}

async function setReady(drawingId: string, pageCount: number) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("drawings")
    .update({ status: "ready", page_count: pageCount, error: null })
    .eq("id", drawingId);
  if (error) throw new Error(error.message);
}

async function setFailed(drawingId: string, message: string) {
  const supabase = createAdminClient();
  await supabase
    .from("drawings")
    .update({ status: "failed", error: String(message).slice(0, 1000) })
    .eq("id", drawingId);
}

async function replacePages(
  drawingId: string,
  rows: {
    drawing_id: string;
    page_no: number;
    width: number;
    height: number;
    dzi_key: string;
    tiles_prefix: string;
    thumb_key: string;
    preview_key: string;
  }[],
) {
  const supabase = createAdminClient();
  const del = await supabase.from("drawing_pages").delete().eq("drawing_id", drawingId);
  if (del.error) throw new Error(del.error.message);
  if (rows.length === 0) return;
  const ins = await supabase.from("drawing_pages").insert(rows);
  if (ins.error) throw new Error(ins.error.message);
}

async function setProjectCoverIfEmpty(drawingId: string, previewKey: string) {
  const supabase = createAdminClient();
  const { data: drawing } = await supabase
    .from("drawings")
    .select("project_id")
    .eq("id", drawingId)
    .maybeSingle();
  if (!drawing?.project_id) return;

  const { data: project } = await supabase
    .from("projects")
    .select("cover_url")
    .eq("id", drawing.project_id)
    .maybeSingle();
  if (project?.cover_url) return;

  await supabase
    .from("projects")
    .update({ cover_url: previewKey })
    .eq("id", drawing.project_id)
    .is("cover_url", null);
}

/** Render PDF pages to DZI tiles on this server (no Redis/worker). */
export async function processDrawingInline({
  drawingId,
  version,
  pdfStorageKey,
}: {
  drawingId: string;
  version: number;
  pdfStorageKey: string;
}) {
  if (!canInlineTiling()) {
    throw new Error("Inline tiling requires Supabase service role");
  }

  const work = await mkdtemp(path.join(os.tmpdir(), `coast-${drawingId}-`));
  try {
    await setProcessing(drawingId);

    const pdfPath = path.join(work, "source.pdf");
    await downloadPdf(pdfStorageKey, pdfPath);

    const pages = await pdfPageCount(pdfPath);
    const rows: {
      drawing_id: string;
      page_no: number;
      width: number;
      height: number;
      dzi_key: string;
      tiles_prefix: string;
      thumb_key: string;
      preview_key: string;
    }[] = [];

    for (let p = 1; p <= pages; p++) {
      const longEdge = await pageLongEdgePts(pdfPath, p);
      const dpi = computeDpi(longEdge);

      const pageBase = path.join(work, `page-${p}`);
      const pngPath = await renderPage(pdfPath, p, dpi, pageBase);

      const width = await vipsHeader("width", pngPath);
      const height = await vipsHeader("height", pngPath);

      const dziBase = path.join(work, `dz-${p}`);
      await buildPyramid(pngPath, dziBase);

      const thumbPath = path.join(work, `thumb-${p}.webp`);
      const previewPath = path.join(work, `preview-${p}.webp`);
      await makeThumb(pngPath, thumbPath, 160);
      await makeThumb(pngPath, previewPath, 1500);

      const prefix = `drawings/${drawingId}/v${version}/p${p}`;
      const dziKey = `${prefix}/page.dzi`;
      const tilesPrefix = `${prefix}/page_files`;
      const thumbKey = `${prefix}/thumb.webp`;
      const previewKey = `${prefix}/preview.webp`;

      await putTileFile(dziKey, `${dziBase}.dzi`);
      await putTileDir(`${dziBase}_files`, tilesPrefix);
      await putTileFile(thumbKey, thumbPath);
      await putTileFile(previewKey, previewPath);

      rows.push({
        drawing_id: drawingId,
        page_no: p,
        width,
        height,
        dzi_key: dziKey,
        tiles_prefix: tilesPrefix,
        thumb_key: thumbKey,
        preview_key: previewKey,
      });

      if (p === 1) {
        await setProjectCoverIfEmpty(drawingId, previewKey);
      }
    }

    await replacePages(drawingId, rows);
    await setReady(drawingId, pages);
    return { pages };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setFailed(drawingId, message);
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
