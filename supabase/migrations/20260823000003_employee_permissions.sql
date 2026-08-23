-- Extend administrator access while preventing self-service privilege changes.

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role()::text in ('owner', 'draftsperson', 'project_manager')
$$;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role operations and administrator changes remain unrestricted.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if auth.uid() = old.id then
    if new.role is distinct from old.role then
      raise exception 'You cannot change your own role';
    end if;

    if new.status is distinct from old.status
       and not (old.status = 'invited' and new.status = 'active') then
      raise exception 'You cannot change your own account status';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_security_fields on public.profiles;
create trigger profiles_protect_security_fields
  before update on public.profiles
  for each row execute function public.protect_profile_security_fields();

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role());
