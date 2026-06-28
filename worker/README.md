# COAST tiling worker

Standalone Node service that turns uploaded PDFs into DZI tile pyramids for the
deep-zoom drawings viewer.

Pipeline per job `{ drawingId, version, pdfStorageKey }`:

1. Download the original PDF from Supabase Storage (service role).
2. Per page: `pdftoppm` high-res raster → `vips dzsave` DZI pyramid → `vips thumbnail` thumb (160px) + preview (1500px).
3. Upload `.dzi` + `_files/` tree + `thumb.webp` + `preview.webp` to R2 under `drawings/{drawingId}/v{version}/p{page}/`.
4. Insert `drawing_pages` rows and set `drawings.status='ready'` (or `failed` + `error`).

Idempotent: re-running a `{drawingId, version}` overwrites the same R2 keys and
replaces the `drawing_pages` rows.

## Requirements

Native binaries (provided by the Dockerfile): `poppler-utils`, `libvips-tools`.

## Environment

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PDF_BUCKET=project-drawings        # optional, default
R2_BUCKET=coast-tiles              # optional, default
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
REDIS_URL
QUEUE_NAME=tile                    # optional, must match the app enqueue
# tuning (optional)
TILE_TARGET_LONG_EDGE=6000
TILE_MAX_LONG_EDGE=10000
TILE_MIN_DPI=150
TILE_MAX_DPI=600
TILE_SIZE=256
TILE_OVERLAP=1
TILE_WEBP_Q=82
TILE_CONCURRENCY=2
```

## Deploy on Railway

Create a **second service** in the same Railway project pointed at this repo with
**Root Directory = `worker`** (Dockerfile build). Add the env vars above
(`SUPABASE_*`, `R2_*`, `REDIS_URL`). Add a Redis plugin and reference its
`REDIS_URL`.

## Local one-off test

```
node src/run-once.js <drawingId> <version> <pdfStorageKey>
```
