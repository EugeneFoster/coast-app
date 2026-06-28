# COAST — metal works

Field app foundation slice: authentication, role-based access, and project CRUD.

## Stack

- **Next.js 16** (App Router, TypeScript, Node.js runtime)
- **Tailwind CSS 4**
- **Supabase** (Postgres, Auth, Storage, RLS)
- **Cloudflare Workers** via `@opennextjs/cloudflare`

## Getting started

1. Copy `.env.example` to `.env.local` and fill in Supabase credentials.
2. Add `SUPABASE_DB_PASSWORD` (or `SUPABASE_ACCESS_TOKEN`) to GitHub secrets.
   Deploy workflow applies `supabase/setup-all.sql` automatically.
3. Deploy the app (GitHub Actions or `npm run deploy`).
   Configured accounts from GitHub secrets are created automatically on first login.

4. Install and run locally:

```bash
npm install
npm run dev
```

## Deploy (Cloudflare Workers)

```bash
npm run preview   # local Workers preview
npm run deploy    # deploy to Cloudflare
```

`npm run deploy` uses Wrangler minification to fit Cloudflare free-tier Worker size limits.
The free-tier profile currently disables employee invitation activation flows (`/settings/employees` and `/invite/[token]`).

Connect the GitHub repo in Cloudflare → **Workers & Pages → Workers Builds**:

- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy --minify`

Add all env vars under **Build variables and secrets**.

### Deploy via GitHub Actions (no manual Cloudflare UI env input)

This repository includes `.github/workflows/deploy-cloudflare.yml`.

- Push to `main` to deploy automatically.
- Or run **Actions → Deploy Cloudflare Worker → Run workflow**.

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The deploy workflow uploads these secrets to the Worker runtime via Wrangler (`scripts/sync-worker-secrets.sh`), so you do not need to enter them manually in Cloudflare UI.

Optional repository secrets (for auto-bootstrap logins):

- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_LOGIN`
- `ADMIN_PASSWORD`
- `DRAW_LOGIN`
- `DRAW_PASSWORD`

Automatic Supabase schema setup during deploy needs one of:

- `SUPABASE_DB_PASSWORD` (database password from Supabase → Project Settings → Database)
- `SUPABASE_ACCESS_TOKEN` (personal access token from Supabase account settings)
- `DATABASE_URL` (full Postgres connection string)

## Roles

| Role | Access |
|------|--------|
| owner / draftsperson | Full admin — projects, employees, invites |
| welder | Read-only on assigned projects only |

RLS enforces access at the database layer.
