-- helper: role of the current user (SECURITY DEFINER avoids recursive RLS on profiles)
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

-- profiles: read own; admins read all; admins write; users update own avatar/name
create policy profiles_read_own   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin_all  on public.profiles for all    using (public.is_admin()) with check (public.is_admin());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- clients: admins manage; welders can read (needed to render project client name)
create policy clients_read  on public.clients for select using (auth.uid() is not null);
create policy clients_admin on public.clients for all    using (public.is_admin()) with check (public.is_admin());

-- projects: admins full; welders read only projects they are assigned to
create policy projects_admin on public.projects for all using (public.is_admin()) with check (public.is_admin());
create policy projects_member_read on public.projects for select using (
  public.is_admin()
  or exists (select 1 from public.project_members m where m.project_id = id and m.profile_id = auth.uid())
);

-- membership: admins manage; a welder can read their own rows
create policy members_admin on public.project_members for all using (public.is_admin()) with check (public.is_admin());
create policy members_read_own on public.project_members for select using (profile_id = auth.uid() or public.is_admin());
