-- Run this once in Supabase Dashboard -> SQL Editor.
-- Applies all migrations from supabase/migrations/ in order.

-- == 20260626000001_schema.sql ==
create type user_role     as enum ('owner', 'draftsperson', 'welder');
create type user_status    as enum ('invited', 'active', 'disabled');
create type project_status as enum ('planned', 'in_progress', 'in_review', 'completed', 'archived');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  login       text unique not null,
  role        user_role   not null default 'welder',
  status      user_status not null default 'invited',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  client_id    uuid references public.clients(id) on delete set null,
  description  text,
  status       project_status not null default 'planned',
  cover_url    text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.project_members (
  project_id  uuid references public.projects(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete cascade,
  primary key (project_id, profile_id)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_profiles_touch  before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trg_projects_touch  before update on public.projects for each row execute function public.touch_updated_at();

-- == 20260626000002_rls.sql ==
create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role() in ('owner','draftsperson')
$$;

alter table public.profiles        enable row level security;
alter table public.clients         enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;

create policy profiles_read_own   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin_all  on public.profiles for all    using (public.is_admin()) with check (public.is_admin());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy clients_read  on public.clients for select using (auth.uid() is not null);
create policy clients_admin on public.clients for all    using (public.is_admin()) with check (public.is_admin());

create policy projects_admin on public.projects for all using (public.is_admin()) with check (public.is_admin());
create policy projects_member_read on public.projects for select using (
  public.is_admin()
  or exists (select 1 from public.project_members m where m.project_id = id and m.profile_id = auth.uid())
);

create policy members_admin on public.project_members for all using (public.is_admin()) with check (public.is_admin());
create policy members_read_own on public.project_members for select using (profile_id = auth.uid() or public.is_admin());

-- == 20260626000003_storage.sql ==
insert into storage.buckets (id, name, public) values
  ('project-covers', 'project-covers', true),
  ('project-models', 'project-models', false),
  ('project-drawings', 'project-drawings', false),
  ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

create policy avatars_own_write on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy avatars_own_update on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy avatars_own_delete on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy covers_public_read on storage.objects
  for select using (bucket_id = 'project-covers');

create policy covers_admin_write on storage.objects
  for all using (bucket_id = 'project-covers' and public.is_admin())
  with check (bucket_id = 'project-covers' and public.is_admin());

create policy models_admin on storage.objects
  for all using (bucket_id = 'project-models' and public.is_admin())
  with check (bucket_id = 'project-models' and public.is_admin());

create policy drawings_admin on storage.objects
  for all using (bucket_id = 'project-drawings' and public.is_admin())
  with check (bucket_id = 'project-drawings' and public.is_admin());
