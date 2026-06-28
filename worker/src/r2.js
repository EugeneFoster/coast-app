import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env.js";

export const s3 = new S3Client({
  region: "auto",
  endpoint: env.r2Endpoint,
  credentials: {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
  },
});

const CONTENT_TYPES = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".dzi": "application/xml",
  ".xml": "application/xml",
};

function contentType(key) {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] || "application/octet-stream";
}

export async function putFile(key, filePath, { immutable = true } = {}) {
  const body = await readFile(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      Body: body,
      ContentType: contentType(key),
      CacheControl: immutable
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
    }),
  );
}

// Recursively upload a local directory tree under a key prefix.
export async function putDir(localDir, keyPrefix) {
  const entries = await readdir(localDir);
  for (const entry of entries) {
    const full = path.join(localDir, entry);
    const info = await stat(full);
    const key = `${keyPrefix}/${entry}`;
    if (info.isDirectory()) {
      await putDir(full, key);
    } else {
      await putFile(key, full);
    }
  }
}
