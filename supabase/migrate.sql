-- Idempotent migrations + demo seed. Safe to run on every deploy.

-- New project fields used by the UI.
alter table public.projects add column if not exists revision integer not null default 1;
alter table public.projects add column if not exists drawing_count integer not null default 0;
alter table public.projects add column if not exists structure_type text;

-- Create-project flow: 3D model path + drawings table.
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

-- Deep-zoom drawings: status/version + per-page tile pyramid rows.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'drawing_status') then
    create type drawing_status as enum ('processing', 'ready', 'failed');
  end if;
end $$;

alter table public.drawings add column if not exists status     drawing_status not null default 'processing';
alter table public.drawings add column if not exists version    int not null default 1;
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

-- Project gallery (photos + videos uploaded by the team).
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

-- Private gallery storage bucket.
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

-- ============================================================================
-- Phase 1: Drawing pins (anchored annotations / questions) + threaded comments.
-- Closes the "Ask" loop in the drawing viewer: a region on a sheet becomes a
-- persistent, resolvable discussion between the shop floor and the drafter.
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pin_status') then
    create type pin_status as enum ('open', 'resolved');
  end if;
end $$;

create table if not exists public.drawing_pins (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  drawing_id  uuid not null references public.drawings(id) on delete cascade,
  version     int  not null default 1,
  page_no     int  not null,
  -- Normalized bounding box (0..1) relative to the page image.
  bx          double precision not null,
  "by"        double precision not null,
  bw          double precision not null,
  bh          double precision not null,
  body        text,
  status      pin_status not null default 'open',
  created_by  uuid references public.profiles(id),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists drawing_pins_drawing_idx on public.drawing_pins(drawing_id);
create index if not exists drawing_pins_project_idx on public.drawing_pins(project_id);

create table if not exists public.pin_comments (
  id         uuid primary key default gen_random_uuid(),
  pin_id     uuid not null references public.drawing_pins(id) on delete cascade,
  body       text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists pin_comments_pin_idx on public.pin_comments(pin_id);

alter table public.drawing_pins enable row level security;
alter table public.pin_comments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'drawing_pins' and policyname = 'pins_read'
  ) then
    create policy pins_read on public.drawing_pins for select using (
      public.is_admin()
      or exists (
        select 1 from public.project_members m
        where m.project_id = drawing_pins.project_id and m.profile_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'drawing_pins' and policyname = 'pins_insert'
  ) then
    create policy pins_insert on public.drawing_pins for insert with check (
      created_by = auth.uid()
      and (
        public.is_admin()
        or exists (
          select 1 from public.project_members m
          where m.project_id = drawing_pins.project_id and m.profile_id = auth.uid()
        )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'drawing_pins' and policyname = 'pins_update'
  ) then
    create policy pins_update on public.drawing_pins for update using (
      public.is_admin()
      or exists (
        select 1 from public.project_members m
        where m.project_id = drawing_pins.project_id and m.profile_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'drawing_pins' and policyname = 'pins_delete'
  ) then
    create policy pins_delete on public.drawing_pins for delete using (
      public.is_admin() or created_by = auth.uid()
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pin_comments' and policyname = 'pin_comments_read'
  ) then
    create policy pin_comments_read on public.pin_comments for select using (
      exists (
        select 1 from public.drawing_pins p
        where p.id = pin_comments.pin_id and (
          public.is_admin()
          or exists (
            select 1 from public.project_members m
            where m.project_id = p.project_id and m.profile_id = auth.uid()
          )
        )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pin_comments' and policyname = 'pin_comments_insert'
  ) then
    create policy pin_comments_insert on public.pin_comments for insert with check (
      created_by = auth.uid()
      and exists (
        select 1 from public.drawing_pins p
        where p.id = pin_comments.pin_id and (
          public.is_admin()
          or exists (
            select 1 from public.project_members m
            where m.project_id = p.project_id and m.profile_id = auth.uid()
          )
        )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pin_comments' and policyname = 'pin_comments_delete'
  ) then
    create policy pin_comments_delete on public.pin_comments for delete using (
      public.is_admin() or created_by = auth.uid()
    );
  end if;
end $$;

-- ============================================================================
-- Phase 2: Tasks / work items. Gives the shop floor a way to report progress
-- inside the system; owners/drafters assign, welders update status.
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type task_status as enum ('todo', 'in_progress', 'blocked', 'done');
  end if;
end $$;

create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  title          text not null,
  description    text,
  status         task_status not null default 'todo',
  assignee_id    uuid references public.profiles(id) on delete set null,
  drawing_pin_id uuid references public.drawing_pins(id) on delete set null,
  due_date       date,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists tasks_project_idx  on public.tasks(project_id);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_tasks_touch'
  ) then
    create trigger trg_tasks_touch before update on public.tasks
      for each row execute function public.touch_updated_at();
  end if;
end $$;

alter table public.tasks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_read'
  ) then
    create policy tasks_read on public.tasks for select using (
      public.is_admin()
      or exists (
        select 1 from public.project_members m
        where m.project_id = tasks.project_id and m.profile_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_admin'
  ) then
    create policy tasks_admin on public.tasks
      for all using (public.is_admin()) with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_member_update'
  ) then
    create policy tasks_member_update on public.tasks for update using (
      exists (
        select 1 from public.project_members m
        where m.project_id = tasks.project_id and m.profile_id = auth.uid()
      )
    );
  end if;
end $$;

-- Demo data: only when the project table is still empty.
do $$
declare
  c_coastal uuid;
  c_gibsons uuid;
  c_sunshine uuid;
  c_private uuid;
  c_pender uuid;
  c_westcoast uuid;
begin
  if not exists (select 1 from public.projects) then
    insert into public.clients (name) values ('Coastal Marine Ltd') returning id into c_coastal;
    insert into public.clients (name) values ('Gibsons Harbour') returning id into c_gibsons;
    insert into public.clients (name) values ('Sunshine Docks Inc') returning id into c_sunshine;
    insert into public.clients (name) values ('Private') returning id into c_private;
    insert into public.clients (name) values ('Pender Harbour') returning id into c_pender;
    insert into public.clients (name) values ('West Coast Marine') returning id into c_westcoast;

    insert into public.projects
      (name, client_id, status, revision, drawing_count, structure_type, description)
    values
      ('Dock · Roberts Creek',  c_coastal,   'in_progress', 3, 5, 'dock',    'Floating dock with aluminium gangway.'),
      ('Wharf · Gibsons',       c_gibsons,   'in_review',   2, 4, 'wharf',   'Timber-decked commercial wharf upgrade.'),
      ('Pontoon · Sechelt',     c_sunshine,  'in_progress', 1, 6, 'pontoon', 'Concrete pontoon array for marina expansion.'),
      ('Dock · Halfmoon Bay',   c_private,   'completed',   4, 5, 'dock',    'Private residential dock and ramp.'),
      ('Ramp · Pender',         c_pender,    'planned',     1, 3, 'ramp',    'Vehicle launch ramp with abutment works.'),
      ('Pontoon · Egmont',      c_westcoast, 'completed',   3, 4, 'pontoon', 'Pontoon refit and reanchoring.');
  end if;
end $$;
