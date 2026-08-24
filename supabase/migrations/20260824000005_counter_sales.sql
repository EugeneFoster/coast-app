-- P7: atomic counter sales for the parts counter, paid receipts, and stock returns.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'counter_sale_status') then
    create type public.counter_sale_status as enum ('completed', 'void');
  end if;
end $$;

create sequence if not exists public.counter_sale_number_seq start with 1001;

create or replace function public.next_counter_sale_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'CS-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.counter_sale_number_seq')::text, 4, '0')
$$;

create table if not exists public.counter_sales (
  id                  uuid primary key default gen_random_uuid(),
  sale_number         text not null unique default public.next_counter_sale_number(),
  client_id           uuid references public.clients(id) on delete restrict,
  customer_name       text not null check (
                        btrim(customer_name) <> '' and char_length(customer_name) <= 200
                      ),
  status              public.counter_sale_status not null default 'completed',
  payment_method      public.invoice_payment_method not null,
  payment_reference   text check (
                        payment_reference is null or char_length(payment_reference) <= 120
                      ),
  subtotal            numeric(14,2) not null check (subtotal >= 0),
  tax_rate_percent    numeric(6,3) not null default 0 check (
                        tax_rate_percent >= 0 and tax_rate_percent <= 100
                      ),
  tax_amount          numeric(14,2) not null check (tax_amount >= 0),
  total               numeric(14,2) not null check (total >= 0),
  completed_at        timestamptz not null default now(),
  voided_at           timestamptz,
  voided_by           uuid references public.profiles(id),
  void_reason         text check (
                        void_reason is null or
                        (char_length(btrim(void_reason)) between 5 and 500)
                      ),
  created_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint counter_sales_totals_check check (
    tax_amount = round(subtotal * tax_rate_percent / 100, 2)
    and total = round(subtotal + tax_amount, 2)
  ),
  constraint counter_sales_void_check check (
    (
      status = 'completed'
      and voided_at is null
      and voided_by is null
      and void_reason is null
    )
    or (
      status = 'void'
      and voided_at is not null
      and voided_by is not null
      and void_reason is not null
    )
  )
);

create table if not exists public.counter_sale_items (
  id                  uuid primary key default gen_random_uuid(),
  counter_sale_id     uuid not null references public.counter_sales(id) on delete restrict,
  inventory_item_id   uuid not null references public.inventory_items(id) on delete restrict,
  sku                 text not null check (btrim(sku) <> ''),
  description         text not null check (btrim(description) <> ''),
  quantity            numeric(14,3) not null check (quantity > 0),
  unit                text not null check (btrim(unit) <> ''),
  unit_price          numeric(14,2) not null check (unit_price >= 0),
  line_total          numeric(14,2) generated always as (
                        round(quantity * unit_price, 2)
                      ) stored,
  sort_order          integer not null default 0 check (sort_order >= 0),
  created_at          timestamptz not null default now(),
  unique (counter_sale_id, inventory_item_id)
);

alter table public.inventory_movements
  add column if not exists counter_sale_id uuid
    references public.counter_sales(id) on delete restrict;

create table if not exists public.counter_sale_item_costs (
  counter_sale_item_id uuid primary key
                         references public.counter_sale_items(id) on delete restrict,
  counter_sale_id      uuid not null
                         references public.counter_sales(id) on delete restrict,
  inventory_item_id    uuid not null
                         references public.inventory_items(id) on delete restrict,
  issue_movement_id    uuid not null unique
                         references public.inventory_movements(id) on delete restrict,
  return_movement_id   uuid unique
                         references public.inventory_movements(id) on delete restrict,
  quantity             numeric(14,3) not null check (quantity > 0),
  unit_cost            numeric(14,4) not null check (unit_cost >= 0),
  total_cost           numeric(14,2) generated always as (
                         round(quantity * unit_cost, 2)
                       ) stored,
  created_at           timestamptz not null default now()
);

create index if not exists counter_sales_completed_idx
  on public.counter_sales (completed_at desc, id);
