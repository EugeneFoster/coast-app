-- P5: customer invoices, deposits/payments, and project profitability.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum (
      'draft', 'sent', 'partially_paid', 'paid', 'void'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'invoice_payment_type') then
    create type public.invoice_payment_type as enum ('deposit', 'payment');
  end if;
  if not exists (select 1 from pg_type where typname = 'invoice_payment_method') then
    create type public.invoice_payment_method as enum (
      'cash', 'card', 'e_transfer', 'cheque', 'bank_transfer', 'other'
    );
  end if;
end $$;

create sequence if not exists public.invoice_number_seq start with 1001;

create or replace function public.next_invoice_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'INV-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.invoice_number_seq')::text, 4, '0')
$$;

create table if not exists public.invoices (
  id                   uuid primary key default gen_random_uuid(),
  invoice_number       text not null unique default public.next_invoice_number(),
  client_id            uuid not null references public.clients(id) on delete restrict,
  project_id           uuid references public.projects(id) on delete restrict,
  source_estimate_id   uuid unique references public.estimates(id) on delete restrict,
  title                text not null,
  status               public.invoice_status not null default 'draft',
  issue_date           date not null default current_date,
  due_date             date,
  notes                text,
  terms                text,
  tax_rate_percent     numeric(6,3) not null default 0
                         check (tax_rate_percent between 0 and 100),
  discount_amount      numeric(14,2) not null default 0
                         check (discount_amount >= 0),
  subtotal             numeric(14,2) not null default 0
                         check (subtotal >= 0),
  tax_amount           numeric(14,2) not null default 0
                         check (tax_amount >= 0),
  total                numeric(14,2) not null default 0
                         check (total >= 0),
  amount_paid          numeric(14,2) not null default 0
                         check (amount_paid >= 0),
  balance_due          numeric(14,2) not null default 0
                         check (balance_due >= 0),
  sent_at              timestamptz,
  paid_at              timestamptz,
  voided_at            timestamptz,
  created_by           uuid not null references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint invoices_due_date_check check (
    due_date is null or due_date >= issue_date
  ),
  constraint invoices_payment_total_check check (amount_paid <= total),
  constraint invoices_balance_check check (
    balance_due = round(total - amount_paid, 2)
  )
);

create table if not exists public.invoice_items (
  id                   uuid primary key default gen_random_uuid(),
  invoice_id           uuid not null references public.invoices(id) on delete cascade,
  item_type            public.estimate_item_type not null default 'labor',
  description          text not null,
  quantity             numeric(12,2) not null default 1 check (quantity > 0),
  unit                 text not null default 'ea',
  unit_price           numeric(12,2) not null default 0 check (unit_price >= 0),
  line_total           numeric(14,2) generated always as (
                         round(quantity * unit_price, 2)
                       ) stored,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now()
);

create table if not exists public.invoice_payments (
  id                   uuid primary key default gen_random_uuid(),
  invoice_id           uuid not null references public.invoices(id) on delete restrict,
  payment_type         public.invoice_payment_type not null default 'payment',
  payment_date         date not null default current_date,
  amount               numeric(14,2) not null check (amount > 0),
  method               public.invoice_payment_method not null default 'other',
  reference            text,
  note                 text,
  reversed_at          timestamptz,
  reversed_by          uuid references public.profiles(id),
  reversal_reason      text,
  created_by           uuid not null references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint invoice_payments_reversal_check check (
    (reversed_at is null and reversed_by is null and reversal_reason is null)
    or
    (reversed_at is not null and reversed_by is not null and reversal_reason is not null)
  )
);

create table if not exists public.project_financial_settings (
  project_id           uuid primary key references public.projects(id) on delete cascade,
  labor_cost_rate      numeric(12,2) not null default 0 check (labor_cost_rate >= 0),
  overhead_cost        numeric(14,2) not null default 0 check (overhead_cost >= 0),
  updated_by           uuid not null references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists invoices_status_due_idx
  on public.invoices (status, due_date, issue_date desc);
create index if not exists invoices_client_date_idx
  on public.invoices (client_id, issue_date desc);
create index if not exists invoices_project_date_idx
  on public.invoices (project_id, issue_date desc) where project_id is not null;
create index if not exists invoice_items_invoice_sort_idx
  on public.invoice_items (invoice_id, sort_order, created_at);
create index if not exists invoice_payments_invoice_date_idx
  on public.invoice_payments (invoice_id, payment_date desc, created_at desc);
create index if not exists invoice_payments_active_idx
  on public.invoice_payments (invoice_id) where reversed_at is null;

create or replace function public.can_manage_billing()
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
      and role::text in ('owner', 'project_manager', 'accounting')
  )
