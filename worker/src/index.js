import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env.js";
import { processDrawing } from "./process.js";

// Legacy queue mode. The default deployment uses src/poll.js (no Redis).
if (!env.redisUrl) {
  console.error(
    "REDIS_URL is required for queue mode (src/index.js). " +
      "For the Redis-free default, run src/poll.js instead.",
  );
  process.exit(1);
}

const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  env.queueName,
  async (job) => {
    const { drawingId, version, pdfStorageKey } = job.data;
    if (!drawingId || !version || !pdfStorageKey) {
      throw new Error("Job missing drawingId/version/pdfStorageKey");
    }
    console.log(`[tile] processing drawing=${drawingId} v${version}`);
    const result = await processDrawing({ drawingId, version, pdfStorageKey });
    console.log(`[tile] done drawing=${drawingId} pages=${result.pages}`);
    return result;
  },
  { connection, concurrency: Number(process.env.TILE_CONCURRENCY || 2) },
);

worker.on("failed", (job, err) => {
  console.error(`[tile] failed drawing=${job?.data?.drawingId}: ${err.message}`);
});

worker.on("ready", () => {
  console.log(`[tile] worker ready on queue "${env.queueName}"`);
});

async function shutdown() {
  console.log("[tile] shutting down…");
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