create index if not exists counter_sales_client_idx
  on public.counter_sales (client_id, completed_at desc)
  where client_id is not null;
create index if not exists counter_sale_items_sale_idx
  on public.counter_sale_items (counter_sale_id, sort_order, created_at);
create index if not exists counter_sale_items_inventory_idx
  on public.counter_sale_items (inventory_item_id, created_at desc);
create index if not exists counter_sale_costs_sale_idx
  on public.counter_sale_item_costs (counter_sale_id, created_at);
create index if not exists inventory_movements_counter_sale_idx
  on public.inventory_movements (counter_sale_id, occurred_at desc)
  where counter_sale_id is not null;

alter table public.inventory_movements
  drop constraint if exists inventory_movement_reference_check;

alter table public.inventory_movements
  add constraint inventory_movement_reference_check check (
    (
      movement_type = 'receipt'
      and purchase_order_item_id is not null
      and project_id is null
      and work_order_id is null
      and invoice_id is null
      and counter_sale_id is null
      and reverses_movement_id is null
    )
    or (
      movement_type = 'issue'
      and purchase_order_item_id is null
      and reverses_movement_id is null
      and (
        (
          project_id is not null
          and work_order_id is not null
          and invoice_id is null
          and counter_sale_id is null
        )
        or (
          project_id is null
          and work_order_id is null
          and invoice_id is not null
          and counter_sale_id is null
        )
        or (
          project_id is null
          and work_order_id is null
          and invoice_id is null
          and counter_sale_id is not null
        )
      )
    )
    or (
      movement_type in ('adjustment_in', 'adjustment_out')
      and purchase_order_item_id is null
      and project_id is null
      and work_order_id is null
      and invoice_id is null
      and counter_sale_id is null
      and reverses_movement_id is null
    )
    or (
      movement_type = 'return_from_project'
      and purchase_order_item_id is null
      and reverses_movement_id is not null
      and (
        (
          project_id is not null
          and work_order_id is not null
          and invoice_id is null
          and counter_sale_id is null
        )
        or (
          project_id is null
          and work_order_id is null
          and invoice_id is not null
          and counter_sale_id is null
        )
        or (
          project_id is null
          and work_order_id is null
          and invoice_id is null
          and counter_sale_id is not null
        )
      )
    )
  );

create or replace function public.can_manage_counter_sales()
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
      and role::text in ('owner', 'project_manager', 'sales', 'parts', 'accounting')
  )
$$;

create or replace function public.can_view_counter_sales()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_counter_sales()
$$;

create or replace function public.counter_sale_customer_directory()
returns table (
  id uuid,
  name text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name
  from public.clients c
  where public.can_view_counter_sales()
  order by c.name
$$;

create or replace function public.protect_counter_sale_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('coast.counter_sale_workflow', true), '') <> 'on' then
    raise exception 'Counter sales can only change through the counter sale workflow';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists counter_sales_protect on public.counter_sales;
create trigger counter_sales_protect
  before insert or update or delete on public.counter_sales
  for each row execute function public.protect_counter_sale_record();

drop trigger if exists counter_sale_items_protect on public.counter_sale_items;
create trigger counter_sale_items_protect
  before insert or update or delete on public.counter_sale_items
  for each row execute function public.protect_counter_sale_record();

drop trigger if exists counter_sale_item_costs_protect on public.counter_sale_item_costs;
create trigger counter_sale_item_costs_protect
  before insert or update or delete on public.counter_sale_item_costs
  for each row execute function public.protect_counter_sale_record();

create or replace function public.validate_counter_sale_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sale public.counter_sales%rowtype;
  original_movement public.inventory_movements%rowtype;
