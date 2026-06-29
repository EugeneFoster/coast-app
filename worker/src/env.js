function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  // Original PDFs live in this private Supabase Storage bucket.
  pdfBucket: process.env.PDF_BUCKET || "project-drawings",

  // R2 (S3 API) for tiles/thumbs/previews.
  r2Bucket: process.env.R2_BUCKET || "coast-tiles",
  r2Endpoint: required("R2_ENDPOINT"), // https://<accountid>.r2.cloudflarestorage.com
  r2AccessKeyId: required("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: required("R2_SECRET_ACCESS_KEY"),

  // Redis is OPTIONAL. The default worker mode (poll.js) claims work straight
  // from Postgres (drawings.status = 'processing'), so no broker is needed.
  // Redis is only used by the legacy queue mode (index.js).
  redisUrl: process.env.REDIS_URL,
  queueName: process.env.QUEUE_NAME || "tile",
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),

  // Tiling tuning.
  targetLongEdge: Number(process.env.TILE_TARGET_LONG_EDGE || 6000),
  maxLongEdge: Number(process.env.TILE_MAX_LONG_EDGE || 10000),
  minDpi: Number(process.env.TILE_MIN_DPI || 150),
  maxDpi: Number(process.env.TILE_MAX_DPI || 600),
  tileSize: Number(process.env.TILE_SIZE || 256),
  tileOverlap: Number(process.env.TILE_OVERLAP || 1),
  webpQuality: Number(process.env.TILE_WEBP_Q || 82),
};
