-- P9: marine paint-yard Kanban, gated process control, coating traceability,
-- planned-versus-actual labor, quote creation, and final invoicing.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'paint_job_stage') then
    create type public.paint_job_stage as enum (
      'expected', 'yard_intake', 'wash_mask', 'surface_prep', 'primer',
      'coating', 'cure_qc', 'ready', 'delivered', 'on_hold', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'vessel_hull_material') then
    create type public.vessel_hull_material as enum (
      'fiberglass', 'aluminum', 'steel', 'wood', 'composite', 'unknown'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'paint_scope_area') then
    create type public.paint_scope_area as enum (
      'bottom', 'topsides', 'deck', 'superstructure', 'touch_up', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'paint_task_status') then
    create type public.paint_task_status as enum (
      'pending', 'complete', 'not_applicable'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'coating_operation') then
    create type public.coating_operation as enum (
      'cleaner_dewaxer', 'filler_fairing', 'primer', 'barrier_coat',
      'tie_coat', 'topcoat', 'antifouling', 'clearcoat', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'coating_application_method') then
    create type public.coating_application_method as enum (
      'brush', 'roller', 'spray', 'trowel', 'wipe', 'other'
    );
  end if;
end $$;

create table if not exists public.paint_jobs (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects(id) on delete cascade,
  work_order_id         uuid not null unique
                          references public.work_orders(id) on delete cascade,
  opportunity_id        uuid not null references public.opportunities(id) on delete restrict,
  estimate_id           uuid not null unique references public.estimates(id) on delete restrict,
  invoice_id            uuid unique references public.invoices(id) on delete restrict,
  vessel_name           text not null check (char_length(btrim(vessel_name)) between 1 and 120),
  vessel_make_model     text check (
                          vessel_make_model is null or char_length(vessel_make_model) <= 160
                        ),
  vessel_length_ft      numeric(7,2) check (
                          vessel_length_ft is null or vessel_length_ft > 0
                        ),
  hull_material         public.vessel_hull_material not null default 'unknown',
  scope_areas           public.paint_scope_area[] not null,
  stage                 public.paint_job_stage not null default 'expected',
  priority              public.work_order_priority not null default 'normal',
  arrival_date          date not null,
  due_date              date not null,
  planned_hours         numeric(8,2) not null check (planned_hours > 0),
  yard_location         text check (
                          yard_location is null or char_length(yard_location) <= 160
                        ),
  specification         text check (
                          specification is null or char_length(specification) <= 5000
                        ),
  stage_entered_at      timestamptz not null default now(),
  ready_at              timestamptz,
  delivered_at          timestamptz,
  created_by            uuid not null references public.profiles(id) on delete restrict,
  updated_by            uuid not null references public.profiles(id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint paint_job_dates_check check (due_date >= arrival_date),
  constraint paint_job_scope_check check (cardinality(scope_areas) > 0),
  constraint paint_job_completion_check check (
    (stage <> 'ready' or ready_at is not null)
    and (stage <> 'delivered' or (ready_at is not null and delivered_at is not null))
  )
);

create unique index if not exists paint_jobs_one_active_project_idx
  on public.paint_jobs (project_id)
  where stage not in ('delivered', 'cancelled');
create index if not exists paint_jobs_stage_due_idx
  on public.paint_jobs (stage, due_date, priority);
create index if not exists paint_jobs_arrival_idx
  on public.paint_jobs (arrival_date, due_date);

create table if not exists public.paint_job_tasks (
  id                    uuid primary key default gen_random_uuid(),
  paint_job_id          uuid not null references public.paint_jobs(id) on delete cascade,
  stage                 public.paint_job_stage not null,
  code                  text not null check (code ~ '^[a-z0-9_]{3,60}$'),
  label                 text not null check (char_length(btrim(label)) between 3 and 240),
  sort_order            integer not null default 0,
  required              boolean not null default true,
  status                public.paint_task_status not null default 'pending',
  note                  text check (note is null or char_length(note) <= 500),
  completed_by          uuid references public.profiles(id) on delete restrict,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (paint_job_id, code),
  constraint paint_task_completion_check check (
    (status = 'pending' and completed_by is null and completed_at is null)
    or (status <> 'pending' and completed_by is not null and completed_at is not null)
  )
);
create index if not exists paint_job_tasks_job_stage_idx
  on public.paint_job_tasks (paint_job_id, stage, sort_order);

create table if not exists public.paint_job_stage_events (
  id                    uuid primary key default gen_random_uuid(),
  paint_job_id          uuid not null references public.paint_jobs(id) on delete cascade,
  old_stage             public.paint_job_stage,
  new_stage             public.paint_job_stage not null,
  note                  text check (note is null or char_length(note) <= 500),
  created_by            uuid not null references public.profiles(id) on delete restrict,
  created_at            timestamptz not null default now(),
  constraint paint_stage_event_change_check check (
    old_stage is null or old_stage <> new_stage
  )
);
create index if not exists paint_job_stage_events_job_date_idx
  on public.paint_job_stage_events (paint_job_id, created_at desc);

create table if not exists public.paint_coating_logs (
  id                    uuid primary key default gen_random_uuid(),
  paint_job_id          uuid not null references public.paint_jobs(id) on delete cascade,
  material_entry_id     uuid not null unique
                          references public.material_entries(id) on delete restrict,
  area                  public.paint_scope_area not null,
  operation             public.coating_operation not null,
  coat_number           integer check (coat_number is null or coat_number between 1 and 20),
  manufacturer          text not null check (
                          char_length(btrim(manufacturer)) between 1 and 120
                        ),
  product_name          text not null check (
                          char_length(btrim(product_name)) between 1 and 160
                        ),
  product_code          text check (product_code is null or char_length(product_code) <= 80),
  color                 text check (color is null or char_length(color) <= 100),
  batch_lot             text check (batch_lot is null or char_length(batch_lot) <= 100),
  quantity_used         numeric(12,3) not null check (quantity_used > 0),
  quantity_unit         text not null check (
                          char_length(btrim(quantity_unit)) between 1 and 20
                        ),
  unit_cost             numeric(12,2) not null default 0 check (unit_cost >= 0),
  mix_ratio             text check (mix_ratio is null or char_length(mix_ratio) <= 80),
  reducer_thinner       text check (
                          reducer_thinner is null or char_length(reducer_thinner) <= 120
                        ),
  application_method    public.coating_application_method not null,
  ambient_temp_c        numeric(5,2) check (
                          ambient_temp_c is null or ambient_temp_c between -30 and 70
                        ),
  substrate_temp_c      numeric(5,2) check (
                          substrate_temp_c is null or substrate_temp_c between -30 and 90
                        ),
  relative_humidity_pct numeric(5,2) check (
                          relative_humidity_pct is null
                          or relative_humidity_pct between 0 and 100
                        ),
  dew_point_c           numeric(5,2) check (
                          dew_point_c is null or dew_point_c between -40 and 60
                        ),
  wet_film_mils         numeric(7,2) check (
                          wet_film_mils is null or wet_film_mils > 0
                        ),
  dry_film_mils         numeric(7,2) check (
                          dry_film_mils is null or dry_film_mils > 0
                        ),
  tds_checked           boolean not null default false,
  sds_checked           boolean not null default false,
  ppe_checked           boolean not null default false,
  ventilation_checked   boolean not null default false,
  surface_clean_dry     boolean not null default false,
  applied_at            timestamptz not null default now(),
  applied_by            uuid not null references public.profiles(id) on delete restrict,
  note                  text check (note is null or char_length(note) <= 1000),
  voided_at             timestamptz,
  voided_by             uuid references public.profiles(id) on delete restrict,
  void_reason           text check (
                          void_reason is null
                          or char_length(btrim(void_reason)) between 5 and 500
                        ),
  created_at            timestamptz not null default now(),
  constraint coating_log_void_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and void_reason is not null)
  ),
  constraint coating_dew_point_margin_check check (
    substrate_temp_c is null or dew_point_c is null
    or substrate_temp_c >= dew_point_c + 3
  )
);
create index if not exists paint_coating_logs_job_date_idx
  on public.paint_coating_logs (paint_job_id, applied_at desc);

