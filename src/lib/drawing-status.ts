/** Stored in drawings.error when tiling cannot run (no worker/Redis). */
export const PDF_ONLY_PREFIX = "pdf_only:";

export function isPdfOnlyDrawing(d: { error?: string | null }): boolean {
  return (d.error ?? "").startsWith(PDF_ONLY_PREFIX);
}

export function pdfOnlyMessage(error: string | null | undefined): string {
  if (!error?.startsWith(PDF_ONLY_PREFIX)) return "";
  return error.slice(PDF_ONLY_PREFIX.length).trim();
}

/** User-facing tiling status for drawings stuck without DZI tiles. */
export type TilingHint =
  | "processing"
  | "queued"
  | "worker_active"
  | "no_redis"
  | "worker_offline"
  | "failed";

export function tilingHintLabel(hint: TilingHint): string {
  switch (hint) {
    case "processing":
      return "Processing";
    case "queued":
      return "Queued";
    case "worker_active":
      return "Tiling…";
    case "no_redis":
      return "Worker not configured";
    case "worker_offline":
      return "Worker not responding";
    case "failed":
      return "Failed";
  }
}