$$;

create or replace function public.can_view_billing()
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
      and role::text in ('owner', 'project_manager', 'accounting', 'sales')
  )
$$;

create or replace function public.can_view_profitability()
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
      and role::text in ('owner', 'project_manager', 'accounting')
  )
$$;

create or replace function public.can_manage_project_financials()
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
      and role::text in ('owner', 'accounting')
  )
$$;

create or replace function public.validate_invoice_project_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_client_id uuid;
begin
  if new.project_id is null then
    return new;
  end if;

  select client_id into project_client_id
  from public.projects
  where id = new.project_id;

  if not found then
    raise exception 'Project not found';
  end if;
  if project_client_id is null or project_client_id <> new.client_id then
    raise exception 'Invoice customer must match the project customer';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_validate_project_client on public.invoices;
create trigger invoices_validate_project_client
  before insert or update of client_id, project_id on public.invoices
  for each row execute function public.validate_invoice_project_client();

create or replace function public.calculate_invoice_totals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  taxable numeric(14,2);
begin
  if new.discount_amount > new.subtotal then
    raise exception 'Invoice discount cannot exceed the subtotal';
  end if;
  taxable := round(new.subtotal - new.discount_amount, 2);
  new.tax_amount := round(taxable * new.tax_rate_percent / 100, 2);
  new.total := round(taxable + new.tax_amount, 2);
  if new.amount_paid > new.total then
    raise exception 'Invoice payments cannot exceed the total';
  end if;
  new.balance_due := round(new.total - new.amount_paid, 2);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists invoices_calculate_totals on public.invoices;
create trigger invoices_calculate_totals
  before insert or update of subtotal, discount_amount, tax_rate_percent, amount_paid
  on public.invoices
  for each row execute function public.calculate_invoice_totals();

