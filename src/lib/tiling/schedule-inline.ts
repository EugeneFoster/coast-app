import { after } from "next/server";
import { processDrawingInline } from "@/lib/tiling/process-drawing";
import { canInlineTiling } from "@/lib/tiling/can-inline";

const inFlight = new Set<string>();

/** Kick off inline tiling after the response (no Redis/worker). */
export function scheduleInlineTiling({
  drawingId,
  version,
  pdfStorageKey,
}: {
  drawingId: string;
  version: number;
  pdfStorageKey: string;
}): boolean {
  if (!canInlineTiling()) return false;

  const key = `${drawingId}:v${version}`;
  if (inFlight.has(key)) return true;
  inFlight.add(key);

  after(async () => {
    try {
      await processDrawingInline({ drawingId, version, pdfStorageKey });
    } catch (err) {
      console.error("[inline-tile]", key, err);
    } finally {
      inFlight.delete(key);
    }
  });

  return true;
}
