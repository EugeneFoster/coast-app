-- P2: clients, sales opportunities, estimates, and quote-to-project conversion.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'client_type') then
    create type public.client_type as enum ('individual', 'business');
  end if;
  if not exists (select 1 from pg_type where typname = 'opportunity_status') then
    create type public.opportunity_status as enum (
      'new', 'qualified', 'estimating', 'quoted', 'won', 'lost'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'lead_source') then
    create type public.lead_source as enum (
      'website', 'referral', 'phone', 'email', 'walk_in', 'repeat', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'estimate_status') then
    create type public.estimate_status as enum (
      'draft', 'sent', 'accepted', 'declined', 'expired'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'estimate_item_type') then
    create type public.estimate_item_type as enum (
      'labor', 'material', 'part', 'subcontract', 'other'
    );
  end if;
end $$;

alter table public.clients add column if not exists type public.client_type not null default 'individual';
alter table public.clients add column if not exists contact_name text;
alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists phone text;
alter table public.clients add column if not exists billing_address text;
alter table public.clients add column if not exists service_address text;
alter table public.clients add column if not exists notes text;
alter table public.clients add column if not exists created_by uuid references public.profiles(id);
alter table public.clients add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_clients_touch on public.clients;
create trigger trg_clients_touch
  before update on public.clients
  for each row execute function public.touch_updated_at();

create table if not exists public.opportunities (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.clients(id) on delete restrict,
  title                text not null,
  status               public.opportunity_status not null default 'new',
  source               public.lead_source not null default 'other',
  description          text,
  service_categories   text[] not null default '{}',
  vessel_name          text,
  vessel_make_model    text,
  vessel_length_ft     numeric(7,2) check (vessel_length_ft is null or vessel_length_ft > 0),
  estimated_value      numeric(12,2) check (estimated_value is null or estimated_value >= 0),
  target_date          date,
  assigned_to          uuid references public.profiles(id) on delete set null,
  lost_reason          text,
  project_id           uuid unique references public.projects(id) on delete set null,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists trg_opportunities_touch on public.opportunities;
create trigger trg_opportunities_touch
  before update on public.opportunities
  for each row execute function public.touch_updated_at();

create sequence if not exists public.estimate_number_seq start with 1001;

create or replace function public.next_estimate_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'Q-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.estimate_number_seq')::text, 4, '0')
$$;

create table if not exists public.estimates (
  id                   uuid primary key default gen_random_uuid(),
  estimate_number      text not null unique default public.next_estimate_number(),
  opportunity_id       uuid not null references public.opportunities(id) on delete cascade,
  client_id            uuid not null references public.clients(id) on delete restrict,
  status               public.estimate_status not null default 'draft',
  title                text not null,
  scope                text,
  valid_until          date,
  notes                text,
  terms                text,
  tax_rate_percent     numeric(6,3) not null default 0
                         check (tax_rate_percent between 0 and 100),
  discount_amount      numeric(12,2) not null default 0 check (discount_amount >= 0),
  subtotal             numeric(12,2) not null default 0,
  tax_amount           numeric(12,2) not null default 0,
  total                numeric(12,2) not null default 0,
  assigned_to          uuid references public.profiles(id) on delete set null,
  accepted_at          timestamptz,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.estimate_items (
  id                   uuid primary key default gen_random_uuid(),
  estimate_id          uuid not null references public.estimates(id) on delete cascade,
  item_type            public.estimate_item_type not null default 'labor',
  description          text not null,
  quantity             numeric(12,2) not null default 1 check (quantity > 0),
  unit                 text not null default 'ea',
  unit_price           numeric(12,2) not null default 0 check (unit_price >= 0),
  line_total           numeric(12,2) generated always as (
                         round(quantity * unit_price, 2)
                       ) stored,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now()
);

create or replace function public.calculate_estimate_totals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  taxable numeric(12,2);
begin
  taxable := greatest(new.subtotal - new.discount_amount, 0);
  new.tax_amount := round(taxable * new.tax_rate_percent / 100, 2);
  new.total := taxable + new.tax_amount;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists estimates_calculate_totals on public.estimates;
create trigger estimates_calculate_totals
  before insert or update of subtotal, discount_amount, tax_rate_percent
  on public.estimates
  for each row execute function public.calculate_estimate_totals();

create or replace function public.recalculate_estimate_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_estimate_id uuid := coalesce(new.estimate_id, old.estimate_id);
begin
  update public.estimates
  set subtotal = coalesce((
    select sum(line_total)
    from public.estimate_items
    where estimate_id = target_estimate_id
  ), 0)
  where id = target_estimate_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists estimate_items_recalculate on public.estimate_items;
create trigger estimate_items_recalculate
  after insert or update or delete on public.estimate_items
  for each row execute function public.recalculate_estimate_subtotal();

create index if not exists opportunities_status_updated_idx
  on public.opportunities (status, updated_at desc);
create index if not exists opportunities_client_idx
  on public.opportunities (client_id, created_at desc);
create index if not exists opportunities_assigned_idx
  on public.opportunities (assigned_to, status);
create index if not exists estimates_opportunity_idx
  on public.estimates (opportunity_id, created_at desc);
create index if not exists estimate_items_estimate_sort_idx
  on public.estimate_items (estimate_id, sort_order, created_at);

create or replace function public.can_manage_sales()
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
      and role::text in ('owner', 'project_manager', 'sales', 'draftsperson')
  )