create or replace function public.can_administer_paint_yard()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_operations()
$$;

create or replace function public.can_work_paint_yard()
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
      and actor.role::text in ('owner', 'project_manager', 'draftsperson', 'painter')
  )
$$;

create or replace function public.can_view_paint_yard()
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
      and actor.role::text in (
        'owner', 'project_manager', 'draftsperson', 'painter', 'sales', 'accounting'
      )
  )
$$;

create or replace function public.can_view_paint_financials()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_billing() or public.can_view_sales()
$$;

create or replace function public.can_view_paint_job(p_paint_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_paint_yard() and exists (
    select 1 from public.paint_jobs job where job.id = p_paint_job_id
  )
$$;

create or replace function public.protect_paint_workflow()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('coast.paint_workflow', true), '') <> 'on' then
    raise exception 'Paint-yard records can only change through the paint workflow';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists paint_jobs_protect on public.paint_jobs;
create trigger paint_jobs_protect
  before insert or update or delete on public.paint_jobs
  for each row execute function public.protect_paint_workflow();
drop trigger if exists paint_job_tasks_protect on public.paint_job_tasks;
create trigger paint_job_tasks_protect
  before insert or update or delete on public.paint_job_tasks
  for each row execute function public.protect_paint_workflow();
drop trigger if exists paint_job_stage_events_protect on public.paint_job_stage_events;
create trigger paint_job_stage_events_protect
  before insert or update or delete on public.paint_job_stage_events
  for each row execute function public.protect_paint_workflow();
drop trigger if exists paint_coating_logs_protect on public.paint_coating_logs;
create trigger paint_coating_logs_protect
  before insert or update or delete on public.paint_coating_logs
  for each row execute function public.protect_paint_workflow();

create or replace function public.protect_linked_paint_material_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.paint_coating_logs log
    where log.material_entry_id = old.id
  ) and coalesce(current_setting('coast.paint_workflow', true), '') <> 'on' then
    raise exception 'Coating material entries can only change through the paint workflow';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists material_entries_protect_paint_log on public.material_entries;
create trigger material_entries_protect_paint_log
  before update or delete on public.material_entries
  for each row execute function public.protect_linked_paint_material_entry();

create or replace function public.enforce_work_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_can_manage boolean := public.can_manage_operations();
  actor_is_assigned boolean;
  linked_paint_job boolean;
  paint_workflow boolean := false;
  transition_allowed boolean := false;
begin
  if new.status = old.status then return new; end if;

  select exists (
    select 1 from public.paint_jobs job where job.work_order_id = old.id
  ) into linked_paint_job;
  paint_workflow :=
    coalesce(current_setting('coast.paint_work_order', true), '') = 'on'
    and public.can_work_paint_yard()
    and linked_paint_job;
  if linked_paint_job and not paint_workflow then
    raise exception 'Paint work-order status can only change through Paint Yard';
  end if;

  select exists (
    select 1
    from public.work_order_assignments assignment
    join public.profiles profile on profile.id = assignment.profile_id
      and profile.status = 'active'
      and profile.role::text in (
        'owner', 'project_manager', 'draftsperson', 'welder', 'painter',
        'mechanic', 'installer', 'parts'
      )
    where assignment.work_order_id = old.id
      and assignment.profile_id = auth.uid()
  ) into actor_is_assigned;

  transition_allowed := paint_workflow or case old.status
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

create or replace function public.protect_paint_work_order_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('coast.paint_work_order', true), '') <> 'on'
     and exists (
       select 1 from public.paint_jobs job where job.work_order_id = old.id
     )
     and (
       new.project_id is distinct from old.project_id
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.service_category is distinct from old.service_category
       or new.priority is distinct from old.priority
       or new.scheduled_start is distinct from old.scheduled_start
       or new.scheduled_end is distinct from old.scheduled_end
       or new.estimated_hours is distinct from old.estimated_hours
       or new.location is distinct from old.location
     ) then
    raise exception 'Paint work-order plan can only change through Paint Yard';
  end if;
  return new;
end;
$$;

drop trigger if exists work_orders_protect_paint_plan on public.work_orders;
create trigger work_orders_protect_paint_plan
  before update on public.work_orders
  for each row execute function public.protect_paint_work_order_plan();

