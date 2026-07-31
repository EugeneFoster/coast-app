"use client";

import type { TilingHint } from "@/lib/drawing-status";

export function SheetProcessingPlaceholder({
  failed,
  processing,
  tilingHint = "processing",
  tilingError,
}: {
  failed?: boolean;
  processing?: boolean;
  tilingHint?: TilingHint;
  tilingError?: string | null;
}) {
  if (failed || tilingHint === "failed") {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-weld/40 py-20 text-center">
        <p className="font-display text-lg text-weld">Sheet processing failed</p>
        <p className="mt-2 max-w-md text-sm text-graph">
          {tilingError ??
            "Deep zoom tiles could not be generated. Re-upload the drawing or use Retry from the drawings list."}
        </p>
      </div>
    );
  }

  if (tilingHint === "no_redis") {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rule py-20 text-center">
        <p className="font-display text-lg text-ink">Tiling worker not configured</p>
        <p className="mt-2 max-w-md text-sm text-graph">
          Set <span className="font-mono">REDIS_URL</span> on the web service and deploy the{" "}
          <span className="font-mono">worker/</span> Docker service on Railway (see{" "}
          <span className="font-mono">worker/README.md</span>). Drawings cannot be viewed until
          tiles are generated.
        </p>
      </div>
    );
  }

  if (tilingHint === "worker_offline") {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-weld/40 py-20 text-center">
        <p className="font-display text-lg text-weld">Worker not responding</p>
        <p className="mt-2 max-w-md text-sm text-graph">
          The tiling job is queued in Redis but the worker service is not processing it. On
          Railway, add a second service with root directory <span className="font-mono">worker</span>{" "}
          and the env vars from <span className="font-mono">worker/README.md</span>, then click
          Retry in the drawings list.
        </p>
      </div>
    );
  }

  const subtitle =
    tilingHint === "worker_active"
      ? "The tiling worker is processing this sheet now. Markup tools will appear when it finishes."
      : tilingHint === "queued"
        ? "Waiting for the tiling worker to pick up this job."
        : "The drawing is being tiled for the deep-zoom viewer. Markup tools will be available once processing completes.";

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rule py-20 text-center">
      <p className="font-display text-lg text-ink">
        {tilingHint === "worker_active" ? "Tiling in progress…" : "Preparing sheets…"}
      </p>
      <p className="mt-2 max-w-md text-sm text-graph">
        {subtitle}
        {processing ? " This view updates automatically." : ""}
      </p>
    </div>
  );
}
