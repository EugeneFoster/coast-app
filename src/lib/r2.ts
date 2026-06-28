import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

let client: S3Client | null = null;

export function getR2(): S3Client | null {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

export const R2_BUCKET = process.env.R2_BUCKET || "coast-tiles";

export async function getR2Object(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const s3 = getR2();
  if (!s3) return null;
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    );
    if (!res.Body) return null;
    const body = await res.Body.transformToByteArray();
    return {
      body,
      contentType: res.ContentType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}
