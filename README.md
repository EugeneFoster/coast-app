# COAST — metal works

Field app foundation slice: authentication, role-based access, and project CRUD.

## Stack

- **Next.js 16** (App Router, TypeScript, Node.js runtime)
- **Tailwind CSS 4**
- **Supabase** (Postgres, Auth, Storage, RLS)
- **Cloudflare Workers** via `@opennextjs/cloudflare`

## Getting started

1. Copy `.env.example` to `.env.local` and fill in Supabase credentials.
2. Run migrations in `supabase/migrations/` against your Supabase project.
3. Create the first admin user manually in Supabase Auth, then insert a profile row:

```sql
insert into public.profiles (id, login, role, status, full_name)
values ('<auth-user-uuid>', 'admin@example.com', 'owner', 'active', 'Admin');
```

4. Install and run:

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
- Deploy command: `npx opennextjs-cloudflare deploy`

Add all env vars under **Build variables and secrets**.

## Roles

| Role | Access |
|------|--------|
| owner / draftsperson | Full admin — projects, employees, invites |
| welder | Read-only on assigned projects only |

RLS enforces access at the database layer.
