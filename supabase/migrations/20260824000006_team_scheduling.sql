-- P8: employee shifts for work orders, overlap prevention, and immutable schedule audit.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'schedule_slot_status') then
    create type public.schedule_slot_status as enum ('scheduled', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'schedule_event_type') then
    create type public.schedule_event_type as enum (
      'created', 'rescheduled', 'cancelled'
    );
  end if;
end $$;

create table if not exists public.work_order_schedule_slots (
  id                uuid primary key default gen_random_uuid(),
  work_order_id     uuid not null references public.work_orders(id) on delete cascade,
  profile_id        uuid not null references public.profiles(id) on delete restrict,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  note              text check (note is null or char_length(note) <= 500),
  status            public.schedule_slot_status not null default 'scheduled',
  cancelled_at      timestamptz,
  cancelled_by      uuid references public.profiles(id) on delete restrict,
  cancellation_reason text check (
    cancellation_reason is null or
    char_length(btrim(cancellation_reason)) between 5 and 500
  ),
  created_by        uuid not null references public.profiles(id) on delete restrict,
  updated_by        uuid not null references public.profiles(id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint schedule_slot_time_check check (
    ends_at > starts_at and ends_at <= starts_at + interval '24 hours'
  ),
  constraint schedule_slot_cancellation_check check (
    (
      status = 'scheduled'
      and cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
    )
    or (
      status = 'cancelled'
      and cancelled_at is not null
      and cancelled_by is not null
      and cancellation_reason is not null
    )
  )
);

create table if not exists public.work_order_schedule_events (
  id                uuid primary key default gen_random_uuid(),
  slot_id           uuid not null
                      references public.work_order_schedule_slots(id) on delete cascade,
  event_type        public.schedule_event_type not null,
  old_profile_id    uuid references public.profiles(id) on delete restrict,
  new_profile_id    uuid references public.profiles(id) on delete restrict,
  old_starts_at     timestamptz,
  old_ends_at       timestamptz,
  new_starts_at     timestamptz,
  new_ends_at       timestamptz,
  detail            text check (detail is null or char_length(detail) <= 500),
  created_by        uuid not null references public.profiles(id) on delete restrict,
  created_at        timestamptz not null default now(),
  constraint schedule_event_shape_check check (
    (
      event_type = 'created'
      and old_profile_id is null
      and old_starts_at is null
      and old_ends_at is null
      and new_profile_id is not null
      and new_starts_at is not null
      and new_ends_at is not null
    )
    or (
      event_type = 'rescheduled'
      and old_profile_id is not null
      and old_starts_at is not null
      and old_ends_at is not null
      and new_profile_id is not null
      and new_starts_at is not null
      and new_ends_at is not null
    )
    or (
      event_type = 'cancelled'
      and old_profile_id is not null
      and old_starts_at is not null
      and old_ends_at is not null
      and new_profile_id is null
      and new_starts_at is null
      and new_ends_at is null
    )
  )
);

create index if not exists schedule_slots_profile_time_idx
  on public.work_order_schedule_slots (profile_id, starts_at, ends_at)
  where status = 'scheduled';
create index if not exists schedule_slots_work_order_idx
  on public.work_order_schedule_slots (work_order_id, starts_at)
  where status = 'scheduled';
create index if not exists schedule_events_slot_date_idx
  on public.work_order_schedule_events (slot_id, created_at desc);

create or replace function public.can_manage_schedule()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_operations()
$$;

create or replace function public.can_view_schedule_slot(p_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_schedule() or exists (
    select 1
    from public.work_order_schedule_slots slot
    join public.profiles actor on actor.id = auth.uid()
    where slot.id = p_slot_id
      and slot.profile_id = actor.id
      and actor.status = 'active'
  )
$$;

create or replace function public.protect_schedule_workflow()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('coast.schedule_workflow', true), '') <> 'on' then
    raise exception 'Schedule records can only change through the scheduling workflow';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists schedule_slots_protect on public.work_order_schedule_slots;
create trigger schedule_slots_protect
  before insert or update or delete on public.work_order_schedule_slots
  for each row execute function public.protect_schedule_workflow();

drop trigger if exists schedule_events_protect on public.work_order_schedule_events;
create trigger schedule_events_protect
  before insert or update or delete on public.work_order_schedule_events
  for each row execute function public.protect_schedule_workflow();

create or replace function public.schedule_employee_directory()
returns table (
  id uuid,
  full_name text,
  login text,
  role public.user_role,
  job_title text,
  specialties public.employee_specialty[]
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.login, p.role, p.job_title, p.specialties
  from public.profiles p
  where public.can_manage_schedule()
    and p.status = 'active'
    and p.role::text in (
      'owner', 'project_manager', 'draftsperson', 'welder', 'painter',
      'mechanic', 'installer', 'parts'
    )
  order by coalesce(p.full_name, p.login)
$$;

create or replace function public.schedule_work_order_directory()
returns table (
  id uuid,
  work_order_number text,
  title text,
  project_id uuid,
  project_name text,
  status public.work_order_status,
  priority public.work_order_priority,
  location text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wo.id,
    wo.work_order_number,
    wo.title,
    wo.project_id,
    p.name,
    wo.status,
    wo.priority,
    wo.location
  from public.work_orders wo
  join public.projects p on p.id = wo.project_id
  where public.can_manage_schedule()
    and wo.status not in ('completed', 'cancelled')
  order by p.name, wo.priority desc, wo.work_order_number
$$;

create or replace function public.team_schedule(
  p_start_date date,
  p_end_date date
)
returns table (
  slot_id uuid,
  work_order_id uuid,
  project_id uuid,
  work_order_number text,
  work_order_title text,
  work_order_status public.work_order_status,
  work_order_priority public.work_order_priority,
  project_name text,
  location text,
  profile_id uuid,
  employee_name text,
  employee_role public.user_role,
  starts_at timestamptz,
  ends_at timestamptz,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    slot.id,
    wo.id,
    wo.project_id,
    wo.work_order_number,
    wo.title,
    wo.status,
    wo.priority,
    project.name,
    wo.location,
    employee.id,
    coalesce(employee.full_name, employee.login),
    employee.role,
    slot.starts_at,
    slot.ends_at,
    slot.note
  from public.work_order_schedule_slots slot
  join public.work_orders wo on wo.id = slot.work_order_id
  join public.projects project on project.id = wo.project_id
  join public.profiles employee on employee.id = slot.profile_id
  where public.can_manage_schedule()
    and p_start_date is not null
    and p_end_date is not null
    and p_end_date > p_start_date
    and slot.status = 'scheduled'
    and slot.starts_at < (p_end_date::timestamp at time zone 'America/Vancouver')
    and slot.ends_at > (p_start_date::timestamp at time zone 'America/Vancouver')
  order by
    slot.starts_at,
    coalesce(employee.full_name, employee.login),
    wo.work_order_number
$$;

create or replace function public.my_schedule(
  p_start_date date,
  p_end_date date
)
returns table (
  slot_id uuid,
  work_order_id uuid,
  project_id uuid,
  work_order_number text,
  work_order_title text,
  work_order_description text,
  work_order_status public.work_order_status,
  work_order_priority public.work_order_priority,
  service_category text,
  project_name text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    slot.id,
    wo.id,
    wo.project_id,
    wo.work_order_number,
    wo.title,
    wo.description,
    wo.status,
    wo.priority,
    wo.service_category,
    project.name,
    wo.location,
    slot.starts_at,
    slot.ends_at,
    slot.note
  from public.work_order_schedule_slots slot
  join public.work_orders wo on wo.id = slot.work_order_id
  join public.projects project on project.id = wo.project_id
  where public.is_active_user()
    and slot.profile_id = auth.uid()
    and p_start_date is not null
    and p_end_date is not null
    and p_end_date > p_start_date
    and slot.status = 'scheduled'
    and slot.starts_at < (p_end_date::timestamp at time zone 'America/Vancouver')
    and slot.ends_at > (p_start_date::timestamp at time zone 'America/Vancouver')
  order by slot.starts_at, wo.work_order_number
$$;

create or replace function public.my_unscheduled_work_orders()
returns table (
  work_order_id uuid,
  project_id uuid,
  work_order_number text,
  work_order_title text,
  work_order_description text,
  work_order_status public.work_order_status,
  work_order_priority public.work_order_priority,
  service_category text,
  project_name text,
  location text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wo.id,
    wo.project_id,
    wo.work_order_number,
    wo.title,
    wo.description,
    wo.status,
    wo.priority,
    wo.service_category,
    project.name,
    wo.location
  from public.work_order_assignments assignment
  join public.work_orders wo on wo.id = assignment.work_order_id
  join public.projects project on project.id = wo.project_id
  where public.is_active_user()
    and assignment.profile_id = auth.uid()
    and wo.status not in ('completed', 'cancelled')
    and not exists (
      select 1
      from public.work_order_schedule_slots slot
      where slot.work_order_id = wo.id
        and slot.profile_id = auth.uid()
        and slot.status = 'scheduled'
    )
  order by wo.priority desc, wo.work_order_number
$$;

create or replace function public.save_work_order_schedule_slot(
  p_slot_id uuid,
  p_work_order_id uuid,
  p_profile_id uuid,
  p_starts_local timestamp without time zone,
  p_ends_local timestamp without time zone,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_slot public.work_order_schedule_slots%rowtype;
  target_work_order public.work_orders%rowtype;
  target_employee public.profiles%rowtype;
  result_slot_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  lock_profile record;
  is_create boolean := p_slot_id is null;
  previous_flag text := coalesce(current_setting('coast.schedule_workflow', true), '');
begin
  if not public.can_manage_schedule() then
    raise exception 'You do not have permission to manage the team schedule';
  end if;
  if p_work_order_id is null or p_profile_id is null
     or p_starts_local is null or p_ends_local is null then
    raise exception 'Work order, employee, start, and end are required';
  end if;
  if p_ends_local <= p_starts_local then
    raise exception 'Shift end must be after its start';
  end if;
  if clean_note is not null and char_length(clean_note) > 500 then
    raise exception 'Schedule note is too long';
  end if;

  v_starts_at := p_starts_local at time zone 'America/Vancouver';
  v_ends_at := p_ends_local at time zone 'America/Vancouver';
  if v_ends_at > v_starts_at + interval '24 hours' then
    raise exception 'A single shift cannot exceed 24 hours';
  end if;

  if not is_create then
    select * into existing_slot
    from public.work_order_schedule_slots
    where id = p_slot_id
    for update;
    if not found then
      raise exception 'Schedule slot not found';
    end if;
    if existing_slot.status <> 'scheduled' then
      raise exception 'Cancelled schedule slots cannot be changed';
    end if;
  end if;

  select * into target_work_order
  from public.work_orders
  where id = p_work_order_id
  for update;
  if not found then
    raise exception 'Work order not found';
  end if;
  if target_work_order.status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled work orders cannot be scheduled';
  end if;

  select * into target_employee
  from public.profiles
  where id = p_profile_id
    and status = 'active'
    and role::text in (
      'owner', 'project_manager', 'draftsperson', 'welder', 'painter',
      'mechanic', 'installer', 'parts'
    );
  if not found then
    raise exception 'Active operational employee not found';
  end if;

  for lock_profile in
    select distinct profile_id
    from (
      select p_profile_id as profile_id
      union all
      select existing_slot.profile_id where not is_create
    ) profiles
    where profile_id is not null
    order by profile_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(lock_profile.profile_id::text, 0));
  end loop;

  if exists (
    select 1
    from public.work_order_schedule_slots slot
    join public.work_orders wo on wo.id = slot.work_order_id
    where slot.profile_id = p_profile_id
      and slot.status = 'scheduled'
      and wo.status not in ('completed', 'cancelled')
      and (p_slot_id is null or slot.id <> p_slot_id)
      and slot.starts_at < v_ends_at
      and slot.ends_at > v_starts_at
  ) then
    raise exception 'Employee already has an overlapping scheduled shift';
  end if;

  insert into public.work_order_assignments (
    work_order_id, profile_id, assigned_by
  ) values (
    p_work_order_id, p_profile_id, auth.uid()
  ) on conflict (work_order_id, profile_id) do nothing;

  perform set_config('coast.schedule_workflow', 'on', true);
  if is_create then
    insert into public.work_order_schedule_slots (
      work_order_id, profile_id, starts_at, ends_at, note,
      created_by, updated_by
    ) values (
      p_work_order_id, p_profile_id, v_starts_at, v_ends_at, clean_note,
      auth.uid(), auth.uid()
    ) returning id into result_slot_id;

    insert into public.work_order_schedule_events (
      slot_id, event_type, new_profile_id, new_starts_at,
      new_ends_at, detail, created_by
    ) values (
      result_slot_id, 'created', p_profile_id, v_starts_at,
      v_ends_at, clean_note, auth.uid()
    );
  else
    update public.work_order_schedule_slots
    set work_order_id = p_work_order_id,
        profile_id = p_profile_id,
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        note = clean_note,
        updated_by = auth.uid(),
        updated_at = now()
    where id = existing_slot.id
    returning id into result_slot_id;

    insert into public.work_order_schedule_events (
      slot_id, event_type,
      old_profile_id, new_profile_id,
      old_starts_at, old_ends_at,
      new_starts_at, new_ends_at,
      detail, created_by
    ) values (
      result_slot_id, 'rescheduled',
      existing_slot.profile_id, p_profile_id,
      existing_slot.starts_at, existing_slot.ends_at,
      v_starts_at, v_ends_at,
      clean_note, auth.uid()
    );
  end if;
  perform set_config('coast.schedule_workflow', previous_flag, true);
  return result_slot_id;
end;
$$;

create or replace function public.cancel_work_order_schedule_slot(
  p_slot_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_slot public.work_order_schedule_slots%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
  previous_flag text := coalesce(current_setting('coast.schedule_workflow', true), '');
begin
  if not public.can_manage_schedule() then
    raise exception 'You do not have permission to cancel scheduled shifts';
  end if;
  if char_length(clean_reason) < 5 or char_length(clean_reason) > 500 then
    raise exception 'Cancellation reason must be between 5 and 500 characters';
  end if;

  select * into target_slot
  from public.work_order_schedule_slots
  where id = p_slot_id
  for update;
  if not found then
    raise exception 'Schedule slot not found';
  end if;
  if target_slot.status <> 'scheduled' then
    raise exception 'Schedule slot is already cancelled';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_slot.profile_id::text, 0));

  perform set_config('coast.schedule_workflow', 'on', true);
  update public.work_order_schedule_slots
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancellation_reason = clean_reason,
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_slot.id;

  insert into public.work_order_schedule_events (
    slot_id, event_type, old_profile_id,
    old_starts_at, old_ends_at, detail, created_by
  ) values (
    target_slot.id, 'cancelled', target_slot.profile_id,
    target_slot.starts_at, target_slot.ends_at, clean_reason, auth.uid()
  );
  perform set_config('coast.schedule_workflow', previous_flag, true);
end;
$$;

alter table public.work_order_schedule_slots enable row level security;
alter table public.work_order_schedule_events enable row level security;

drop policy if exists schedule_slots_view on public.work_order_schedule_slots;
create policy schedule_slots_view on public.work_order_schedule_slots for select
  using (public.can_view_schedule_slot(id));

drop policy if exists schedule_events_view on public.work_order_schedule_events;
create policy schedule_events_view on public.work_order_schedule_events for select
  using (public.can_view_schedule_slot(slot_id));

revoke all on function public.schedule_employee_directory() from public;
grant execute on function public.schedule_employee_directory() to authenticated;
revoke all on function public.schedule_work_order_directory() from public;
grant execute on function public.schedule_work_order_directory() to authenticated;
revoke all on function public.team_schedule(date, date) from public;
grant execute on function public.team_schedule(date, date) to authenticated;
revoke all on function public.my_schedule(date, date) from public;
grant execute on function public.my_schedule(date, date) to authenticated;
revoke all on function public.my_unscheduled_work_orders() from public;
grant execute on function public.my_unscheduled_work_orders() to authenticated;
revoke all on function public.save_work_order_schedule_slot(
  uuid, uuid, uuid, timestamp without time zone, timestamp without time zone, text
) from public;
grant execute on function public.save_work_order_schedule_slot(
  uuid, uuid, uuid, timestamp without time zone, timestamp without time zone, text
) to authenticated;
revoke all on function public.cancel_work_order_schedule_slot(uuid, text) from public;
grant execute on function public.cancel_work_order_schedule_slot(uuid, text) to authenticated;
