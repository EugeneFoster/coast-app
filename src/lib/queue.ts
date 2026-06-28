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
