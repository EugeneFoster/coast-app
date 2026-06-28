import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

export const supabase = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function downloadPdf(storageKey, destPath) {
  const { data, error } = await supabase.storage
    .from(env.pdfBucket)
    .download(storageKey);
  if (error) throw new Error(`Download PDF failed: ${error.message}`);

  const { writeFile } = await import("node:fs/promises");
  const buffer = Buffer.from(await data.arrayBuffer());
  await writeFile(destPath, buffer);
  return destPath;
}

export async function setProcessing(drawingId) {
  await supabase
    .from("drawings")
    .update({ status: "processing", error: null })
    .eq("id", drawingId);
}

export async function setReady(drawingId, pageCount) {
  const { error } = await supabase
    .from("drawings")
    .update({ status: "ready", page_count: pageCount, error: null })
    .eq("id", drawingId);
  if (error) throw new Error(error.message);
}

export async function setFailed(drawingId, message) {
  await supabase
    .from("drawings")
    .update({ status: "failed", error: String(message).slice(0, 1000) })
    .eq("id", drawingId);
}

// Idempotent: clear any previous rows for this drawing before re-inserting.
export async function replacePages(drawingId, rows) {
  const del = await supabase
    .from("drawing_pages")
    .delete()
    .eq("drawing_id", drawingId);
  if (del.error) throw new Error(del.error.message);

  if (rows.length === 0) return;
  const ins = await supabase.from("drawing_pages").insert(rows);
  if (ins.error) throw new Error(ins.error.message);
}
