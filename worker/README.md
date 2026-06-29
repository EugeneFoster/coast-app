# COAST tiling worker

Standalone Node service that turns uploaded PDFs into DZI tile pyramids for the
deep-zoom drawings viewer.

## Modes

- **Polling (default, no Redis):** `src/poll.js` claims work straight from
  Postgres — any `drawings` row with `status = 'processing'`. The app never
  needs Redis; uploading/re-uploading a drawing sets it to `processing` and the
  worker picks it up. Assumes a single worker instance.
- **Queue (optional, Redis/BullMQ):** `src/index.js` consumes a Redis queue.
  Only needed if you want multiple workers / a real broker. Requires `REDIS_URL`
  on both the app and the worker.

Pipeline per drawing `{ drawingId, version, pdfStorageKey }`:

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
# polling mode (default)
POLL_INTERVAL_MS=5000              # optional, default
# queue mode only (optional)
REDIS_URL                          # only if running src/index.js
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
**Root Directory = `worker`** (Dockerfile build). Add `SUPABASE_*` and `R2_*`
env vars. **No Redis is required** — the default `src/poll.js` reads pending work
from Postgres. (Only add a Redis plugin + `REDIS_URL` if you switch to the
queue mode by overriding the start command to `node src/index.js`.)

## Local one-off test

```
node src/run-once.js <drawingId> <version> <pdfStorageKey>
```
