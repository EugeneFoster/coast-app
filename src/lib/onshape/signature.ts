import { createHmac } from "node:crypto";

export function createOnshapeAuthorization({
  method,
  url,
  nonce,
  date,
  contentType,
  accessKey,
  secretKey,
}: {
  method: string;
  url: string;
  nonce: string;
  date: string;
  contentType: string;
  accessKey: string;
  secretKey: string;
}) {
  const parsed = new URL(url);
  const signingString = [
    method,
    nonce,
    date,
    contentType,
    parsed.pathname,
    parsed.search.slice(1),
    "",
  ]
    .join("\n")
    .toLowerCase();
  const signature = createHmac("sha256", secretKey)
    .update(signingString)
    .digest("base64");
  return `On ${accessKey}:HmacSHA256:${signature}`;
}