begin
  if new.counter_sale_id is null then
    return new;
  end if;
  if coalesce(current_setting('coast.counter_sale_workflow', true), '') <> 'on' then
    raise exception 'Counter sale stock can only change through the counter sale workflow';
  end if;

  select * into target_sale
  from public.counter_sales
  where id = new.counter_sale_id;
  if not found then
    raise exception 'Counter sale not found';
  end if;

  if new.movement_type = 'issue' then
    if target_sale.status <> 'completed' or new.reverses_movement_id is not null then
      raise exception 'Counter sale stock issue is invalid';
    end if;
  elsif new.movement_type = 'return_from_project' then
    if target_sale.status <> 'completed' or new.reverses_movement_id is null then
      raise exception 'Counter sale stock can only return while voiding a completed sale';
    end if;
    select * into original_movement
    from public.inventory_movements
    where id = new.reverses_movement_id;
    if not found
       or original_movement.movement_type <> 'issue'
       or original_movement.counter_sale_id is distinct from new.counter_sale_id
       or original_movement.inventory_item_id is distinct from new.inventory_item_id
       or original_movement.quantity is distinct from new.quantity
       or original_movement.unit_cost is distinct from new.unit_cost then
      raise exception 'Counter sale return does not match the original stock issue';
    end if;
  else
    raise exception 'Invalid counter sale inventory movement type';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_movements_validate_counter_sale
  on public.inventory_movements;
create trigger inventory_movements_validate_counter_sale
  before insert on public.inventory_movements
  for each row execute function public.validate_counter_sale_inventory_movement();

create or replace function public.validate_counter_sale_item_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_line public.counter_sale_items%rowtype;
  issue_movement public.inventory_movements%rowtype;
  return_movement public.inventory_movements%rowtype;
begin
  select * into linked_line
  from public.counter_sale_items
  where id = new.counter_sale_item_id;
  if not found
     or linked_line.counter_sale_id is distinct from new.counter_sale_id
     or linked_line.inventory_item_id is distinct from new.inventory_item_id
     or linked_line.quantity is distinct from new.quantity then
    raise exception 'Counter sale COGS does not match its sale line';
  end if;

  select * into issue_movement
  from public.inventory_movements
  where id = new.issue_movement_id;
  if not found
     or issue_movement.movement_type <> 'issue'
     or issue_movement.counter_sale_id is distinct from new.counter_sale_id
     or issue_movement.inventory_item_id is distinct from new.inventory_item_id
     or issue_movement.quantity is distinct from new.quantity
     or issue_movement.unit_cost is distinct from new.unit_cost
     or issue_movement.reverses_movement_id is not null then
    raise exception 'Counter sale COGS does not match its stock issue';
  end if;

  if new.return_movement_id is not null then
    select * into return_movement
    from public.inventory_movements
    where id = new.return_movement_id;
    if not found
       or return_movement.movement_type <> 'return_from_project'
       or return_movement.counter_sale_id is distinct from new.counter_sale_id
       or return_movement.inventory_item_id is distinct from new.inventory_item_id
       or return_movement.quantity is distinct from new.quantity
       or return_movement.unit_cost is distinct from new.unit_cost
       or return_movement.reverses_movement_id is distinct from new.issue_movement_id then
      raise exception 'Counter sale COGS does not match its stock return';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists counter_sale_item_costs_validate
  on public.counter_sale_item_costs;
create trigger counter_sale_item_costs_validate
  before insert or update on public.counter_sale_item_costs
  for each row execute function public.validate_counter_sale_item_cost();

