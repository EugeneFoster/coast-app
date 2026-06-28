import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "./env.js";
import { putDir, putFile } from "./r2.js";
import {
  downloadPdf,
  replacePages,
  setFailed,
  setProcessing,
  setReady,
} from "./supabase.js";

const run = promisify(execFile);

async function pdfPageCount(pdfPath) {
  const { stdout } = await run("pdfinfo", [pdfPath]);
  const m = stdout.match(/Pages:\s+(\d+)/);
  if (!m) throw new Error("Could not read page count from pdfinfo");
  return Number(m[1]);
}

// Long edge of a given page in PostScript points (1pt = 1/72 inch).
async function pageLongEdgePts(pdfPath, page) {
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
    return 612; // letter fallback
  }
  return Math.max(Number(m[1]), Number(m[2]));
}

function computeDpi(longEdgePts) {
  const inches = longEdgePts / 72;
  let dpi = Math.round(env.targetLongEdge / inches);
  // Respect the max pixel cap.
  const maxDpiForCap = Math.floor(env.maxLongEdge / inches);
  dpi = Math.min(dpi, maxDpiForCap, env.maxDpi);
  dpi = Math.max(dpi, env.minDpi);
  return dpi;
}

async function vipsHeader(field, file) {
  const { stdout } = await run("vipsheader", ["-f", field, file]);
  return Number(stdout.trim());
}

async function renderPage(pdfPath, page, dpi, outBase) {
  // pdftoppm appends nothing extra when -f == -l and -singlefile is used.
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

async function buildPyramid(pngPath, outBase) {
  // Produces <outBase>.dzi and <outBase>_files/<level>/<col>_<row>.webp
  await run("vips", [
    "dzsave",
    pngPath,
    outBase,
    "--layout",
    "dz",
    "--suffix",
    `.webp[Q=${env.webpQuality}]`,
    "--tile-size",
    String(env.tileSize),
    "--overlap",
    String(env.tileOverlap),
  ]);
}

async function makeThumb(pngPath, outPath, size) {
  await run("vips", ["thumbnail", pngPath, outPath, String(size)]);
}

/**
 * Render every page of a PDF into a DZI pyramid and upload to R2.
 * Idempotent: a re-run for the same {drawingId, version} overwrites the same keys
 * and replaces the drawing_pages rows.
 */
export async function processDrawing({ drawingId, version, pdfStorageKey }) {
  const work = await mkdtemp(path.join(os.tmpdir(), `coast-${drawingId}-`));
  try {
    await setProcessing(drawingId);

    const pdfPath = path.join(work, "source.pdf");
    await downloadPdf(pdfStorageKey, pdfPath);

    const pages = await pdfPageCount(pdfPath);
    const rows = [];

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

      // R2 layout: drawings/{drawingId}/v{version}/p{page}/...
      const prefix = `drawings/${drawingId}/v${version}/p${p}`;
      const dziKey = `${prefix}/page.dzi`;
      const tilesPrefix = `${prefix}/page_files`;
      const thumbKey = `${prefix}/thumb.webp`;
      const previewKey = `${prefix}/preview.webp`;

      await putFile(dziKey, `${dziBase}.dzi`);
      await putDir(`${dziBase}_files`, tilesPrefix);
      await putFile(thumbKey, thumbPath);
      await putFile(previewKey, previewPath);

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
    }

    await replacePages(drawingId, rows);
    await setReady(drawingId, pages);
    return { pages };
  } catch (error) {
    await setFailed(drawingId, error?.message ?? error);
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