create or replace function public.protect_invoice_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  internal_recalculation boolean :=
    coalesce(current_setting('coast.invoice_recalculation', true), '') = 'on';
  internal_payment boolean :=
    coalesce(current_setting('coast.invoice_payment', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft'
       or new.subtotal <> 0
       or new.tax_amount <> 0
       or new.total <> 0
       or new.amount_paid <> 0
       or new.balance_due <> 0 then
      raise exception 'New invoices must start as an empty draft';
    end if;
    if new.created_by <> auth.uid() then
      raise exception 'Invoice creator must match the authenticated user';
    end if;
    return new;
  end if;

  if new.invoice_number is distinct from old.invoice_number
     or new.created_by is distinct from old.created_by
     or new.source_estimate_id is distinct from old.source_estimate_id then
    raise exception 'Invoice identity fields cannot be changed';
  end if;

  if old.source_estimate_id is not null and (
    new.client_id is distinct from old.client_id
    or new.project_id is distinct from old.project_id
  ) then
    raise exception 'Estimate-linked invoice customer and project cannot be changed';
  end if;

  if new.subtotal is distinct from old.subtotal
     and not internal_recalculation then
    raise exception 'Invoice totals are calculated automatically';
  end if;

  if (
    new.tax_amount is distinct from old.tax_amount
    or new.total is distinct from old.total
    or new.balance_due is distinct from old.balance_due
  ) and not internal_recalculation and not internal_payment
    and new.discount_amount is not distinct from old.discount_amount
    and new.tax_rate_percent is not distinct from old.tax_rate_percent
    and new.subtotal is not distinct from old.subtotal
    and new.amount_paid is not distinct from old.amount_paid then
    raise exception 'Invoice totals are calculated automatically';
  end if;

  if new.amount_paid is distinct from old.amount_paid and not internal_payment then
    raise exception 'Invoice payments must be recorded through the payment ledger';
  end if;

  if (
    new.sent_at is distinct from old.sent_at
    or new.paid_at is distinct from old.paid_at
    or new.voided_at is distinct from old.voided_at
  ) and new.status = old.status and not internal_payment then
    raise exception 'Invoice status timestamps are calculated automatically';
  end if;

  if old.status <> 'draft' and not internal_payment and (
    new.client_id is distinct from old.client_id
    or new.project_id is distinct from old.project_id
    or new.title is distinct from old.title
    or new.issue_date is distinct from old.issue_date
    or new.due_date is distinct from old.due_date
    or new.notes is distinct from old.notes
    or new.terms is distinct from old.terms
    or new.tax_rate_percent is distinct from old.tax_rate_percent
    or new.discount_amount is distinct from old.discount_amount
  ) then
    raise exception 'Only draft invoice details can be edited';
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_protect_fields on public.invoices;
create trigger invoices_protect_fields
  before insert or update on public.invoices
  for each row execute function public.protect_invoice_fields();

create or replace function public.enforce_invoice_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  internal_payment boolean :=
    coalesce(current_setting('coast.invoice_payment', true), '') = 'on';
  active_payments integer;
begin
  if new.status = old.status then
    return new;
  end if;

  if internal_payment then
    if new.status not in ('sent', 'partially_paid', 'paid') then
      raise exception 'Payment ledger produced an invalid invoice status';
    end if;
    if new.amount_paid = 0 and new.status <> 'sent' then
      raise exception 'Zero-paid invoice must be Sent';
    elsif new.amount_paid > 0 and new.amount_paid < new.total
          and new.status <> 'partially_paid' then
      raise exception 'Partially paid invoice must be Partially paid';
    elsif new.amount_paid = new.total and new.status <> 'paid' then
      raise exception 'Fully paid invoice must be Paid';
    end if;
  elsif old.status = 'draft' and new.status = 'sent' then
    if old.total <= 0 or not exists (
      select 1 from public.invoice_items where invoice_id = old.id
    ) then
      raise exception 'Invoice must contain a positive line item before sending';
    end if;
  elsif old.status = 'draft' and new.status = 'void' then
    null;
  elsif old.status = 'sent' and new.status = 'void' then
    if old.amount_paid <> 0 then
      raise exception 'An invoice with payments cannot be voided';
    end if;
  elsif old.status = 'void' and new.status = 'draft' then
    select count(*) into active_payments
    from public.invoice_payments
    where invoice_id = old.id and reversed_at is null;
    if old.amount_paid <> 0 or active_payments <> 0 then
      raise exception 'An invoice with payments cannot return to Draft';
    end if;
  else
    raise exception 'Invoice cannot move from % to %', old.status, new.status;
  end if;

  if new.status = 'sent' and old.status = 'draft' then
    new.sent_at := now();
  end if;
  if new.status = 'paid' then
    new.paid_at := now();
  elsif old.status = 'paid' then
    new.paid_at := null;
  end if;
  if new.status = 'void' then
    new.voided_at := now();
  elsif old.status = 'void' then
    new.voided_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_enforce_status on public.invoices;
create trigger invoices_enforce_status
  before update of status on public.invoices
  for each row execute function public.enforce_invoice_status_transition();

create or replace function public.enforce_invoice_item_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status public.invoice_status;
  new_status public.invoice_status;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select status into old_status from public.invoices where id = old.invoice_id;
    if old_status <> 'draft' then
      raise exception 'Invoice lines can only change while the invoice is a draft';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select status into new_status from public.invoices where id = new.invoice_id;
    if new_status is null then
      raise exception 'Invoice not found';
    end if;
    if new_status <> 'draft' then
      raise exception 'Invoice lines can only change while the invoice is a draft';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_items_enforce_draft on public.invoice_items;
create trigger invoice_items_enforce_draft
  before insert or update or delete on public.invoice_items
  for each row execute function public.enforce_invoice_item_edit();

create or replace function public.recalculate_invoice_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  previous_flag text := coalesce(current_setting('coast.invoice_recalculation', true), '');
begin
  perform set_config('coast.invoice_recalculation', 'on', true);
  update public.invoices
  set subtotal = coalesce((
    select sum(line_total)
    from public.invoice_items
    where invoice_id = target_invoice_id
  ), 0)
  where id = target_invoice_id;
  perform set_config('coast.invoice_recalculation', previous_flag, true);
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_items_recalculate on public.invoice_items;
create trigger invoice_items_recalculate
  after insert or update or delete on public.invoice_items
  for each row execute function public.recalculate_invoice_subtotal();

create or replace function public.protect_invoice_payment_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('coast.invoice_payment', true), '') <> 'on' then
    raise exception 'Invoice payment history can only change through the payment ledger';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Invoice payments cannot be deleted';
  end if;
  if new.invoice_id is distinct from old.invoice_id
     or new.payment_type is distinct from old.payment_type
     or new.payment_date is distinct from old.payment_date
     or new.amount is distinct from old.amount
     or new.method is distinct from old.method
     or new.reference is distinct from old.reference
     or new.note is distinct from old.note
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Recorded payment details are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_payments_protect_history on public.invoice_payments;
create trigger invoice_payments_protect_history
  before update or delete on public.invoice_payments
  for each row execute function public.protect_invoice_payment_history();

create or replace function public.create_invoice_from_estimate(
  p_estimate_id uuid,
  p_issue_date date default current_date,
  p_due_date date default (current_date + 30)
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  quote record;
  created_invoice_id uuid;
begin
  if not public.can_manage_billing() then
    raise exception 'Billing manager permission required';
  end if;
  if p_issue_date is null then
    raise exception 'Invoice issue date is required';
  end if;
  if p_due_date is not null and p_due_date < p_issue_date then
    raise exception 'Invoice due date cannot be before the issue date';
  end if;

  select
    e.id,
    e.client_id,
    e.status,
    e.title,
    e.notes,
    e.terms,
    e.tax_rate_percent,
    e.discount_amount,
    o.project_id
  into quote
  from public.estimates e
  join public.opportunities o on o.id = e.opportunity_id
  where e.id = p_estimate_id
  for update of e;

  if not found then
    raise exception 'Estimate not found';
  end if;
  if quote.status <> 'accepted' then
    raise exception 'Only an accepted estimate can become an invoice';
  end if;
  if quote.project_id is null then
    raise exception 'Convert the accepted estimate to a project before invoicing';
  end if;
  if exists (select 1 from public.invoices where source_estimate_id = quote.id) then
    raise exception 'This estimate has already been invoiced';
  end if;

  insert into public.invoices (
    client_id, project_id, source_estimate_id, title, issue_date, due_date,
    notes, terms, tax_rate_percent, created_by
  ) values (
    quote.client_id, quote.project_id, quote.id, quote.title, p_issue_date, p_due_date,
    quote.notes, quote.terms, quote.tax_rate_percent, auth.uid()
  ) returning id into created_invoice_id;

  insert into public.invoice_items (
    invoice_id, item_type, description, quantity, unit, unit_price, sort_order
  )
  select
    created_invoice_id, item_type, description, quantity, unit, unit_price, sort_order
  from public.estimate_items
  where estimate_id = quote.id
  order by sort_order, created_at;

  update public.invoices
  set discount_amount = quote.discount_amount
  where id = created_invoice_id;

  return created_invoice_id;
end;
$$;

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_payment_type public.invoice_payment_type,
  p_payment_date date,
  p_amount numeric,
  p_method public.invoice_payment_method,
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice public.invoices%rowtype;
  created_payment_id uuid;
  new_amount_paid numeric(14,2);
  next_status public.invoice_status;
  previous_flag text := coalesce(current_setting('coast.invoice_payment', true), '');
begin
  if not public.can_manage_billing() then
    raise exception 'Billing manager permission required';
  end if;
  if p_payment_type is null or p_payment_date is null or p_method is null then
    raise exception 'Payment type, date, and method are required';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into target_invoice
  from public.invoices
  where id = p_invoice_id
  for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if target_invoice.status not in ('sent', 'partially_paid') then
    raise exception 'Payments can only be recorded against an open sent invoice';
  end if;
  if round(p_amount, 2) > target_invoice.balance_due then
    raise exception 'Payment exceeds the outstanding invoice balance';
  end if;

  perform set_config('coast.invoice_payment', 'on', true);
  insert into public.invoice_payments (
    invoice_id, payment_type, payment_date, amount, method,
    reference, note, created_by
  ) values (
    target_invoice.id, p_payment_type, p_payment_date, round(p_amount, 2), p_method,
    nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), auth.uid()
  ) returning id into created_payment_id;

  new_amount_paid := round(target_invoice.amount_paid + p_amount, 2);
  next_status := case
    when new_amount_paid = target_invoice.total then 'paid'::public.invoice_status
    else 'partially_paid'::public.invoice_status
  end;
  update public.invoices
  set amount_paid = new_amount_paid, status = next_status
  where id = target_invoice.id;
  perform set_config('coast.invoice_payment', previous_flag, true);

  return created_payment_id;
end;
$$;

create or replace function public.reverse_invoice_payment(
  p_payment_id uuid,
  p_reason text
)
returns public.invoice_status
language plpgsql
security definer
set search_path = public
as $$
declare
  target_payment public.invoice_payments%rowtype;
  target_invoice public.invoices%rowtype;
  new_amount_paid numeric(14,2);
  next_status public.invoice_status;
  previous_flag text := coalesce(current_setting('coast.invoice_payment', true), '');
begin
  if not public.can_manage_billing() then
    raise exception 'Billing manager permission required';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Payment reversal reason is required';
  end if;

  select * into target_payment
  from public.invoice_payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if target_payment.reversed_at is not null then
    raise exception 'Payment has already been reversed';
  end if;

  select * into target_invoice
  from public.invoices
  where id = target_payment.invoice_id
  for update;
  if target_invoice.status not in ('partially_paid', 'paid') then
    raise exception 'Invoice is not in a payable state';
  end if;

  new_amount_paid := round(target_invoice.amount_paid - target_payment.amount, 2);
  if new_amount_paid < 0 then
    raise exception 'Payment ledger is inconsistent';
  end if;
  next_status := case
    when new_amount_paid = 0 then 'sent'::public.invoice_status
    else 'partially_paid'::public.invoice_status
  end;

  perform set_config('coast.invoice_payment', 'on', true);
  update public.invoice_payments
  set reversed_at = now(), reversed_by = auth.uid(),
      reversal_reason = btrim(p_reason), updated_at = now()
  where id = target_payment.id;
  update public.invoices
  set amount_paid = new_amount_paid, status = next_status
  where id = target_invoice.id;
  perform set_config('coast.invoice_payment', previous_flag, true);

  return next_status;
end;
$$;

create or replace function public.billing_project_directory()
returns table (
  id uuid,
  name text,
  client_id uuid,
  client_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.client_id, c.name as client_name
  from public.projects p
  join public.clients c on c.id = p.client_id
  where public.can_view_billing()
  order by p.name
$$;

create or replace function public.billing_estimate_directory()
returns table (
  estimate_id uuid,
  estimate_number text,
  title text,
  client_id uuid,
  client_name text,
  project_id uuid,
  project_name text,
  total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.estimate_number,
    e.title,
    e.client_id,
    c.name,
    o.project_id,
    p.name,
    e.total
  from public.estimates e
  join public.opportunities o on o.id = e.opportunity_id
  join public.clients c on c.id = e.client_id
  join public.projects p on p.id = o.project_id
  left join public.invoices i on i.source_estimate_id = e.id
  where public.can_view_billing()
    and e.status = 'accepted'
    and i.id is null
  order by e.accepted_at desc nulls last, e.created_at desc
$$;

create or replace function public.project_profitability(p_project_id uuid)
returns table (
  project_id uuid,
  project_name text,
  client_id uuid,
  client_name text,
  invoiced_revenue numeric,
  payments_received numeric,
  outstanding_balance numeric,
  labor_hours numeric,
  labor_cost_rate numeric,
  labor_cost numeric,
  material_cost numeric,
  overhead_cost numeric,
  total_cost numeric,
  gross_profit numeric,
  gross_margin_percent numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with target_project as (
    select p.id, p.name, p.client_id, c.name as client_name
    from public.projects p
    left join public.clients c on c.id = p.client_id
    where p.id = p_project_id and public.can_view_profitability()
  ),
  invoice_totals as (
    select
      coalesce(sum(i.subtotal - i.discount_amount)
        filter (where i.status in ('sent', 'partially_paid', 'paid')), 0)::numeric(14,2)
        as revenue,
      coalesce(sum(i.balance_due)
        filter (where i.status in ('sent', 'partially_paid')), 0)::numeric(14,2)
        as outstanding
    from public.invoices i
    where i.project_id = p_project_id
  ),
  payment_totals as (
    select coalesce(sum(ip.amount), 0)::numeric(14,2) as received
    from public.invoice_payments ip
    join public.invoices i on i.id = ip.invoice_id
    where i.project_id = p_project_id and ip.reversed_at is null
  ),
  work_totals as (
    select coalesce(sum(te.hours), 0)::numeric(12,2) as hours
    from public.time_entries te
    join public.work_orders wo on wo.id = te.work_order_id
    where wo.project_id = p_project_id
  ),
  material_totals as (
    select coalesce(sum(me.line_total), 0)::numeric(14,2) as materials
    from public.material_entries me
    join public.work_orders wo on wo.id = me.work_order_id
    where wo.project_id = p_project_id and me.reversed_at is null
  ),
  settings as (
    select
      coalesce(pfs.labor_cost_rate, 0)::numeric(12,2) as rate,
      coalesce(pfs.overhead_cost, 0)::numeric(14,2) as overhead
    from (select 1) seed
    left join public.project_financial_settings pfs on pfs.project_id = p_project_id
  ),
  figures as (
    select
      tp.id,
      tp.name,
      tp.client_id,
      tp.client_name,
      it.revenue,
      pt.received,
      it.outstanding,
      wt.hours,
      s.rate,
      round(wt.hours * s.rate, 2)::numeric(14,2) as labor,
      mt.materials,
      s.overhead
    from target_project tp
    cross join invoice_totals it
    cross join payment_totals pt
    cross join work_totals wt
    cross join material_totals mt
    cross join settings s
  )
  select
    f.id,
    f.name,
    f.client_id,
    f.client_name,
    f.revenue,
    f.received,
    f.outstanding,
    f.hours,
    f.rate,
    f.labor,
    f.materials,
    f.overhead,
    round(f.labor + f.materials + f.overhead, 2)::numeric(14,2),
    round(f.revenue - f.labor - f.materials - f.overhead, 2)::numeric(14,2),
    case
      when f.revenue = 0 then null
      else round(
        (f.revenue - f.labor - f.materials - f.overhead) * 100 / f.revenue,
        2
      )::numeric(8,2)
    end
  from figures f
$$;

drop trigger if exists trg_project_financial_settings_touch
  on public.project_financial_settings;
create trigger trg_project_financial_settings_touch
  before update on public.project_financial_settings
  for each row execute function public.touch_updated_at();

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.project_financial_settings enable row level security;

drop policy if exists invoices_view on public.invoices;
create policy invoices_view on public.invoices for select
  using (public.can_view_billing());
drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices for insert
  with check (public.can_manage_billing() and created_by = auth.uid());
drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices for update
  using (public.can_manage_billing())
  with check (public.can_manage_billing());

drop policy if exists invoice_items_view on public.invoice_items;
create policy invoice_items_view on public.invoice_items for select
  using (
    public.can_view_billing()
    and exists (select 1 from public.invoices i where i.id = invoice_id)
  );
drop policy if exists invoice_items_insert on public.invoice_items;
create policy invoice_items_insert on public.invoice_items for insert
  with check (
    public.can_manage_billing()
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.status = 'draft'
    )
  );
drop policy if exists invoice_items_update on public.invoice_items;
create policy invoice_items_update on public.invoice_items for update
  using (
    public.can_manage_billing()
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.status = 'draft'
    )
  )
  with check (
    public.can_manage_billing()
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.status = 'draft'
    )
  );
drop policy if exists invoice_items_delete on public.invoice_items;
create policy invoice_items_delete on public.invoice_items for delete
  using (
    public.can_manage_billing()
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.status = 'draft'
    )
  );

