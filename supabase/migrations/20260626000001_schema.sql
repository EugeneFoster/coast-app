-- == enums ==
create type user_role     as enum ('owner', 'draftsperson', 'welder');
create type user_status    as enum ('invited', 'active', 'disabled');
create type project_status as enum ('planned', 'in_progress', 'in_review', 'completed', 'archived');

-- == profiles (1:1 with auth.users) ==
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

-- == clients ==
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- == projects ==
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

-- == project membership (which welders are assigned) ==
create table public.project_members (
  project_id  uuid references public.projects(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete cascade,
  primary key (project_id, profile_id)
);

-- == updated_at trigger ==
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_profiles_touch  before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trg_projects_touch  before update on public.projects for each row execute function public.touch_updated_at();