$$;

create or replace function public.can_view_sales()
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
      and role::text in ('owner', 'project_manager', 'sales', 'draftsperson', 'accounting')
  )
$$;

alter table public.opportunities enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_items enable row level security;

drop policy if exists clients_sales_manage on public.clients;
create policy clients_sales_manage on public.clients for all
  using (public.can_manage_sales())
  with check (public.can_manage_sales());

drop policy if exists opportunities_manage on public.opportunities;
create policy opportunities_manage on public.opportunities for all
  using (public.can_manage_sales())
  with check (public.can_manage_sales());

drop policy if exists opportunities_accounting_read on public.opportunities;
create policy opportunities_accounting_read on public.opportunities for select
  using (public.can_view_sales());

drop policy if exists estimates_manage on public.estimates;
create policy estimates_manage on public.estimates for all
  using (public.can_manage_sales())
  with check (public.can_manage_sales());

drop policy if exists estimates_accounting_read on public.estimates;
create policy estimates_accounting_read on public.estimates for select
  using (public.can_view_sales());

drop policy if exists estimate_items_manage on public.estimate_items;
create policy estimate_items_manage on public.estimate_items for all
  using (
    public.can_manage_sales()
    and exists (
      select 1 from public.estimates e where e.id = estimate_id
    )
  )
  with check (
    public.can_manage_sales()
    and exists (
      select 1 from public.estimates e where e.id = estimate_id
    )
  );

drop policy if exists estimate_items_accounting_read on public.estimate_items;
create policy estimate_items_accounting_read on public.estimate_items for select
  using (
    public.can_view_sales()
    and exists (
      select 1 from public.estimates e where e.id = estimate_id
    )
  );

create or replace function public.convert_opportunity_to_project(p_estimate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  quote record;
  new_project_id uuid;
begin
  if not public.can_manage_sales() then
    raise exception 'Sales access required';
  end if;

  select
    e.estimate_number,
    e.status as estimate_status,
    e.scope,
    o.id as opportunity_id,
    o.title,
    o.description,
    o.client_id,
    o.assigned_to,
    o.project_id
  into quote
  from public.estimates e
  join public.opportunities o on o.id = e.opportunity_id
  where e.id = p_estimate_id
  for update of o;

  if not found then
    raise exception 'Estimate not found';
  end if;
  if quote.estimate_status <> 'accepted' then
    raise exception 'Only an accepted estimate can become a project';
  end if;
  if quote.project_id is not null then
    return quote.project_id;
  end if;

  insert into public.projects (name, client_id, description, status, created_by)
  values (
    quote.title,
    quote.client_id,
    concat_ws(
      E'\n\n',
      nullif(quote.description, ''),
      case when quote.scope is not null
        then quote.estimate_number || E' scope:\n' || quote.scope
      end
    ),
    'planned',
    auth.uid()
  )
  returning id into new_project_id;

  insert into public.project_members (project_id, profile_id)
  select new_project_id, employee_id
  from (
    select quote.assigned_to as employee_id
    union
    select auth.uid() as employee_id
  ) assigned
  join public.profiles p on p.id = assigned.employee_id and p.status = 'active'
  where assigned.employee_id is not null
  on conflict do nothing;

  update public.opportunities
  set status = 'won', project_id = new_project_id
  where id = quote.opportunity_id;

  return new_project_id;
end;
$$;

revoke all on function public.convert_opportunity_to_project(uuid) from public;
grant execute on function public.convert_opportunity_to_project(uuid) to authenticated;
