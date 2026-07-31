-- Drawing markups: pins, areas, threads on deep-zoom sheets.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'markup_kind') then
    create type markup_kind as enum ('pin', 'area', 'ink');
  end if;
  if not exists (select 1 from pg_type where typname = 'markup_status') then
    create type markup_status as enum ('open', 'answered', 'resolved');
  end if;
end $$;

create table if not exists public.drawing_markups (
  id              uuid primary key default gen_random_uuid(),
  drawing_id      uuid not null references public.drawings(id) on delete cascade,
  version         int  not null,
  page_no         int  not null,
  kind            markup_kind   not null,
  x               real not null,
  y               real not null,
  w               real,
  h               real,
  path            jsonb,
  color           text,
  stroke_width    real,
  opacity         real not null default 1,
  status          markup_status not null default 'open',
  title           text,
  created_by      uuid references public.profiles(id),
  carried_from_id uuid references public.drawing_markups(id) on delete set null,
  needs_review    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.markup_comments (
  id         uuid primary key default gen_random_uuid(),
  markup_id  uuid not null references public.drawing_markups(id) on delete cascade,
  body       text not null,
  author     uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.markup_photos (
  id          uuid primary key default gen_random_uuid(),
  markup_id   uuid not null references public.drawing_markups(id) on delete cascade,
  comment_id  uuid references public.markup_comments(id) on delete set null,
  file_path   text not null,
  uploaded_by uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists drawing_markups_drawing_version_idx
  on public.drawing_markups (drawing_id, version, page_no);

create index if not exists markup_comments_markup_idx
  on public.markup_comments (markup_id, created_at);

create index if not exists markup_photos_markup_idx
  on public.markup_photos (markup_id);

alter table public.drawing_markups enable row level security;
alter table public.markup_comments enable row level security;
alter table public.markup_photos enable row level security;

-- updated_at trigger
create or replace function public.set_markup_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists drawing_markups_updated_at on public.drawing_markups;
create trigger drawing_markups_updated_at
  before update on public.drawing_markups
  for each row execute function public.set_markup_updated_at();

-- Helper: project member or admin for a drawing
create or replace function public.can_access_drawing(p_drawing_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.drawings d
    where d.id = p_drawing_id
      and (
        public.is_admin()
        or exists (
          select 1 from public.project_members m
          where m.project_id = d.project_id and m.profile_id = auth.uid()
        )
      )
  );
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'drawing_markups'
      and policyname = 'markups_member_read'
  ) then
    create policy markups_member_read on public.drawing_markups for select
      using (public.can_access_drawing(drawing_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'drawing_markups'
      and policyname = 'markups_member_insert'
  ) then
    create policy markups_member_insert on public.drawing_markups for insert
      with check (
        public.can_access_drawing(drawing_id)
        and created_by = auth.uid()
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'drawing_markups'
      and policyname = 'markups_member_update'
  ) then
    create policy markups_member_update on public.drawing_markups for update
      using (public.can_access_drawing(drawing_id))
      with check (
        public.can_access_drawing(drawing_id)
        and (
          public.is_admin()
          or status <> 'resolved'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'markup_comments'
      and policyname = 'markup_comments_member_read'
  ) then
    create policy markup_comments_member_read on public.markup_comments for select
      using (
        exists (
          select 1 from public.drawing_markups mk
          where mk.id = markup_id and public.can_access_drawing(mk.drawing_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'markup_comments'
      and policyname = 'markup_comments_member_insert'
  ) then
    create policy markup_comments_member_insert on public.markup_comments for insert
      with check (
        author = auth.uid()
        and exists (
          select 1 from public.drawing_markups mk
          where mk.id = markup_id and public.can_access_drawing(mk.drawing_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'markup_photos'
      and policyname = 'markup_photos_member_read'
  ) then
    create policy markup_photos_member_read on public.markup_photos for select
      using (
        exists (
          select 1 from public.drawing_markups mk
          where mk.id = markup_id and public.can_access_drawing(mk.drawing_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'markup_photos'
      and policyname = 'markup_photos_member_insert'
  ) then
    create policy markup_photos_member_insert on public.markup_photos for insert
      with check (
        uploaded_by = auth.uid()
        and exists (
          select 1 from public.drawing_markups mk
          where mk.id = markup_id and public.can_access_drawing(mk.drawing_id)
        )
      );
  end if;
end $$;

-- Private markup photos bucket
insert into storage.buckets (id, name, public)
values ('markup-photos', 'markup-photos', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'markup_photos_obj_read'
  ) then
    create policy markup_photos_obj_read on storage.objects for select to authenticated using (
      bucket_id = 'markup-photos'
      and (
        public.is_admin()
        or exists (
          select 1 from public.drawing_markups mk
          join public.drawings d on d.id = mk.drawing_id
          join public.project_members m on m.project_id = d.project_id
          where mk.id::text = (storage.foldername(name))[1]
            and m.profile_id = auth.uid()
        )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'markup_photos_obj_write'
  ) then
    create policy markup_photos_obj_write on storage.objects for insert to authenticated with check (
      bucket_id = 'markup-photos'
      and (
        public.is_admin()
        or exists (
          select 1 from public.drawing_markups mk
          join public.drawings d on d.id = mk.drawing_id
          join public.project_members m on m.project_id = d.project_id
          where mk.id::text = (storage.foldername(name))[1]
            and m.profile_id = auth.uid()
        )
      )
    );
  end if;
end $$;
