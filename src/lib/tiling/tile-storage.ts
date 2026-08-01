import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2, R2_BUCKET } from "@/lib/r2";

export const TILE_BUCKET = "drawing-tiles";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".dzi": "application/xml",
  ".xml": "application/xml",
};

function contentType(key: string) {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] || "application/octet-stream";
}

function useR2() {
  return getR2() != null;
}

async function ensureTileBucket() {
  const admin = createAdminClient();
  const { error } = await admin.storage.createBucket(TILE_BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(error.message);
  }
}

export async function putTileFile(key: string, filePath: string) {
  const body = await readFile(filePath);
  const type = contentType(key);

  if (useR2()) {
    const s3 = getR2()!;
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: type,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return;
  }

  await ensureTileBucket();
  const admin = createAdminClient();
  const { error } = await admin.storage.from(TILE_BUCKET).upload(key, body, {
    upsert: true,
    contentType: type,
  });
  if (error) throw new Error(error.message);
}

export async function putTileDir(localDir: string, keyPrefix: string) {
  const entries = await readdir(localDir);
  for (const entry of entries) {
    const full = path.join(localDir, entry);
    const info = await stat(full);
    const key = `${keyPrefix}/${entry}`;
    if (info.isDirectory()) {
      await putTileDir(full, key);
    } else {
      await putTileFile(key, full);
    }
  }
}

export async function getTileObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (useR2()) {
    const { getR2Object } = await import("@/lib/r2");
    const obj = await getR2Object(key);
    if (!obj) return null;
    return { body: obj.body, contentType: obj.contentType };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(TILE_BUCKET).download(key);
  if (error || !data) return null;
  return {
    body: new Uint8Array(await data.arrayBuffer()),
    contentType: contentType(key),
  };
}

/** True when this server can tile PDFs (Supabase required; R2 optional). */
export function canInlineTiling(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function tileBackend(): "r2" | "supabase" {
  return useR2() ? "r2" : "supabase";
}
