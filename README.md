# COAST — metal works

Field app for coastal metal fabrication: authentication, role-based access, and project management.

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

The repo is configured for Railway via `railway.json` (Nixpacks builder):

- **Build**: `next build` (Nixpacks auto-detects)
- **Pre-deploy**: `node scripts/apply-supabase-schema.mjs` — applies `supabase/setup-all.sql`
  (first run) and `supabase/migrate.sql` (idempotent migrations + demo seed) on every deploy
- **Start**: `next start` (binds to Railway's `$PORT`)

Railway auto-deploys on every push to `main` via the connected GitHub repo.

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

Configured accounts (`ADMIN_*`, `DRAW_*`) are created/synced automatically on first sign-in.

## Auth

Server-side Supabase SSR auth. `src/proxy.ts` refreshes the session cookie on every
request; sign-in is a server action (`src/lib/actions/auth.ts`).

## Roles

| Role | Access |
|------|--------|
| owner / draftsperson | Full admin — projects |
| welder | Read-only on assigned projects only |

RLS enforces access at the database layer.