create or replace function public.paint_yard_project_directory()
returns table (
  project_id uuid,
  project_name text,
  client_name text,
  vessel_name text,
  vessel_make_model text,
  vessel_length_ft numeric,
  has_active_paint_job boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    project.id,
    project.name,
    client.name,
    opportunity.vessel_name,
    opportunity.vessel_make_model,
    opportunity.vessel_length_ft,
    exists (
      select 1
      from public.paint_jobs job
      where job.project_id = project.id
        and job.stage not in ('delivered', 'cancelled')
    )
  from public.projects project
  join public.clients client on client.id = project.client_id
  left join public.opportunities opportunity on opportunity.project_id = project.id
  where public.can_administer_paint_yard()
    and project.status <> 'archived'
  order by project.updated_at desc, project.name
$$;

create or replace function public.paint_yard_board()
returns table (
  job_id uuid,
  project_id uuid,
  project_name text,
  client_name text,
  work_order_id uuid,
  work_order_number text,
  work_order_status public.work_order_status,
  opportunity_id uuid,
  estimate_id uuid,
  estimate_number text,
  estimate_status public.estimate_status,
  estimate_total numeric,
  invoice_id uuid,
  invoice_number text,
  invoice_status public.invoice_status,
  invoice_total numeric,
  invoice_balance numeric,
  vessel_name text,
  vessel_make_model text,
  vessel_length_ft numeric,
  hull_material public.vessel_hull_material,
  scope_areas public.paint_scope_area[],
  stage public.paint_job_stage,
  priority public.work_order_priority,
  arrival_date date,
  due_date date,
  planned_hours numeric,
  actual_hours numeric,
  material_cost numeric,
  yard_location text,
  specification text,
  stage_entered_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  crew_names text[],
  checklist_done integer,
  checklist_total integer,
  current_user_assigned boolean,
  last_coating_product text,
  last_coating_color text,
  last_coating_operation public.coating_operation,
  last_coating_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    job.id,
    project.id,
    project.name,
    client.name,
    work_order.id,
    work_order.work_order_number,
    work_order.status,
    case when public.can_view_paint_financials() then job.opportunity_id end,
    case when public.can_view_paint_financials() then estimate.id end,
    case when public.can_view_paint_financials() then estimate.estimate_number end,
    case when public.can_view_paint_financials() then estimate.status end,
    case when public.can_view_paint_financials() then estimate.total end,
    case when public.can_view_paint_financials() then invoice.id end,
    case when public.can_view_paint_financials() then invoice.invoice_number end,
    case when public.can_view_paint_financials() then invoice.status end,
    case when public.can_view_paint_financials() then invoice.total end,
    case when public.can_view_paint_financials() then invoice.balance_due end,
    job.vessel_name,
    job.vessel_make_model,
    job.vessel_length_ft,
    job.hull_material,
    job.scope_areas,
    job.stage,
    job.priority,
    job.arrival_date,
    job.due_date,
    job.planned_hours,
    coalesce((
      select sum(entry.hours)
      from public.time_entries entry
      where entry.work_order_id = work_order.id
    ), 0)::numeric(12,2),
    case when public.can_view_paint_financials() then coalesce((
      select sum(entry.line_total)
      from public.material_entries entry
      where entry.work_order_id = work_order.id and entry.reversed_at is null
    ), 0)::numeric(14,2) end,
    job.yard_location,
    job.specification,
    job.stage_entered_at,
    job.ready_at,
    job.delivered_at,
    coalesce((
      select array_agg(coalesce(profile.full_name, profile.login) order by
        coalesce(profile.full_name, profile.login))
      from public.work_order_assignments assignment
      join public.profiles profile on profile.id = assignment.profile_id
      where assignment.work_order_id = work_order.id
    ), '{}'::text[]),
    (select count(*)::integer from public.paint_job_tasks task
      where task.paint_job_id = job.id and task.status <> 'pending'),
    (select count(*)::integer from public.paint_job_tasks task
      where task.paint_job_id = job.id),
    exists (
      select 1 from public.work_order_assignments assignment
      where assignment.work_order_id = work_order.id
        and assignment.profile_id = auth.uid()
    ),
    latest.product_name,
    latest.color,
    latest.operation,
    latest.applied_at
  from public.paint_jobs job
  join public.projects project on project.id = job.project_id
  join public.clients client on client.id = project.client_id
  join public.work_orders work_order on work_order.id = job.work_order_id
  join public.estimates estimate on estimate.id = job.estimate_id
  left join public.invoices invoice on invoice.id = job.invoice_id
  left join lateral (
    select log.product_name, log.color, log.operation, log.applied_at
    from public.paint_coating_logs log
    where log.paint_job_id = job.id and log.voided_at is null
    order by log.applied_at desc, log.created_at desc
    limit 1
  ) latest on true
  where public.can_view_paint_yard()
  order by job.due_date, job.priority desc, job.vessel_name
$$;

create or replace function public.paint_job_checklist(p_paint_job_id uuid)
returns table (
  task_id uuid,
  stage public.paint_job_stage,
  code text,
  label text,
  sort_order integer,
  required boolean,
  status public.paint_task_status,
  note text,
  completed_by_name text,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    task.id, task.stage, task.code, task.label, task.sort_order, task.required,
    task.status, task.note, coalesce(profile.full_name, profile.login), task.completed_at
  from public.paint_job_tasks task
  left join public.profiles profile on profile.id = task.completed_by
  where task.paint_job_id = p_paint_job_id
    and public.can_view_paint_job(task.paint_job_id)
  order by task.stage, task.sort_order, task.created_at
$$;

create or replace function public.paint_job_coating_history(p_paint_job_id uuid)
returns table (
  log_id uuid,
  area public.paint_scope_area,
  operation public.coating_operation,
  coat_number integer,
  manufacturer text,
  product_name text,
  product_code text,
  color text,
  batch_lot text,
  quantity_used numeric,
  quantity_unit text,
  unit_cost numeric,
  mix_ratio text,
  reducer_thinner text,
  application_method public.coating_application_method,
  ambient_temp_c numeric,
  substrate_temp_c numeric,
  relative_humidity_pct numeric,
  dew_point_c numeric,
  wet_film_mils numeric,
  dry_film_mils numeric,
  tds_checked boolean,
  sds_checked boolean,
  ppe_checked boolean,
  ventilation_checked boolean,
  surface_clean_dry boolean,
  applied_at timestamptz,
  applied_by_name text,
  note text,
  voided_at timestamptz,
  void_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    log.id, log.area, log.operation, log.coat_number, log.manufacturer,
    log.product_name, log.product_code, log.color, log.batch_lot,
    log.quantity_used, log.quantity_unit,
    case when public.can_view_paint_financials() then log.unit_cost end,
    log.mix_ratio, log.reducer_thinner, log.application_method,
    log.ambient_temp_c, log.substrate_temp_c, log.relative_humidity_pct,
    log.dew_point_c, log.wet_film_mils, log.dry_film_mils,
    log.tds_checked, log.sds_checked, log.ppe_checked,
    log.ventilation_checked, log.surface_clean_dry, log.applied_at,
    coalesce(profile.full_name, profile.login), log.note,
    log.voided_at, log.void_reason
  from public.paint_coating_logs log
  join public.profiles profile on profile.id = log.applied_by
  where log.paint_job_id = p_paint_job_id
    and public.can_view_paint_job(log.paint_job_id)
  order by log.applied_at desc, log.created_at desc
$$;

create or replace function public.paint_job_stage_history(p_paint_job_id uuid)
returns table (
  event_id uuid,
  old_stage public.paint_job_stage,
  new_stage public.paint_job_stage,
  note text,
  changed_by_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    event.id,
    event.old_stage,
    event.new_stage,
    event.note,
    coalesce(profile.full_name, profile.login),
    event.created_at
  from public.paint_job_stage_events event
  join public.profiles profile on profile.id = event.created_by
  where event.paint_job_id = p_paint_job_id
    and public.can_view_paint_job(p_paint_job_id)
  order by event.created_at desc
$$;

create or replace function public.create_paint_job(
  p_project_id uuid,
  p_vessel_name text,
  p_vessel_make_model text,
  p_vessel_length_ft numeric,
  p_hull_material public.vessel_hull_material,
  p_scope_areas public.paint_scope_area[],
  p_priority public.work_order_priority,
  p_arrival_date date,
  p_due_date date,
  p_planned_hours numeric,
  p_labor_rate numeric,
  p_material_allowance numeric,
  p_tax_rate_percent numeric,
  p_yard_location text,
  p_specification text,
  p_assignee_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project record;
  target_opportunity public.opportunities%rowtype;
  created_work_order_id uuid;
  created_estimate_id uuid;
  created_job_id uuid;
  clean_vessel_name text := btrim(coalesce(p_vessel_name, ''));
  clean_make_model text := nullif(btrim(coalesce(p_vessel_make_model, '')), '');
  clean_location text := nullif(btrim(coalesce(p_yard_location, '')), '');
  clean_specification text := nullif(btrim(coalesce(p_specification, '')), '');
  assignee_ids uuid[] := coalesce(p_assignee_ids, '{}'::uuid[]);
  normalized_scopes public.paint_scope_area[] := array(
    select distinct scope from unnest(coalesce(p_scope_areas, '{}')) scope order by scope
  );
  previous_flag text := coalesce(current_setting('coast.paint_workflow', true), '');
begin
  if not public.can_administer_paint_yard() then
    raise exception 'Paint-yard manager permission required';
  end if;
  if char_length(clean_vessel_name) not between 1 and 120 then
    raise exception 'Vessel name is required';
  end if;
  if p_arrival_date is null or p_due_date is null or p_due_date < p_arrival_date then
    raise exception 'Valid arrival and due dates are required';
  end if;
  if p_planned_hours is null or p_planned_hours <= 0 then
    raise exception 'Planned hours must be greater than zero';
  end if;
  if p_labor_rate is null or p_labor_rate < 0
     or p_material_allowance is null or p_material_allowance < 0 then
    raise exception 'Quote amounts cannot be negative';
  end if;
  if p_tax_rate_percent is null or p_tax_rate_percent < 0 or p_tax_rate_percent > 100 then
    raise exception 'Tax rate must be between zero and 100';
  end if;
  if p_hull_material is null or p_priority is null
     or cardinality(normalized_scopes) = 0 then
    raise exception 'Hull, scope, and priority are required';
  end if;

  select project.id, project.name, project.client_id, client.name as client_name
  into target_project
  from public.projects project
  join public.clients client on client.id = project.client_id
  where project.id = p_project_id and project.status <> 'archived'
  for update of project;
  if not found then raise exception 'Active project with a customer is required'; end if;
  if exists (
    select 1 from public.paint_jobs job
    where job.project_id = p_project_id
      and job.stage not in ('delivered', 'cancelled')
  ) then
    raise exception 'This project already has an active paint job';
  end if;
  if exists (
    select 1
    from unnest(assignee_ids) assignee_id
    left join public.profiles profile on profile.id = assignee_id
    where profile.id is null
      or profile.status <> 'active'
      or profile.role::text not in (
        'owner', 'project_manager', 'draftsperson', 'welder', 'painter',
        'mechanic', 'installer', 'parts'
      )
  ) then
    raise exception 'Every assignee must be an active operational employee';
  end if;

  select * into target_opportunity
  from public.opportunities opportunity
  where opportunity.project_id = p_project_id
  for update;
  if not found then
    insert into public.opportunities (
      client_id, title, status, source, description, service_categories,
      vessel_name, vessel_make_model, vessel_length_ft, target_date,
      assigned_to, project_id, created_by
    ) values (
      target_project.client_id,
      'Paint: ' || clean_vessel_name,
      'estimating', 'repeat', clean_specification, array['boat_painting']::text[],
      clean_vessel_name, clean_make_model, p_vessel_length_ft, p_due_date,
      auth.uid(), p_project_id, auth.uid()
    ) returning * into target_opportunity;
  end if;

  insert into public.estimates (
    opportunity_id, client_id, title, scope, valid_until, notes, terms,
    tax_rate_percent, assigned_to, created_by
  ) values (
    target_opportunity.id, target_project.client_id,
    'Paint: ' || clean_vessel_name,
    clean_specification, current_date + 30,
    'Prepared from the Paint Yard job. Confirm products and final scope before sending.',
    'Quote is subject to condition found after haul-out and surface preparation.',
    p_tax_rate_percent, auth.uid(), auth.uid()
  ) returning id into created_estimate_id;

  insert into public.estimate_items (
    estimate_id, item_type, description, quantity, unit, unit_price, sort_order
  ) values (
    created_estimate_id, 'labor',
    'Marine painting labor — planned hours', p_planned_hours, 'hr', p_labor_rate, 10
  );
  if p_material_allowance > 0 then
    insert into public.estimate_items (
      estimate_id, item_type, description, quantity, unit, unit_price, sort_order
    ) values (
      created_estimate_id, 'material',
      'Coatings, primers, reducers, masking, and consumables allowance',
      1, 'allowance', p_material_allowance, 20
    );
  end if;

  insert into public.work_orders (
    project_id, title, description, service_category, status, priority,
    scheduled_start, scheduled_end, estimated_hours, location, created_by
  ) values (
    p_project_id, 'Paint: ' || clean_vessel_name, clean_specification,
    'boat_painting', 'planned', p_priority, p_arrival_date, p_due_date,
    p_planned_hours, clean_location, auth.uid()
  ) returning id into created_work_order_id;

  insert into public.work_order_assignments (work_order_id, profile_id, assigned_by)
  select created_work_order_id, assignee_id, auth.uid()
  from (select distinct unnest(assignee_ids) as assignee_id) assignees
  on conflict (work_order_id, profile_id) do nothing;

  perform set_config('coast.paint_workflow', 'on', true);
  insert into public.paint_jobs (
    project_id, work_order_id, opportunity_id, estimate_id,
    vessel_name, vessel_make_model, vessel_length_ft, hull_material,
    scope_areas, priority, arrival_date, due_date, planned_hours,
    yard_location, specification, created_by, updated_by
  ) values (
    p_project_id, created_work_order_id, target_opportunity.id, created_estimate_id,
    clean_vessel_name, clean_make_model, p_vessel_length_ft, p_hull_material,
    normalized_scopes, p_priority, p_arrival_date, p_due_date, p_planned_hours,
    clean_location, clean_specification, auth.uid(), auth.uid()
  ) returning id into created_job_id;

  insert into public.paint_job_tasks (
    paint_job_id, stage, code, label, sort_order, required
  ) values
    (created_job_id, 'expected', 'arrival_confirmed', 'Arrival date, yard space, and haul plan confirmed', 10, true),
    (created_job_id, 'expected', 'scope_quote_reviewed', 'Scope and draft quote reviewed before arrival', 20, true),
    (created_job_id, 'yard_intake', 'vessel_identity', 'Vessel identity, dimensions, and owner scope verified', 10, true),
    (created_job_id, 'yard_intake', 'condition_photos', 'Arrival condition and damage photos captured in project gallery', 20, true),
    (created_job_id, 'yard_intake', 'substrate_identified', 'Hull substrate and existing coating system identified', 30, true),
    (created_job_id, 'yard_intake', 'compatibility_test', 'Existing coating compatibility and test patch reviewed', 40, true),
    (created_job_id, 'yard_intake', 'hazard_assessment', 'Job hazard assessment, ventilation, containment, and PPE planned', 50, true),
    (created_job_id, 'wash_mask', 'pressure_washed', 'Salt, fouling, and loose coating removed by fresh-water wash', 10, true),
    (created_job_id, 'wash_mask', 'decontaminated', 'Surface de-waxed, decontaminated, rinsed, and dry', 20, true),
    (created_job_id, 'wash_mask', 'hardware_masked', 'Hardware removed/protected and work area masked/contained', 30, true),
    (created_job_id, 'surface_prep', 'repairs_fairing', 'Damage, blisters, corrosion, and fairing repairs resolved', 10, true),
    (created_job_id, 'surface_prep', 'sanding_recorded', 'Sanding method and final grit recorded for the coating system', 20, true),
    (created_job_id, 'surface_prep', 'dust_removed', 'Sanding residue removed without re-contaminating surface', 30, true),
    (created_job_id, 'surface_prep', 'surface_clean_dry', 'Final surface is sound, clean, dry, and ready for coating', 40, true),
    (created_job_id, 'primer', 'primer_tds', 'Substrate-specific primer/barrier TDS and compatibility confirmed', 10, true),
    (created_job_id, 'primer', 'primer_logs', 'Every primer/barrier/tie coat logged by product, lot, and coat number', 20, true),
    (created_job_id, 'primer', 'primer_recoat_window', 'Primer recoat window verified before next product', 30, true),
    (created_job_id, 'coating', 'coating_tds_sds', 'Current TDS/SDS, mix ratio, pot life, and application limits verified', 10, true),
    (created_job_id, 'coating', 'environment_recorded', 'Temperature, humidity, dew point, ventilation, and surface condition recorded', 20, true),
    (created_job_id, 'coating', 'all_coats_logged', 'All finish/antifouling coats and batches logged', 30, true),
    (created_job_id, 'coating', 'high_wear_coverage', 'Waterline, leading edges, rudder, keel, and high-wear coverage verified', 40, true),
    (created_job_id, 'coating', 'recoat_windows', 'Minimum/maximum recoat windows met for every layer', 50, true),
    (created_job_id, 'cure_qc', 'cure_launch_window', 'Final cure and minimum launch/handling time calculated from TDS', 10, true),
    (created_job_id, 'cure_qc', 'visual_qc', 'Finish inspected for coverage, gloss, holidays, runs, pinholes, and defects', 20, true),
    (created_job_id, 'cure_qc', 'film_thickness_qc', 'Wet/dry film thickness or documented coverage rate reviewed', 30, true),
    (created_job_id, 'cure_qc', 'defects_resolved', 'Defects and punch-list rework completed', 40, true),
    (created_job_id, 'ready', 'reassembled', 'Masking removed and hardware/reassembly completed', 10, true),
    (created_job_id, 'ready', 'final_clean', 'Final clean, labeling, and launch/delivery instructions completed', 20, true),
    (created_job_id, 'ready', 'hours_materials_review', 'Actual hours, coating quantities, and material costs reviewed', 30, true),
    (created_job_id, 'ready', 'customer_signoff', 'Customer approval or delivery sign-off recorded', 40, true),
    (created_job_id, 'ready', 'invoice_ready', 'Accepted quote and final invoice readiness confirmed', 50, true);

  insert into public.paint_job_stage_events (
    paint_job_id, old_stage, new_stage, note, created_by
  ) values (
    created_job_id, null, 'expected', 'Paint job created', auth.uid()
  );
  perform set_config('coast.paint_workflow', previous_flag, true);
  return created_job_id;
end;
$$;

create or replace function public.update_paint_job_plan(
  p_paint_job_id uuid,
  p_arrival_date date,
  p_due_date date,
  p_planned_hours numeric,
  p_priority public.work_order_priority,
  p_yard_location text,
  p_specification text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_job public.paint_jobs%rowtype;
  clean_location text := nullif(btrim(coalesce(p_yard_location, '')), '');
  clean_specification text := nullif(btrim(coalesce(p_specification, '')), '');
  previous_flag text := coalesce(current_setting('coast.paint_workflow', true), '');
  previous_work_order_flag text :=
    coalesce(current_setting('coast.paint_work_order', true), '');
begin
  if not public.can_administer_paint_yard() then
    raise exception 'Paint-yard manager permission required';
  end if;
  if p_arrival_date is null or p_due_date is null or p_due_date < p_arrival_date
     or p_planned_hours is null or p_planned_hours <= 0 or p_priority is null then
    raise exception 'Valid dates, hours, and priority are required';
  end if;
  select * into target_job from public.paint_jobs
  where id = p_paint_job_id for update;
  if not found then raise exception 'Paint job not found'; end if;
  if target_job.stage in ('delivered', 'cancelled') then
    raise exception 'Closed paint jobs cannot be replanned';
  end if;

  perform set_config('coast.paint_workflow', 'on', true);
  update public.paint_jobs
  set arrival_date = p_arrival_date, due_date = p_due_date,
      planned_hours = p_planned_hours, priority = p_priority,
      yard_location = clean_location, specification = clean_specification,
      updated_by = auth.uid(), updated_at = now()
  where id = target_job.id;
  perform set_config('coast.paint_workflow', previous_flag, true);

  perform set_config('coast.paint_work_order', 'on', true);
  update public.work_orders
  set scheduled_start = p_arrival_date, scheduled_end = p_due_date,
      estimated_hours = p_planned_hours, priority = p_priority,
      location = clean_location, description = clean_specification
  where id = target_job.work_order_id;
  perform set_config('coast.paint_work_order', previous_work_order_flag, true);
end;
$$;

create or replace function public.set_paint_job_task_status(
  p_task_id uuid,
  p_status public.paint_task_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_task public.paint_job_tasks%rowtype;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  previous_flag text := coalesce(current_setting('coast.paint_workflow', true), '');
begin
  if not public.can_work_paint_yard() then
    raise exception 'Paint-yard worker permission required';
  end if;
  if p_status is null then raise exception 'Checklist status is required'; end if;
  select * into target_task from public.paint_job_tasks
  where id = p_task_id for update;
  if not found or not public.can_view_paint_job(target_task.paint_job_id) then
    raise exception 'Paint checklist item not found';
  end if;
  if char_length(coalesce(clean_note, '')) > 500 then
    raise exception 'Checklist note is too long';
  end if;
  perform set_config('coast.paint_workflow', 'on', true);
  update public.paint_job_tasks
  set status = p_status,
      note = clean_note,
      completed_by = case when p_status = 'pending' then null else auth.uid() end,
      completed_at = case when p_status = 'pending' then null else now() end,
      updated_at = now()
  where id = target_task.id;
  perform set_config('coast.paint_workflow', previous_flag, true);
end;
$$;

create or replace function public.move_paint_job_stage(
  p_paint_job_id uuid,
  p_target_stage public.paint_job_stage,
  p_note text default null
)
returns public.paint_job_stage
language plpgsql
security definer
set search_path = public
as $$
declare
  target_job public.paint_jobs%rowtype;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  unresolved integer;
  allowed boolean := false;
  forward_move boolean := false;
  next_work_order_status public.work_order_status;
  previous_flag text := coalesce(current_setting('coast.paint_workflow', true), '');
  previous_work_order_flag text :=
    coalesce(current_setting('coast.paint_work_order', true), '');
begin
  if not public.can_work_paint_yard() then
    raise exception 'Paint-yard worker permission required';
  end if;
  if p_target_stage is null then raise exception 'Target stage is required'; end if;
  select * into target_job from public.paint_jobs
  where id = p_paint_job_id for update;
  if not found then raise exception 'Paint job not found'; end if;
  if target_job.stage = p_target_stage then return target_job.stage; end if;
  if p_target_stage in ('on_hold', 'cancelled')
     and char_length(coalesce(clean_note, '')) < 5 then
    raise exception 'A reason of at least five characters is required';
  end if;
  if p_target_stage = 'cancelled' and not public.can_administer_paint_yard() then
    raise exception 'Only a paint-yard manager can cancel a job';
  end if;

  allowed := case target_job.stage
    when 'expected' then p_target_stage in ('yard_intake', 'on_hold', 'cancelled')
    when 'yard_intake' then p_target_stage in ('expected', 'wash_mask', 'on_hold', 'cancelled')
    when 'wash_mask' then p_target_stage in ('yard_intake', 'surface_prep', 'on_hold', 'cancelled')
    when 'surface_prep' then p_target_stage in ('wash_mask', 'primer', 'coating', 'on_hold', 'cancelled')
    when 'primer' then p_target_stage in ('surface_prep', 'coating', 'on_hold', 'cancelled')
    when 'coating' then p_target_stage in ('surface_prep', 'primer', 'cure_qc', 'on_hold', 'cancelled')
    when 'cure_qc' then p_target_stage in ('surface_prep', 'coating', 'ready', 'on_hold', 'cancelled')
    when 'ready' then p_target_stage in ('cure_qc', 'delivered', 'on_hold', 'cancelled')
    when 'delivered' then p_target_stage = 'ready' and public.can_administer_paint_yard()
    when 'on_hold' then p_target_stage not in ('delivered', 'on_hold')
    when 'cancelled' then p_target_stage = 'expected' and public.can_administer_paint_yard()
    else false
  end;
  if not allowed then
    raise exception 'Paint job cannot move from % to %', target_job.stage, p_target_stage;
  end if;

  forward_move := case target_job.stage
    when 'expected' then p_target_stage = 'yard_intake'
    when 'yard_intake' then p_target_stage = 'wash_mask'
    when 'wash_mask' then p_target_stage = 'surface_prep'
    when 'surface_prep' then p_target_stage in ('primer', 'coating')
    when 'primer' then p_target_stage = 'coating'
    when 'coating' then p_target_stage = 'cure_qc'
    when 'cure_qc' then p_target_stage = 'ready'
    when 'ready' then p_target_stage = 'delivered'
    else false
  end;

  if forward_move then
    select count(*)::integer into unresolved
    from public.paint_job_tasks task
    where task.paint_job_id = target_job.id
      and task.stage = target_job.stage
      and task.required = true
      and task.status = 'pending';
    if unresolved > 0 then
      raise exception 'Resolve all required % checklist items before moving forward',
        target_job.stage;
    end if;
  end if;

  next_work_order_status := case
    when p_target_stage = 'expected' then 'planned'
    when p_target_stage = 'yard_intake' then 'ready'
    when p_target_stage in ('wash_mask', 'surface_prep', 'primer', 'coating', 'cure_qc')
      then 'in_progress'
    when p_target_stage in ('ready', 'delivered') then 'completed'
    when p_target_stage = 'on_hold' then 'blocked'
    else 'cancelled'
  end;

  perform set_config('coast.paint_workflow', 'on', true);
  update public.paint_jobs
  set stage = p_target_stage,
      stage_entered_at = now(),
      ready_at = case
        when p_target_stage in ('ready', 'delivered') then coalesce(ready_at, now())
        when stage in ('ready', 'delivered') then null
        else ready_at end,
      delivered_at = case when p_target_stage = 'delivered' then now() else null end,
      updated_by = auth.uid(), updated_at = now()
  where id = target_job.id;
  insert into public.paint_job_stage_events (
    paint_job_id, old_stage, new_stage, note, created_by
  ) values (
    target_job.id, target_job.stage, p_target_stage, clean_note, auth.uid()
  );
  perform set_config('coast.paint_workflow', previous_flag, true);

  perform set_config('coast.paint_work_order', 'on', true);
  update public.work_orders set status = next_work_order_status
  where id = target_job.work_order_id;
  perform set_config('coast.paint_work_order', previous_work_order_flag, true);
  return p_target_stage;
end;
$$;

create or replace function public.log_paint_coating(
  p_paint_job_id uuid,
  p_area public.paint_scope_area,
  p_operation public.coating_operation,
  p_coat_number integer,
  p_manufacturer text,
  p_product_name text,
  p_product_code text,
  p_color text,
  p_batch_lot text,
  p_quantity_used numeric,
  p_quantity_unit text,
  p_unit_cost numeric,
  p_mix_ratio text,
  p_reducer_thinner text,
  p_application_method public.coating_application_method,
  p_ambient_temp_c numeric,
  p_substrate_temp_c numeric,
  p_relative_humidity_pct numeric,
  p_dew_point_c numeric,
  p_wet_film_mils numeric,
  p_dry_film_mils numeric,
  p_tds_checked boolean,
  p_sds_checked boolean,
  p_ppe_checked boolean,
  p_ventilation_checked boolean,
  p_surface_clean_dry boolean,
  p_applied_local timestamp without time zone,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_job public.paint_jobs%rowtype;
  created_material_id uuid;
  created_log_id uuid;
  clean_manufacturer text := btrim(coalesce(p_manufacturer, ''));
  clean_product text := btrim(coalesce(p_product_name, ''));
  clean_unit text := btrim(coalesce(p_quantity_unit, ''));
  effective_unit_cost numeric := case
    when public.can_view_paint_financials() then p_unit_cost
    else 0
  end;
  coating_product boolean := p_operation in (
    'primer', 'barrier_coat', 'tie_coat', 'topcoat', 'antifouling', 'clearcoat'
  );
  previous_flag text := coalesce(current_setting('coast.paint_workflow', true), '');
begin
  if not public.can_work_paint_yard() then
    raise exception 'Paint-yard worker permission required';
  end if;
  select * into target_job from public.paint_jobs
  where id = p_paint_job_id for update;
  if not found then raise exception 'Paint job not found'; end if;
  if target_job.stage in ('expected', 'ready', 'delivered', 'on_hold', 'cancelled') then
    raise exception 'Coating products cannot be logged at this job stage';
  end if;
  if not (p_area = any(target_job.scope_areas)) then
    raise exception 'Coating area is outside the approved paint scope';
  end if;
  if p_area is null or p_operation is null or p_application_method is null
     or char_length(clean_manufacturer) = 0 or char_length(clean_product) = 0
     or char_length(clean_unit) = 0 then
    raise exception 'Area, operation, product, manufacturer, unit, and method are required';
  end if;
  if p_quantity_used is null or p_quantity_used <= 0
     or effective_unit_cost is null or effective_unit_cost < 0 then
    raise exception 'Valid quantity and unit cost are required';
  end if;
  if p_coat_number is not null and (p_coat_number < 1 or p_coat_number > 20) then
    raise exception 'Coat number must be between one and 20';
  end if;
  if coating_product and (
    p_coat_number is null
    or char_length(btrim(coalesce(p_batch_lot, ''))) = 0
  ) then
    raise exception 'Coating layers require a coat number and batch or lot';
  end if;
  if p_applied_local is null then
    raise exception 'Vancouver application time is required';
  end if;
  if p_applied_local at time zone 'America/Vancouver' > now() + interval '1 hour' then
    raise exception 'Application time cannot be in the future';
  end if;
  if not coalesce(p_tds_checked, false)
     or not coalesce(p_sds_checked, false)
     or not coalesce(p_ppe_checked, false)
     or not coalesce(p_ventilation_checked, false)
     or not coalesce(p_surface_clean_dry, false) then
    raise exception 'TDS, SDS, PPE, ventilation, and surface checks are required';
  end if;
  if coating_product and (
    p_ambient_temp_c is null or p_substrate_temp_c is null
    or p_relative_humidity_pct is null or p_dew_point_c is null
  ) then
    raise exception 'Coating layers require temperature, humidity, and dew point readings';
  end if;
  if p_substrate_temp_c is not null and p_dew_point_c is not null
     and p_substrate_temp_c < p_dew_point_c + 3 then
    raise exception 'Substrate must be at least 3 C above dew point';
  end if;

  insert into public.material_entries (
    work_order_id, description, part_number, quantity, unit, unit_cost, entered_by
  ) values (
    target_job.work_order_id,
    clean_manufacturer || ' ' || clean_product,
    nullif(btrim(coalesce(p_product_code, '')), ''),
    p_quantity_used, clean_unit, effective_unit_cost, auth.uid()
  ) returning id into created_material_id;

  perform set_config('coast.paint_workflow', 'on', true);
  insert into public.paint_coating_logs (
    paint_job_id, material_entry_id, area, operation, coat_number,
    manufacturer, product_name, product_code, color, batch_lot,
    quantity_used, quantity_unit, unit_cost, mix_ratio, reducer_thinner,
    application_method, ambient_temp_c, substrate_temp_c,
    relative_humidity_pct, dew_point_c, wet_film_mils, dry_film_mils,
    tds_checked, sds_checked, ppe_checked, ventilation_checked,
    surface_clean_dry, applied_at, applied_by, note
  ) values (
    target_job.id, created_material_id, p_area, p_operation, p_coat_number,
    clean_manufacturer, clean_product,
    nullif(btrim(coalesce(p_product_code, '')), ''),
    nullif(btrim(coalesce(p_color, '')), ''),
    nullif(btrim(coalesce(p_batch_lot, '')), ''),
    p_quantity_used, clean_unit, effective_unit_cost,
    nullif(btrim(coalesce(p_mix_ratio, '')), ''),
    nullif(btrim(coalesce(p_reducer_thinner, '')), ''),
    p_application_method, p_ambient_temp_c, p_substrate_temp_c,
    p_relative_humidity_pct, p_dew_point_c, p_wet_film_mils, p_dry_film_mils,
    p_tds_checked, p_sds_checked, p_ppe_checked, p_ventilation_checked,
    p_surface_clean_dry,
    coalesce(p_applied_local at time zone 'America/Vancouver', now()), auth.uid(),
    nullif(btrim(coalesce(p_note, '')), '')
  ) returning id into created_log_id;
  perform set_config('coast.paint_workflow', previous_flag, true);
  return created_log_id;
end;
$$;

create or replace function public.void_paint_coating_log(
  p_log_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_log public.paint_coating_logs%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
  previous_flag text := coalesce(current_setting('coast.paint_workflow', true), '');
begin
  if not public.can_administer_paint_yard() then
    raise exception 'Paint-yard manager permission required';
  end if;
  if char_length(clean_reason) < 5 or char_length(clean_reason) > 500 then
    raise exception 'Void reason must be between five and 500 characters';
  end if;
  select * into target_log from public.paint_coating_logs
  where id = p_log_id for update;
  if not found then raise exception 'Coating log not found'; end if;
  if target_log.voided_at is not null then raise exception 'Coating log is already void'; end if;

  perform set_config('coast.paint_workflow', 'on', true);
  update public.paint_coating_logs
  set voided_at = now(), voided_by = auth.uid(), void_reason = clean_reason
  where id = target_log.id;
  update public.material_entries
  set unit_cost = 0,
      description = case
        when description like '[VOID] %' then description
        else '[VOID] ' || description
      end
  where id = target_log.material_entry_id;
  perform set_config('coast.paint_workflow', previous_flag, true);
end;
$$;

create or replace function public.create_paint_job_invoice(
  p_paint_job_id uuid,
  p_issue_date date default current_date,
  p_due_date date default (current_date + 30)
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_job public.paint_jobs%rowtype;
  created_invoice_id uuid;
  previous_flag text := coalesce(current_setting('coast.paint_workflow', true), '');
begin
  if not public.can_manage_billing() then
    raise exception 'Billing manager permission required';
  end if;
  select * into target_job from public.paint_jobs
  where id = p_paint_job_id for update;
  if not found then raise exception 'Paint job not found'; end if;
  if target_job.stage not in ('ready', 'delivered') then
    raise exception 'Paint job must be Ready before invoicing';
  end if;
  if target_job.invoice_id is not null then
    raise exception 'Paint job already has an invoice';
  end if;
  created_invoice_id := public.create_invoice_from_estimate(
    target_job.estimate_id, p_issue_date, p_due_date
  );
  perform set_config('coast.paint_workflow', 'on', true);
  update public.paint_jobs
  set invoice_id = created_invoice_id, updated_by = auth.uid(), updated_at = now()
  where id = target_job.id;
  perform set_config('coast.paint_workflow', previous_flag, true);
  return created_invoice_id;
end;
$$;

alter table public.paint_jobs enable row level security;
alter table public.paint_job_tasks enable row level security;
alter table public.paint_job_stage_events enable row level security;
alter table public.paint_coating_logs enable row level security;

drop policy if exists paint_jobs_view on public.paint_jobs;
create policy paint_jobs_view on public.paint_jobs for select
  using (public.can_view_paint_job(id));
drop policy if exists paint_job_tasks_view on public.paint_job_tasks;
create policy paint_job_tasks_view on public.paint_job_tasks for select
  using (public.can_view_paint_job(paint_job_id));
drop policy if exists paint_job_stage_events_view on public.paint_job_stage_events;
create policy paint_job_stage_events_view on public.paint_job_stage_events for select
  using (public.can_view_paint_job(paint_job_id));
drop policy if exists paint_coating_logs_view on public.paint_coating_logs;
create policy paint_coating_logs_view on public.paint_coating_logs for select
  using (public.can_view_paint_job(paint_job_id));

revoke all on function public.paint_yard_project_directory() from public;
grant execute on function public.paint_yard_project_directory() to authenticated;
revoke all on function public.paint_yard_board() from public;
grant execute on function public.paint_yard_board() to authenticated;
revoke all on function public.paint_job_checklist(uuid) from public;
grant execute on function public.paint_job_checklist(uuid) to authenticated;
revoke all on function public.paint_job_coating_history(uuid) from public;
grant execute on function public.paint_job_coating_history(uuid) to authenticated;
revoke all on function public.paint_job_stage_history(uuid) from public;
grant execute on function public.paint_job_stage_history(uuid) to authenticated;
revoke all on function public.create_paint_job(
  uuid, text, text, numeric, public.vessel_hull_material,
  public.paint_scope_area[], public.work_order_priority, date, date,
  numeric, numeric, numeric, numeric, text, text, uuid[]
) from public;
grant execute on function public.create_paint_job(
  uuid, text, text, numeric, public.vessel_hull_material,
  public.paint_scope_area[], public.work_order_priority, date, date,
  numeric, numeric, numeric, numeric, text, text, uuid[]
) to authenticated;
revoke all on function public.update_paint_job_plan(
  uuid, date, date, numeric, public.work_order_priority, text, text
) from public;
grant execute on function public.update_paint_job_plan(
  uuid, date, date, numeric, public.work_order_priority, text, text
) to authenticated;
revoke all on function public.set_paint_job_task_status(
  uuid, public.paint_task_status, text
) from public;
grant execute on function public.set_paint_job_task_status(
  uuid, public.paint_task_status, text
) to authenticated;
revoke all on function public.move_paint_job_stage(
  uuid, public.paint_job_stage, text
) from public;
grant execute on function public.move_paint_job_stage(
  uuid, public.paint_job_stage, text
) to authenticated;
revoke all on function public.log_paint_coating(
  uuid, public.paint_scope_area, public.coating_operation, integer,
  text, text, text, text, text, numeric, text, numeric, text, text,
  public.coating_application_method, numeric, numeric, numeric, numeric,
  numeric, numeric, boolean, boolean, boolean, boolean, boolean,
  timestamp without time zone, text
) from public;
grant execute on function public.log_paint_coating(
  uuid, public.paint_scope_area, public.coating_operation, integer,
  text, text, text, text, text, numeric, text, numeric, text, text,
  public.coating_application_method, numeric, numeric, numeric, numeric,
  numeric, numeric, boolean, boolean, boolean, boolean, boolean,
  timestamp without time zone, text
) to authenticated;
revoke all on function public.void_paint_coating_log(uuid, text) from public;
grant execute on function public.void_paint_coating_log(uuid, text) to authenticated;
revoke all on function public.create_paint_job_invoice(uuid, date, date) from public;
grant execute on function public.create_paint_job_invoice(uuid, date, date) to authenticated;