create or replace function public.complete_counter_sale(
  p_client_id uuid,
  p_customer_name text,
  p_payment_method public.invoice_payment_method,
  p_payment_reference text,
  p_tax_rate numeric,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_sale public.counter_sales%rowtype;
  created_line public.counter_sale_items%rowtype;
  created_movement public.inventory_movements%rowtype;
  sale_line record;
  customer_snapshot text;
  clean_reference text := nullif(btrim(coalesce(p_payment_reference, '')), '');
  item_count integer;
  v_subtotal numeric(14,2);
  v_tax_amount numeric(14,2);
  previous_flag text := coalesce(current_setting('coast.counter_sale_workflow', true), '');
begin
  if not public.can_manage_counter_sales() then
    raise exception 'You do not have permission to complete counter sales';
  end if;
  if p_payment_method is null then
    raise exception 'Payment method is required';
  end if;
  if clean_reference is not null and char_length(clean_reference) > 120 then
    raise exception 'Payment reference is too long';
  end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100
     or scale(p_tax_rate) > 3 then
    raise exception 'Tax rate must be between 0 and 100 with up to three decimals';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Sale items must be an array';
  end if;

  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 100 then
    raise exception 'A counter sale must contain between 1 and 100 items';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) entry
    where jsonb_typeof(entry) <> 'object'
       or coalesce(entry->>'inventory_item_id', '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(entry->>'quantity', '') !~ '^[0-9]+([.][0-9]{1,3})?$'
       or coalesce(entry->>'unit_price', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
  ) then
    raise exception 'Every sale item requires a valid item, quantity, and price';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) entry
    where (entry->>'quantity')::numeric <= 0
       or (entry->>'quantity')::numeric > 99999999999.999
       or (entry->>'unit_price')::numeric > 999999999999.99
  ) then
    raise exception 'Sale quantity or price is outside the allowed range';
  end if;
  if (
    select count(distinct entry->>'inventory_item_id')
    from jsonb_array_elements(p_items) entry
  ) <> item_count then
    raise exception 'Duplicate inventory items are not allowed';
  end if;

  if p_client_id is not null then
    select name into customer_snapshot
    from public.clients
    where id = p_client_id;
    if not found then
      raise exception 'Customer not found';
    end if;
  else
    customer_snapshot := coalesce(
      nullif(btrim(coalesce(p_customer_name, '')), ''),
      'Walk-in customer'
    );
  end if;
  if char_length(customer_snapshot) > 200 then
    raise exception 'Customer name is too long';
  end if;

  select coalesce(sum(round(
    (entry->>'quantity')::numeric * (entry->>'unit_price')::numeric,
    2
  )), 0)::numeric(14,2)
  into v_subtotal
  from jsonb_array_elements(p_items) entry;
  v_tax_amount := round(v_subtotal * p_tax_rate / 100, 2);

  perform set_config('coast.counter_sale_workflow', 'on', true);
  insert into public.counter_sales (
    client_id, customer_name, payment_method, payment_reference,
    subtotal, tax_rate_percent, tax_amount, total, created_by
  ) values (
    p_client_id, customer_snapshot, p_payment_method, clean_reference,
    v_subtotal, p_tax_rate, v_tax_amount,
    round(v_subtotal + v_tax_amount, 2), auth.uid()
  ) returning * into created_sale;

  for sale_line in
    select
      inv.id as inventory_item_id,
      inv.sku,
      inv.name,
      inv.unit,
      inv.average_cost,
      (entry.value->>'quantity')::numeric(14,3) as quantity,
      (entry.value->>'unit_price')::numeric(14,2) as unit_price,
      entry.ordinality::integer - 1 as sort_order
    from jsonb_array_elements(p_items) with ordinality as entry(value, ordinality)
    join public.inventory_items inv
      on inv.id = (entry.value->>'inventory_item_id')::uuid
    where inv.active = true
    order by inv.id
    for update of inv
  loop
    insert into public.counter_sale_items (
      counter_sale_id, inventory_item_id, sku, description,
      quantity, unit, unit_price, sort_order
    ) values (
      created_sale.id, sale_line.inventory_item_id, sale_line.sku, sale_line.name,
      sale_line.quantity, sale_line.unit, sale_line.unit_price, sale_line.sort_order
    ) returning * into created_line;

    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity, unit_cost,
      counter_sale_id, note, created_by
    ) values (
      sale_line.inventory_item_id, 'issue', sale_line.quantity,
      sale_line.average_cost, created_sale.id,
      'Sold on counter sale ' || created_sale.sale_number, auth.uid()
    ) returning * into created_movement;

    insert into public.counter_sale_item_costs (
      counter_sale_item_id, counter_sale_id, inventory_item_id,
      issue_movement_id, quantity, unit_cost
    ) values (
      created_line.id, created_sale.id, sale_line.inventory_item_id,
      created_movement.id, sale_line.quantity, created_movement.unit_cost
    );
  end loop;

  if (
    select count(*) from public.counter_sale_items
    where counter_sale_id = created_sale.id
  ) <> item_count then
    raise exception 'One or more active inventory items were not found';
  end if;

  perform set_config('coast.counter_sale_workflow', previous_flag, true);
  return created_sale.id;
