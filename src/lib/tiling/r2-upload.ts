import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2, R2_BUCKET } from "@/lib/r2";

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

export async function putR2File(key: string, filePath: string) {
  const s3 = getR2();
  if (!s3) throw new Error("R2 is not configured");

  const body = await readFile(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType(key),
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

export async function putR2Dir(localDir: string, keyPrefix: string) {
  const entries = await readdir(localDir);
  for (const entry of entries) {
    const full = path.join(localDir, entry);
    const info = await stat(full);
    const key = `${keyPrefix}/${entry}`;
    if (info.isDirectory()) {
      await putR2Dir(full, key);
    } else {
      await putR2File(key, full);
    }
  }
}
