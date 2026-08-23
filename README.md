# COAST — metal works

Operations CRM for marine fabrication and service: employee access, project teams,
drawings, markups, chat, and project management.

## Stack

- **Next.js 16** (App Router, TypeScript, Node.js runtime)
- **Tailwind CSS 4**
- **Supabase** (Postgres, Auth, Storage, RLS)
- **Railway** (Node container deploy)

## Local development

```bash
npm install
npm run dev
```

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_DB_PASSWORD=...
ADMIN_LOGIN=...
ADMIN_PASSWORD=...
DRAW_LOGIN=...
DRAW_PASSWORD=...
```

Apply the database schema + demo seed locally:

```bash
npm run db:setup
```

## Deploy (Railway)

Railway builds with Nixpacks (auto-detected):

- **Build**: `npm run build` (`next build`)
- **Start**: `npm run start` (`next start`, binds to Railway's `$PORT`)

Railway auto-deploys on every push to `main` via the connected GitHub repo.

### Database schema

The Supabase schema and demo seed are applied with:

```bash
npm run db:setup   # runs scripts/apply-supabase-schema.mjs
```

Run this once (or after editing `supabase/migrate.sql`) with `SUPABASE_DB_PASSWORD`
set. It is intentionally **not** part of the deploy so a transient DB hiccup can
never block an app deploy.

### Production database safety

Before applying a production migration, save an application-data and schema
catalog snapshot outside the repository:

```bash
railway run -- npm run db:backup -- /private/tmp/coast-backup
```

Check a migration sequence inside a transaction that is always rolled back:

```bash
railway run -- npm run db:check-migration -- supabase/migrations/<migration>.sql
```

Verify required tables, storage buckets, migration history, and denormalized
drawing counts after a migration:

```bash
railway run -- npm run db:verify
```

Exercise the employee-access guardrails against the production database inside
transactions that are rolled back:

```bash
railway run -- npm run db:check-employee-security
```

### Required Railway Variables

Add these under the service's **Variables** tab:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (account bootstrap) |
| `SUPABASE_DB_PASSWORD` | Postgres password (auto schema/migrations) |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | Seed owner account |
| `DRAW_LOGIN` / `DRAW_PASSWORD` | Seed draftsperson account |
| `REDIS_URL` | Redis connection (optional — inline tiling runs on web service when unset) |
| `QUEUE_NAME` | `tile` (optional, for separate worker service) |
| `R2_ENDPOINT` | **Required for drawings** — Cloudflare R2 endpoint |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | **Required for drawings** |
| `R2_BUCKET` | `coast-tiles` (optional) |

Configured accounts (`ADMIN_*`, `DRAW_*`) are created/synced automatically on first sign-in.

### Drawing tiles

**Default (no Redis):** the web service tiles PDFs inline using `poppler-utils` + `libvips`
(root `Dockerfile` or `nixpacks.toml`). Tiles are stored in Supabase Storage bucket
`drawing-tiles` (or Cloudflare R2 when `R2_*` is set).

**Optional worker:** for heavy load, add Redis + a second service with root directory
`worker/` (see `worker/README.md`). Jobs enqueue to Redis when `REDIS_URL` is set.

## Auth

Server-side Supabase SSR auth. `src/proxy.ts` refreshes the session cookie on every
request; sign-in is a server action (`src/lib/actions/auth.ts`).

## Roles

| Role | Access |
|------|--------|
| owner | Full access, including management of other owner accounts |
| draftsperson / project_manager | Project and employee administration |
| sales / parts / accounting | CRM roles prepared for the next workflow stages |
| welder / painter / mechanic / installer | Assigned project access |

Employees are invited from **Settings → Employees**, where administrators assign
roles, job titles, phone numbers, trade specialties, and account status. RLS and a
database trigger enforce access and prevent employees from promoting their own
accounts.
