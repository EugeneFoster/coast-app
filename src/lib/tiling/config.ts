export const tilingConfig = {
  pdfBucket: process.env.PDF_BUCKET || "project-drawings",
  targetLongEdge: Number(process.env.TILE_TARGET_LONG_EDGE || 6000),
  maxLongEdge: Number(process.env.TILE_MAX_LONG_EDGE || 10000),
  minDpi: Number(process.env.TILE_MIN_DPI || 150),
  maxDpi: Number(process.env.TILE_MAX_DPI || 600),
  tileSize: Number(process.env.TILE_SIZE || 256),
  tileOverlap: Number(process.env.TILE_OVERLAP || 1),
  webpQuality: Number(process.env.TILE_WEBP_Q || 82),
};
