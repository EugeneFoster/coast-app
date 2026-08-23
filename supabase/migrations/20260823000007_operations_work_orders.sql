-- P3: project work orders, crew assignments, time, and material usage.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'work_order_status') then
    create type public.work_order_status as enum (
      'planned', 'ready', 'in_progress', 'blocked', 'completed', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'work_order_priority') then
    create type public.work_order_priority as enum (
      'low', 'normal', 'high', 'urgent'
    );
  end if;
end $$;

create sequence if not exists public.work_order_number_seq start with 1001;

create or replace function public.next_work_order_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'WO-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.work_order_number_seq')::text, 4, '0')
$$;

create table if not exists public.work_orders (
  id                 uuid primary key default gen_random_uuid(),
  work_order_number  text not null unique default public.next_work_order_number(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  title              text not null,
  description        text,
  service_category   text not null default 'other' check (
    service_category in (
      'boat_repair', 'marine_fabrication', 'dock_wharf', 'boat_painting',
      'marine_mechanics', 'parts', 'cad_design', 'haul_transport', 'other'
    )
  ),
  status             public.work_order_status not null default 'planned',
  priority           public.work_order_priority not null default 'normal',
  scheduled_start    date,
  scheduled_end      date,
  estimated_hours    numeric(8,2) check (estimated_hours is null or estimated_hours >= 0),
  location           text,
  started_at         timestamptz,
  completed_at       timestamptz,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint work_orders_schedule_check check (
    scheduled_start is null
    or scheduled_end is null
    or scheduled_end >= scheduled_start
  )
);

create table if not exists public.work_order_assignments (
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  assigned_by    uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  primary key (work_order_id, profile_id)
);

create table if not exists public.time_entries (
  id             uuid primary key default gen_random_uuid(),
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  work_date      date not null default current_date,
  hours          numeric(5,2) not null check (hours > 0 and hours <= 24),
  note           text,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.material_entries (
  id             uuid primary key default gen_random_uuid(),
  work_order_id  uuid not null references public.work_orders(id) on delete cascade,
  description    text not null,
  part_number    text,
  quantity       numeric(12,3) not null check (quantity > 0),
  unit           text not null default 'ea',
  unit_cost      numeric(12,2) not null default 0 check (unit_cost >= 0),
  line_total     numeric(14,2) generated always as (
                   round(quantity * unit_cost, 2)
                 ) stored,
  entered_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists trg_work_orders_touch on public.work_orders;
create trigger trg_work_orders_touch
  before update on public.work_orders
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_time_entries_touch on public.time_entries;
create trigger trg_time_entries_touch
  before update on public.time_entries
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_material_entries_touch on public.material_entries;
create trigger trg_material_entries_touch
  before update on public.material_entries
  for each row execute function public.touch_updated_at();

create index if not exists work_orders_project_status_idx
  on public.work_orders (project_id, status, scheduled_start);
create index if not exists work_orders_schedule_idx
  on public.work_orders (scheduled_start, scheduled_end) where status not in ('completed', 'cancelled');
create index if not exists work_order_assignments_profile_idx
  on public.work_order_assignments (profile_id, work_order_id);
create index if not exists time_entries_work_order_date_idx
  on public.time_entries (work_order_id, work_date desc);
create index if not exists time_entries_profile_date_idx
  on public.time_entries (profile_id, work_date desc);
create index if not exists material_entries_work_order_idx
  on public.material_entries (work_order_id, created_at desc);

create or replace function public.can_manage_operations()
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
      and role::text in ('owner', 'project_manager', 'draftsperson')
  )
$$;

create or replace function public.can_view_work_order(p_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and actor.status = 'active'
      and (
        actor.role::text in ('owner', 'project_manager', 'draftsperson', 'accounting')
        or exists (
          select 1
          from public.work_order_assignments a
          where a.work_order_id = p_work_order_id
            and a.profile_id = actor.id
        )
        or exists (
          select 1
          from public.work_orders w
          join public.project_members m on m.project_id = w.project_id
          where w.id = p_work_order_id
            and m.profile_id = actor.id
        )
      )
  )
$$;

create or replace function public.can_log_work_order(p_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_operations() or exists (
    select 1
    from public.profiles actor
    join public.work_order_assignments a on a.profile_id = actor.id
    where actor.id = auth.uid()
      and actor.status = 'active'
      and actor.role::text in (
        'owner', 'project_manager', 'draftsperson', 'welder', 'painter',
        'mechanic', 'installer', 'parts'
      )
      and a.work_order_id = p_work_order_id
  )
$$;

create or replace function public.operations_employee_directory()
returns table (
  id uuid,
  full_name text,
  login text,
  role public.user_role,
  specialties public.employee_specialty[]
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.login, p.role, p.specialties
  from public.profiles p
  where public.is_active_user()
    and p.status = 'active'
  order by coalesce(p.full_name, p.login)
$$;

create or replace function public.operations_project_directory()
returns table (
  id uuid,
  name text,
  client_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, c.name as client_name
  from public.projects p
  left join public.clients c on c.id = p.client_id
  where public.is_active_user()
    and (
      public.current_role()::text in (
        'owner', 'project_manager', 'draftsperson', 'accounting'
      )
      or exists (
        select 1
        from public.project_members m
        where m.project_id = p.id and m.profile_id = auth.uid()
      )
      or exists (
        select 1
        from public.work_orders w
        join public.work_order_assignments a on a.work_order_id = w.id
        where w.project_id = p.id and a.profile_id = auth.uid()
      )
    )
  order by p.name
$$;

create or replace function public.sync_work_order_project_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  target_role text;
  target_status text;
begin
  select role::text, status::text
  into target_role, target_status
  from public.profiles
  where id = new.profile_id;

  if target_status <> 'active' or target_role not in (
    'owner', 'project_manager', 'draftsperson', 'welder', 'painter',
    'mechanic', 'installer', 'parts'
  ) then
    raise exception 'Only active operational employees can be assigned';
  end if;

  select project_id into target_project_id
  from public.work_orders
  where id = new.work_order_id;

  insert into public.project_members (project_id, profile_id)
  values (target_project_id, new.profile_id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists work_order_assignment_adds_project_member
  on public.work_order_assignments;
create trigger work_order_assignment_adds_project_member
  after insert on public.work_order_assignments
  for each row execute function public.sync_work_order_project_member();

create or replace function public.validate_time_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  daily_hours numeric(7,2);
begin
  if tg_op = 'UPDATE' and not public.can_manage_operations() and (
    new.work_order_id is distinct from old.work_order_id
    or new.profile_id is distinct from old.profile_id
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Time entry ownership cannot be changed';
  end if;

  select coalesce(sum(t.hours), 0)
  into daily_hours
  from public.time_entries t
  where t.profile_id = new.profile_id
    and t.work_date = new.work_date
    and t.id <> new.id;

  if daily_hours + new.hours > 24 then
    raise exception 'Daily time entries cannot exceed 24 hours';
  end if;

  return new;
end;
$$;

drop trigger if exists time_entries_validate on public.time_entries;
create trigger time_entries_validate
  before insert or update on public.time_entries
  for each row execute function public.validate_time_entry();

create or replace function public.protect_material_entry_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_operations() and (
    new.work_order_id is distinct from old.work_order_id
    or new.entered_by is distinct from old.entered_by
  ) then
    raise exception 'Material entry ownership cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists material_entries_protect_identity on public.material_entries;
create trigger material_entries_protect_identity
  before update on public.material_entries
  for each row execute function public.protect_material_entry_identity();

create or replace function public.enforce_work_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_can_manage boolean := public.can_manage_operations();
  actor_is_assigned boolean;
  transition_allowed boolean := false;
begin
  if new.status = old.status then
    return new;
  end if;

  select exists (
    select 1
    from public.work_order_assignments a
    join public.profiles p on p.id = a.profile_id
      and p.status = 'active'
      and p.role::text in (
        'owner', 'project_manager', 'draftsperson', 'welder', 'painter',
        'mechanic', 'installer', 'parts'
      )
    where a.work_order_id = old.id and a.profile_id = auth.uid()
  ) into actor_is_assigned;

  transition_allowed := case old.status
    when 'planned' then new.status in ('ready', 'cancelled') and actor_can_manage
    when 'ready' then
      new.status in ('in_progress', 'blocked')
      and (actor_can_manage or actor_is_assigned)
      or new.status in ('planned', 'cancelled') and actor_can_manage
    when 'in_progress' then
      new.status in ('blocked', 'completed')
      and (actor_can_manage or actor_is_assigned)
      or new.status in ('ready', 'cancelled') and actor_can_manage
    when 'blocked' then
      new.status = 'in_progress'
      and (actor_can_manage or actor_is_assigned)
      or new.status in ('ready', 'cancelled') and actor_can_manage
    when 'completed' then new.status = 'in_progress' and actor_can_manage
    when 'cancelled' then new.status = 'planned' and actor_can_manage
    else false
  end;

  if not transition_allowed then
    raise exception 'Work order cannot move from % to %', old.status, new.status;
  end if;

  if new.status = 'in_progress' then
    new.started_at := coalesce(old.started_at, now());
  end if;
  if new.status = 'completed' then
    new.completed_at := now();
  elsif old.status = 'completed' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists work_orders_enforce_status on public.work_orders;
create trigger work_orders_enforce_status
  before update of status on public.work_orders
  for each row execute function public.enforce_work_order_status_transition();

create or replace function public.update_assigned_work_order_status(
  p_work_order_id uuid,
  p_status public.work_order_status
)
returns public.work_order_status
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_status public.work_order_status;
begin
  if not public.can_manage_operations() and not exists (
    select 1
    from public.work_order_assignments a
    join public.profiles p on p.id = a.profile_id
      and p.status = 'active'
      and p.role::text in (
        'owner', 'project_manager', 'draftsperson', 'welder', 'painter',
        'mechanic', 'installer', 'parts'
      )
    where a.work_order_id = p_work_order_id
      and a.profile_id = auth.uid()
  ) then
    raise exception 'Work order assignment required';
  end if;

  update public.work_orders
  set status = p_status
  where id = p_work_order_id
  returning status into updated_status;

  if updated_status is null then
    raise exception 'Work order not found';
  end if;

  return updated_status;
end;
$$;

revoke all on function public.update_assigned_work_order_status(
  uuid, public.work_order_status
) from public;
grant execute on function public.update_assigned_work_order_status(
  uuid, public.work_order_status
) to authenticated;

revoke all on function public.operations_employee_directory() from public;
grant execute on function public.operations_employee_directory() to authenticated;

revoke all on function public.operations_project_directory() from public;
grant execute on function public.operations_project_directory() to authenticated;

alter table public.work_orders enable row level security;
alter table public.work_order_assignments enable row level security;
alter table public.time_entries enable row level security;
alter table public.material_entries enable row level security;

drop policy if exists work_orders_read on public.work_orders;
create policy work_orders_read on public.work_orders for select
  using (public.can_view_work_order(id));

drop policy if exists work_orders_manage on public.work_orders;
create policy work_orders_manage on public.work_orders for all
  using (public.can_manage_operations())
  with check (public.can_manage_operations());

drop policy if exists work_order_assignments_read on public.work_order_assignments;
create policy work_order_assignments_read on public.work_order_assignments for select
  using (public.can_view_work_order(work_order_id));

drop policy if exists work_order_assignments_manage on public.work_order_assignments;
create policy work_order_assignments_manage on public.work_order_assignments for all
  using (public.can_manage_operations())
  with check (public.can_manage_operations());

drop policy if exists time_entries_read on public.time_entries;
create policy time_entries_read on public.time_entries for select
  using (public.can_view_work_order(work_order_id));

drop policy if exists time_entries_manage on public.time_entries;
create policy time_entries_manage on public.time_entries for all
  using (public.can_manage_operations())
  with check (public.can_manage_operations());

drop policy if exists time_entries_self_insert on public.time_entries;
create policy time_entries_self_insert on public.time_entries for insert
  with check (
    profile_id = auth.uid()
    and created_by = auth.uid()
    and public.can_log_work_order(work_order_id)
  );

drop policy if exists time_entries_self_update on public.time_entries;
create policy time_entries_self_update on public.time_entries for update
  using (profile_id = auth.uid() and public.is_active_user())
  with check (
    profile_id = auth.uid()
    and created_by = auth.uid()
    and public.can_log_work_order(work_order_id)
  );

drop policy if exists time_entries_self_delete on public.time_entries;
create policy time_entries_self_delete on public.time_entries for delete
  using (
    profile_id = auth.uid()
    and public.can_log_work_order(work_order_id)
  );

drop policy if exists material_entries_read on public.material_entries;
create policy material_entries_read on public.material_entries for select
  using (public.can_view_work_order(work_order_id));

drop policy if exists material_entries_manage on public.material_entries;
create policy material_entries_manage on public.material_entries for all
  using (public.can_manage_operations())
  with check (public.can_manage_operations());

drop policy if exists material_entries_self_insert on public.material_entries;
create policy material_entries_self_insert on public.material_entries for insert
  with check (
    entered_by = auth.uid()
    and public.can_log_work_order(work_order_id)
  );

drop policy if exists material_entries_self_update on public.material_entries;
create policy material_entries_self_update on public.material_entries for update
  using (entered_by = auth.uid() and public.is_active_user())
  with check (
    entered_by = auth.uid()
    and public.can_log_work_order(work_order_id)
  );

drop policy if exists material_entries_self_delete on public.material_entries;
create policy material_entries_self_delete on public.material_entries for delete
  using (
    entered_by = auth.uid()
    and public.can_log_work_order(work_order_id)
  );

drop policy if exists projects_operations_accounting_read on public.projects;
