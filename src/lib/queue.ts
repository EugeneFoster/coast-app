// Enqueue tiling jobs for the Railway worker. No-op when REDIS_URL is absent,
// so uploads never break before the worker/Redis infra exists.
import type { ConnectionOptions, Queue } from "bullmq";

let queue: Queue | null = null;

async function getQueue(): Promise<Queue | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (queue) return queue;

  const { Queue: BullQueue } = await import("bullmq");
  const IORedis = (await import("ioredis")).default;
  const connection = new IORedis(url, { maxRetriesPerRequest: null });
  queue = new BullQueue(process.env.QUEUE_NAME || "tile", {
    connection: connection as unknown as ConnectionOptions,
  });
  return queue;
}

export async function enqueueTiling(job: {
  drawingId: string;
  version: number;
  pdfStorageKey: string;
}): Promise<boolean> {
  try {
    const q = await getQueue();
    if (!q) return false;
    await q.add("tile", job, {
      jobId: `${job.drawingId}:v${job.version}`,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    return true;
  } catch (error) {
    console.error("Failed to enqueue tiling job", error);
    return false;
  }
}

/** True when REDIS_URL is set and a queue connection can be opened. */
export async function isTilingAvailable(): Promise<boolean> {
  return (await getQueue()) != null;
}

export type TilingJobState =
  | { kind: "no_redis" }
  | { kind: "missing" }
  | { kind: "waiting" | "active" | "delayed" | "paused" }
  | { kind: "completed" }
  | { kind: "failed"; error: string };

export async function getTilingJobState(
  drawingId: string,
  version: number,
): Promise<TilingJobState> {
  const q = await getQueue();
  if (!q) return { kind: "no_redis" };

  const jobId = `${drawingId}:v${version}`;
  const job = await q.getJob(jobId);
  if (!job) return { kind: "missing" };

  const state = await job.getState();
  if (state === "failed") {
    return {
      kind: "failed",
      error: String(job.failedReason ?? "Tiling job failed"),
    };
  }
  if (state === "completed") return { kind: "completed" };
  if (state === "waiting" || state === "active" || state === "delayed") {
    return { kind: state };
  }
  return { kind: "waiting" };
}
