-- Deep-zoom drawings: status/version on drawings + per-page tile pyramid rows.
-- Run once in Supabase → SQL Editor. Idempotent.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'drawing_status') then
    create type drawing_status as enum ('processing', 'ready', 'failed');
  end if;
end $$;

alter table public.drawings add column if not exists status     drawing_status not null default 'processing';
alter table public.drawings add column if not exists version    int not null default 1;
alter table public.drawings add column if not exists page_count int;
alter table public.drawings add column if not exists error      text;

create table if not exists public.drawing_pages (
  id           uuid primary key default gen_random_uuid(),
  drawing_id   uuid not null references public.drawings(id) on delete cascade,
  page_no      int  not null,
  width        int  not null,
  height       int  not null,
  dzi_key      text not null,
  tiles_prefix text not null,
  thumb_key    text not null,
  preview_key  text not null,
  created_at   timestamptz not null default now(),
  unique (drawing_id, page_no)
);

alter table public.drawing_pages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'drawing_pages' and policyname = 'pages_member_read'
  ) then
    create policy pages_member_read on public.drawing_pages for select using (
      exists (
        select 1 from public.drawings d
        where d.id = drawing_id and (
          public.is_admin()
          or exists (
            select 1 from public.project_members m
            where m.project_id = d.project_id and m.profile_id = auth.uid()
          )
        )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'drawing_pages' and policyname = 'pages_admin_all'
  ) then
    create policy pages_admin_all on public.drawing_pages
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
