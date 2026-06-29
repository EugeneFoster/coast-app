// Redis-free tiling worker.
//
// Instead of a queue broker, this polls Postgres for drawings still in the
// 'processing' state and tiles them. The drawing row IS the job: created and
// re-uploaded drawings are set to 'processing' by the app, and processDrawing()
// flips each to 'ready' or 'failed' when done.
//
// Assumes a single worker instance (the Railway default). Within the process an
// in-memory set prevents picking up a drawing that's already being tiled.
import { env } from "./env.js";
import { fetchProcessingDrawings } from "./supabase.js";
import { processDrawing } from "./process.js";

const CONCURRENCY = Number(process.env.TILE_CONCURRENCY || 2);
const inFlight = new Set();
let stopped = false;

async function tick() {
  if (inFlight.size >= CONCURRENCY) return;
  const rows = await fetchProcessingDrawings(CONCURRENCY * 4);

  for (const row of rows) {
    if (inFlight.size >= CONCURRENCY) break;
    if (inFlight.has(row.id)) continue;
    if (!row.file_path) continue;

    inFlight.add(row.id);
    console.log(`[tile] processing drawing=${row.id} v${row.version ?? 1}`);
    processDrawing({
      drawingId: row.id,
      version: row.version ?? 1,
      pdfStorageKey: row.file_path,
    })
      .then((r) => console.log(`[tile] done drawing=${row.id} pages=${r.pages}`))
      .catch((e) =>
        console.error(`[tile] failed drawing=${row.id}: ${e?.message ?? e}`),
      )
      .finally(() => inFlight.delete(row.id));
  }
}

async function loop() {
  console.log(
    `[tile] polling worker started (interval ${env.pollIntervalMs}ms, concurrency ${CONCURRENCY})`,
  );
  while (!stopped) {
    try {
      await tick();
    } catch (e) {
      console.error(`[tile] poll error: ${e?.message ?? e}`);
    }
    await new Promise((resolve) => setTimeout(resolve, env.pollIntervalMs));
  }
}

process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});

loop();
