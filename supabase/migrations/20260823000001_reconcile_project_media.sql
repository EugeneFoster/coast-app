-- P0 production reconciliation.
--
-- The initial production database was created with setup-all.sql + migrate.sql,
-- before every incremental change had a versioned migration. This migration
-- makes the project media schema reproducible without deleting existing data.

alter table public.projects add column if not exists revision integer not null default 1;
alter table public.projects add column if not exists drawing_count integer not null default 0;
alter table public.projects add column if not exists structure_type text;
alter table public.projects add column if not exists model_url text;

create table if not exists public.drawings (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.projects(id) on delete cascade,
  file_path     text not null,
  original_name text,
  page_count    int,
  uploaded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

alter table public.drawings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'drawings' and policyname = 'drawings_admin'
  ) then
    create policy drawings_admin on public.drawings
      for all using (public.is_admin()) with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'drawings' and policyname = 'drawings_member_read'
  ) then
    create policy drawings_member_read on public.drawings
      for select using (
        public.is_admin()
        or exists (
          select 1 from public.project_members m
          where m.project_id = drawings.project_id and m.profile_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'drawing_status') then
    create type drawing_status as enum ('processing', 'ready', 'failed');
  end if;
end $$;

alter table public.drawings add column if not exists status drawing_status not null default 'processing';
alter table public.drawings add column if not exists version int not null default 1;
alter table public.drawings add column if not exists error text;

create table if not exists public.drawing_pages (
  id           uuid primary key default gen_random_uuid(),
  drawing_id   uuid not null references public.drawings(id) on delete cascade,
  page_no      int not null,
  width        int not null,
  height       int not null,
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

create table if not exists public.gallery_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id) on delete cascade,
  file_path   text not null,
  media_type  text not null check (media_type in ('photo', 'video')),
  uploaded_by uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

alter table public.gallery_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gallery_items' and policyname = 'gallery_read'
  ) then
    create policy gallery_read on public.gallery_items for select using (
      public.is_admin()
      or exists (
        select 1 from public.project_members m
        where m.project_id = gallery_items.project_id and m.profile_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gallery_items' and policyname = 'gallery_insert'
  ) then
    create policy gallery_insert on public.gallery_items for insert with check (
      uploaded_by = auth.uid()
      and (
        public.is_admin()
        or exists (
          select 1 from public.project_members m
          where m.project_id = gallery_items.project_id and m.profile_id = auth.uid()
        )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gallery_items' and policyname = 'gallery_delete'
  ) then
    create policy gallery_delete on public.gallery_items for delete using (
      public.is_admin() or uploaded_by = auth.uid()
    );
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('project-gallery', 'project-gallery', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'gallery_obj_read'
  ) then
    create policy gallery_obj_read on storage.objects for select to authenticated using (
      bucket_id = 'project-gallery'
      and (
        public.is_admin()
        or exists (
          select 1 from public.project_members m
          where m.profile_id = auth.uid()
            and m.project_id::text = (storage.foldername(name))[1]
        )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'gallery_obj_write'
  ) then
    create policy gallery_obj_write on storage.objects for insert to authenticated with check (
      bucket_id = 'project-gallery'
      and (
        public.is_admin()
        or exists (
          select 1 from public.project_members m
          where m.profile_id = auth.uid()
            and m.project_id::text = (storage.foldername(name))[1]
        )
      )
    );
  end if;
end $$;

-- The UI treats drawing_count as a denormalized count of drawing records.
update public.projects p
set drawing_count = (
  select count(*)::integer
  from public.drawings d
  where d.project_id = p.id
)
where p.drawing_count is distinct from (
  select count(*)::integer
  from public.drawings d
  where d.project_id = p.id
);
