-- Enforce employee status and owner-only privilege changes at the database layer.

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and status = 'active'
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'active'
      and role::text in ('owner', 'draftsperson', 'project_manager')
  )
$$;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.current_role()::text;
begin
  -- Service-role operations do not carry an end-user auth UID.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if public.is_admin() then
    -- Only an owner may create, modify, or remove an owner profile.
    if actor_role <> 'owner' and (
      (tg_op = 'INSERT' and new.role::text = 'owner')
      or (tg_op = 'UPDATE' and (old.role::text = 'owner' or new.role::text = 'owner'))
      or (tg_op = 'DELETE' and old.role::text = 'owner')
    ) then
      raise exception 'Only an owner can change owner accounts';
    end if;

    return coalesce(new, old);
  end if;

  -- Non-administrators may only activate or edit their own existing profile.
  if tg_op <> 'UPDATE' or auth.uid() <> old.id then
    raise exception 'You cannot change this employee profile';
  end if;

  if new.role is distinct from old.role then
    raise exception 'You cannot change your own role';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'invited' and new.status = 'active') then
    raise exception 'You cannot change your own account status';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_security_fields on public.profiles;
create trigger profiles_protect_security_fields
  before insert or update or delete on public.profiles
  for each row execute function public.protect_profile_security_fields();

-- Disabled and not-yet-activated employees cannot use membership policies.
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select
  using (public.is_active_user());

drop policy if exists members_read_own on public.project_members;
create policy members_read_own on public.project_members for select
  using (
    public.is_active_user()
    and (profile_id = auth.uid() or public.is_admin())
  );

create or replace function public.can_access_drawing(p_drawing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1
    from public.drawings d
    where d.id = p_drawing_id
      and (
        public.is_admin()
        or exists (
          select 1
          from public.project_members m
          where m.project_id = d.project_id and m.profile_id = auth.uid()
        )
      )
  )
$$;

drop policy if exists avatars_own_write on storage.objects;
create policy avatars_own_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.is_active_user()
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_active_user()
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_active_user()
    and auth.uid()::text = (storage.foldername(name))[1]
  );