end;
$$;

create or replace function public.void_counter_sale(
  p_counter_sale_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sale public.counter_sales%rowtype;
  cost_line record;
  created_return public.inventory_movements%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
  previous_flag text := coalesce(current_setting('coast.counter_sale_workflow', true), '');
begin
  if not public.can_manage_counter_sales() then
    raise exception 'You do not have permission to void counter sales';
  end if;
  if char_length(clean_reason) < 5 or char_length(clean_reason) > 500 then
    raise exception 'Void reason must be between 5 and 500 characters';
  end if;

  select * into target_sale
  from public.counter_sales
  where id = p_counter_sale_id
  for update;
  if not found then
    raise exception 'Counter sale not found';
  end if;
  if target_sale.status <> 'completed' then
    raise exception 'Counter sale is already void';
  end if;

  perform set_config('coast.counter_sale_workflow', 'on', true);
  for cost_line in
    select *
    from public.counter_sale_item_costs
    where counter_sale_id = target_sale.id
    order by inventory_item_id, counter_sale_item_id
  loop
    if cost_line.return_movement_id is not null then
      raise exception 'Counter sale item was already returned';
    end if;
    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity, unit_cost,
      counter_sale_id, reverses_movement_id, note, created_by
    ) values (
      cost_line.inventory_item_id, 'return_from_project',
      cost_line.quantity, cost_line.unit_cost, target_sale.id,
      cost_line.issue_movement_id,
      'Returned from void counter sale ' || target_sale.sale_number,
      auth.uid()
    ) returning * into created_return;

    update public.counter_sale_item_costs
    set return_movement_id = created_return.id
    where counter_sale_item_id = cost_line.counter_sale_item_id;
  end loop;

  update public.counter_sales
  set status = 'void',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = clean_reason,
      updated_at = now()
  where id = target_sale.id;
  perform set_config('coast.counter_sale_workflow', previous_flag, true);
end;
$$;

alter table public.counter_sales enable row level security;
alter table public.counter_sale_items enable row level security;
alter table public.counter_sale_item_costs enable row level security;

drop policy if exists counter_sales_view on public.counter_sales;
create policy counter_sales_view on public.counter_sales for select
  using (public.can_view_counter_sales());

drop policy if exists counter_sale_items_view on public.counter_sale_items;
create policy counter_sale_items_view on public.counter_sale_items for select
  using (
    public.can_view_counter_sales()
    and exists (
      select 1 from public.counter_sales cs where cs.id = counter_sale_id
    )
  );

drop policy if exists counter_sale_item_costs_profitability_view
  on public.counter_sale_item_costs;
create policy counter_sale_item_costs_profitability_view
  on public.counter_sale_item_costs for select
  using (
    public.can_view_profitability()
    and exists (
      select 1 from public.counter_sales cs where cs.id = counter_sale_id
    )
  );

revoke all on function public.next_counter_sale_number() from public;
revoke all on function public.counter_sale_customer_directory() from public;
grant execute on function public.counter_sale_customer_directory() to authenticated;
revoke all on function public.complete_counter_sale(
  uuid, text, public.invoice_payment_method, text, numeric, jsonb
) from public;
grant execute on function public.complete_counter_sale(
  uuid, text, public.invoice_payment_method, text, numeric, jsonb
) to authenticated;
revoke all on function public.void_counter_sale(uuid, text) from public;
grant execute on function public.void_counter_sale(uuid, text) to authenticated;