drop policy if exists invoice_payments_view on public.invoice_payments;
create policy invoice_payments_view on public.invoice_payments for select
  using (
    public.can_view_billing()
    and exists (select 1 from public.invoices i where i.id = invoice_id)
  );

drop policy if exists project_financial_settings_view on public.project_financial_settings;
create policy project_financial_settings_view on public.project_financial_settings for select
  using (public.can_view_profitability());
drop policy if exists project_financial_settings_manage on public.project_financial_settings;
create policy project_financial_settings_manage on public.project_financial_settings for all
  using (public.can_manage_project_financials())
  with check (
    public.can_manage_project_financials()
    and updated_by = auth.uid()
  );

revoke all on function public.next_invoice_number() from public;
grant execute on function public.next_invoice_number() to authenticated;
revoke all on function public.create_invoice_from_estimate(uuid, date, date) from public;
grant execute on function public.create_invoice_from_estimate(uuid, date, date) to authenticated;
revoke all on function public.record_invoice_payment(
  uuid, public.invoice_payment_type, date, numeric,
  public.invoice_payment_method, text, text
) from public;
grant execute on function public.record_invoice_payment(
  uuid, public.invoice_payment_type, date, numeric,
  public.invoice_payment_method, text, text
) to authenticated;
revoke all on function public.reverse_invoice_payment(uuid, text) from public;
grant execute on function public.reverse_invoice_payment(uuid, text) to authenticated;
revoke all on function public.billing_project_directory() from public;
grant execute on function public.billing_project_directory() to authenticated;
revoke all on function public.billing_estimate_directory() from public;
grant execute on function public.billing_estimate_directory() to authenticated;
revoke all on function public.project_profitability(uuid) from public;
grant execute on function public.project_profitability(uuid) to authenticated;
