-- P4: suppliers, inventory, purchasing, and traceable project stock usage.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'purchase_order_status') then
    create type public.purchase_order_status as enum (
      'draft', 'ordered', 'partially_received', 'received', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'inventory_movement_type') then
    create type public.inventory_movement_type as enum (
      'receipt', 'issue', 'adjustment_in', 'adjustment_out', 'return_from_project'
    );
  end if;
end $$;

create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  account_number  text,
  contact_name    text,
  email           text,
  phone           text,
  website         text,
  address         text,
  notes           text,
  active          boolean not null default true,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists suppliers_name_unique
  on public.suppliers (lower(name));

create table if not exists public.inventory_items (
  id                     uuid primary key default gen_random_uuid(),
  sku                    text not null check (btrim(sku) <> ''),
  name                   text not null check (btrim(name) <> ''),
  description            text,
  category               text not null default 'other' check (
    category in (
      'aluminum', 'steel', 'fastener', 'paint', 'mechanical', 'electrical',
      'dock', 'consumable', 'safety', 'part', 'other'
    )
  ),
  unit                   text not null default 'ea' check (btrim(unit) <> ''),
  quantity_on_hand       numeric(14,3) not null default 0 check (quantity_on_hand >= 0),
  average_cost           numeric(14,4) not null default 0 check (average_cost >= 0),
  selling_price          numeric(12,2) check (selling_price is null or selling_price >= 0),
  reorder_point          numeric(14,3) not null default 0 check (reorder_point >= 0),
  location               text,
  preferred_supplier_id  uuid references public.suppliers(id) on delete set null,
  active                 boolean not null default true,
  created_by             uuid references public.profiles(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index if not exists inventory_items_sku_unique
  on public.inventory_items (lower(sku));

create sequence if not exists public.purchase_order_number_seq start with 1001;

create or replace function public.next_purchase_order_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'PO-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.purchase_order_number_seq')::text, 4, '0')
$$;

create table if not exists public.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  po_number       text not null unique default public.next_purchase_order_number(),
  supplier_id     uuid not null references public.suppliers(id) on delete restrict,
  status          public.purchase_order_status not null default 'draft',
  order_date      date not null default current_date,
  expected_date   date,
  notes           text,
  subtotal        numeric(14,2) not null default 0 check (subtotal >= 0),
  ordered_at      timestamptz,
  received_at     timestamptz,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint purchase_orders_dates_check check (
    expected_date is null or expected_date >= order_date
  )
);

create table if not exists public.purchase_order_items (
  id                 uuid primary key default gen_random_uuid(),
  purchase_order_id  uuid not null references public.purchase_orders(id) on delete cascade,
  inventory_item_id  uuid not null references public.inventory_items(id) on delete restrict,
  supplier_sku       text,
  description        text not null check (btrim(description) <> ''),
  quantity           numeric(14,3) not null check (quantity > 0),
  quantity_received  numeric(14,3) not null default 0 check (
    quantity_received >= 0 and quantity_received <= quantity
  ),
  unit               text not null default 'ea' check (btrim(unit) <> ''),
  unit_cost          numeric(14,4) not null default 0 check (unit_cost >= 0),
  line_total         numeric(14,2) generated always as (
                       round(quantity * unit_cost, 2)
                     ) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (purchase_order_id, inventory_item_id)
);

create table if not exists public.inventory_movements (
  id                      uuid primary key default gen_random_uuid(),
  inventory_item_id       uuid not null references public.inventory_items(id) on delete restrict,
  movement_type           public.inventory_movement_type not null,
  quantity                numeric(14,3) not null check (quantity > 0),
  unit_cost               numeric(14,4) not null default 0 check (unit_cost >= 0),
  purchase_order_item_id  uuid references public.purchase_order_items(id) on delete restrict,
  project_id              uuid references public.projects(id) on delete restrict,
  work_order_id           uuid references public.work_orders(id) on delete restrict,
  reverses_movement_id    uuid unique references public.inventory_movements(id) on delete restrict,
  note                    text,
  occurred_at             timestamptz not null default now(),
  created_by              uuid not null references public.profiles(id),
  constraint inventory_movement_reference_check check (
    (
      movement_type = 'receipt'
      and purchase_order_item_id is not null
      and project_id is null
      and work_order_id is null
      and reverses_movement_id is null
    )
    or (
      movement_type = 'issue'
      and purchase_order_item_id is null
      and project_id is not null
      and work_order_id is not null
      and reverses_movement_id is null
    )
    or (
      movement_type in ('adjustment_in', 'adjustment_out')
      and purchase_order_item_id is null
      and project_id is null
      and work_order_id is null
      and reverses_movement_id is null
    )
    or (
      movement_type = 'return_from_project'
      and purchase_order_item_id is null
      and project_id is not null
      and work_order_id is not null
      and reverses_movement_id is not null
    )
  )
);

alter table public.material_entries
  add column if not exists inventory_item_id uuid
    references public.inventory_items(id) on delete restrict;
alter table public.material_entries
  add column if not exists inventory_movement_id uuid
    unique references public.inventory_movements(id) on delete restrict;
alter table public.material_entries
  add column if not exists reversed_at timestamptz;
alter table public.material_entries
  add column if not exists reversed_by uuid references public.profiles(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'material_entries_inventory_reference_check'
      and conrelid = 'public.material_entries'::regclass
  ) then
    alter table public.material_entries
      add constraint material_entries_inventory_reference_check check (
        (inventory_item_id is null and inventory_movement_id is null)
        or (inventory_item_id is not null and inventory_movement_id is not null)
      );
  end if;
end $$;

drop trigger if exists trg_suppliers_touch on public.suppliers;
create trigger trg_suppliers_touch
  before update on public.suppliers
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_inventory_items_touch on public.inventory_items;
create trigger trg_inventory_items_touch
  before update on public.inventory_items
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_purchase_orders_touch on public.purchase_orders;
create trigger trg_purchase_orders_touch
  before update on public.purchase_orders
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_purchase_order_items_touch on public.purchase_order_items;
create trigger trg_purchase_order_items_touch
  before update on public.purchase_order_items
  for each row execute function public.touch_updated_at();

create index if not exists inventory_items_stock_idx
  on public.inventory_items (active, quantity_on_hand, reorder_point);
create index if not exists inventory_items_supplier_idx
  on public.inventory_items (preferred_supplier_id, name);
create index if not exists purchase_orders_supplier_status_idx
  on public.purchase_orders (supplier_id, status, order_date desc);
create index if not exists purchase_order_items_order_idx
  on public.purchase_order_items (purchase_order_id, created_at);
create index if not exists inventory_movements_item_date_idx
  on public.inventory_movements (inventory_item_id, occurred_at desc);
create index if not exists inventory_movements_work_order_idx
  on public.inventory_movements (work_order_id, occurred_at desc)
  where work_order_id is not null;
create index if not exists material_entries_inventory_idx
  on public.material_entries (inventory_item_id, created_at desc)
  where inventory_item_id is not null;

create or replace function public.can_manage_inventory()
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
      and role::text in ('owner', 'project_manager', 'parts')
  )
$$;

create or replace function public.can_view_inventory()
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
      and role::text in ('owner', 'project_manager', 'parts', 'sales', 'accounting')
  )
$$;

create or replace function public.can_view_purchasing()
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
      and role::text in ('owner', 'project_manager', 'parts', 'accounting')
  )
$$;

create or replace function public.protect_inventory_balance_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.quantity_on_hand is distinct from old.quantity_on_hand
    or new.average_cost is distinct from old.average_cost
  ) and coalesce(current_setting('coast.inventory_ledger', true), '') <> 'on' then
    raise exception 'Inventory balances can only change through the stock ledger';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_protect_balance on public.inventory_items;
create trigger inventory_items_protect_balance
  before update on public.inventory_items
  for each row execute function public.protect_inventory_balance_fields();

create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_quantity numeric(14,3);
  current_average numeric(14,4);
  next_quantity numeric(14,3);
  next_average numeric(14,4);
  previous_flag text := coalesce(current_setting('coast.inventory_ledger', true), '');
begin
  select quantity_on_hand, average_cost
  into current_quantity, current_average
  from public.inventory_items
  where id = new.inventory_item_id
  for update;

  if not found then
    raise exception 'Inventory item not found';
  end if;

  if new.movement_type in ('issue', 'adjustment_out') then
    next_quantity := current_quantity - new.quantity;
    new.unit_cost := current_average;
  else
    next_quantity := current_quantity + new.quantity;
  end if;

  if next_quantity < 0 then
    raise exception 'Insufficient inventory: % available, % requested',
      current_quantity, new.quantity;
  end if;

  if new.movement_type in ('receipt', 'adjustment_in', 'return_from_project') then
    if next_quantity = 0 then
      next_average := current_average;
    else
      next_average := round(
        ((current_quantity * current_average) + (new.quantity * new.unit_cost)) /
        next_quantity,
        4
      );
    end if;
  else
    next_average := current_average;
  end if;

  perform set_config('coast.inventory_ledger', 'on', true);
  update public.inventory_items
  set quantity_on_hand = next_quantity,
      average_cost = next_average
  where id = new.inventory_item_id;
  perform set_config('coast.inventory_ledger', previous_flag, true);

  return new;
end;
$$;

drop trigger if exists inventory_movements_apply on public.inventory_movements;
create trigger inventory_movements_apply
  before insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

create or replace function public.protect_inventory_movement_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Inventory movement history is immutable';
end;
$$;

drop trigger if exists inventory_movements_immutable on public.inventory_movements;
create trigger inventory_movements_immutable
  before update or delete on public.inventory_movements
  for each row execute function public.protect_inventory_movement_history();

create or replace function public.recalculate_purchase_order_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_purchase_order_id uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
begin
  update public.purchase_orders
  set subtotal = coalesce((
    select sum(line_total)
    from public.purchase_order_items
    where purchase_order_id = target_purchase_order_id
  ), 0)
  where id = target_purchase_order_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists purchase_order_items_recalculate on public.purchase_order_items;
create trigger purchase_order_items_recalculate
  after insert or update or delete on public.purchase_order_items
  for each row execute function public.recalculate_purchase_order_subtotal();

create or replace function public.enforce_purchase_order_item_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_purchase_order_id uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
  target_status public.purchase_order_status;
  receipt_update boolean :=
    coalesce(current_setting('coast.inventory_receipt', true), '') = 'on';
begin
  select status into target_status
  from public.purchase_orders
  where id = target_purchase_order_id;

  if target_status is null then
    raise exception 'Purchase order not found';
  end if;

  if tg_op = 'UPDATE' and receipt_update then
    if new.purchase_order_id is distinct from old.purchase_order_id
       or new.inventory_item_id is distinct from old.inventory_item_id
       or new.supplier_sku is distinct from old.supplier_sku
       or new.description is distinct from old.description
       or new.quantity is distinct from old.quantity
       or new.unit is distinct from old.unit
       or new.unit_cost is distinct from old.unit_cost then
      raise exception 'Receiving can only change the received quantity';
    end if;
    return new;
  end if;

  if target_status <> 'draft' then
    raise exception 'Purchase order lines can only be edited while draft';
  end if;

  if tg_op = 'INSERT' and new.quantity_received <> 0 then
    raise exception 'New purchase order lines cannot be pre-received';
  end if;
  if tg_op = 'UPDATE' and new.quantity_received is distinct from old.quantity_received then
    raise exception 'Use receiving to change received quantity';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists purchase_order_items_enforce_edit on public.purchase_order_items;
create trigger purchase_order_items_enforce_edit
  before insert or update or delete on public.purchase_order_items
  for each row execute function public.enforce_purchase_order_item_edit();

create or replace function public.enforce_purchase_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  received_quantity numeric(14,3);
  line_count integer;
  receipt_update boolean :=
    coalesce(current_setting('coast.inventory_receipt', true), '') = 'on';
begin
  if new.status = old.status then
    return new;
  end if;

  if auth.uid() is not null and not public.can_manage_inventory() then
    raise exception 'Inventory manager permission required';
  end if;

  select count(*), coalesce(sum(quantity_received), 0)
  into line_count, received_quantity
  from public.purchase_order_items
  where purchase_order_id = old.id;

  if old.status = 'draft' and new.status = 'ordered' then
    if line_count = 0 then
      raise exception 'Add at least one line before ordering';
    end if;
    new.ordered_at := coalesce(old.ordered_at, now());
  elsif old.status in ('ordered', 'partially_received')
        and new.status in ('partially_received', 'received')
        and receipt_update then
    if new.status = 'received' then
      new.received_at := now();
    end if;
  elsif old.status = 'ordered' and new.status = 'cancelled' then
    if received_quantity > 0 then
      raise exception 'A received purchase order cannot be cancelled';
    end if;
  elsif old.status = 'draft' and new.status = 'cancelled' then
    null;
  elsif old.status = 'cancelled' and new.status = 'draft' then
    new.ordered_at := null;
  else
    raise exception 'Purchase order cannot move from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_orders_enforce_status on public.purchase_orders;
create trigger purchase_orders_enforce_status
  before update of status on public.purchase_orders
  for each row execute function public.enforce_purchase_order_status_transition();

create or replace function public.protect_inventory_material_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.inventory_movement_id is not null then
    if tg_op = 'UPDATE'
       and coalesce(current_setting('coast.inventory_reversal', true), '') = 'on'
       and new.work_order_id is not distinct from old.work_order_id
       and new.description is not distinct from old.description
       and new.part_number is not distinct from old.part_number
       and new.quantity is not distinct from old.quantity
       and new.unit is not distinct from old.unit
       and new.unit_cost is not distinct from old.unit_cost
       and new.entered_by is not distinct from old.entered_by
       and new.inventory_item_id is not distinct from old.inventory_item_id
       and new.inventory_movement_id is not distinct from old.inventory_movement_id then
      return new;
    end if;
    raise exception 'Warehouse material entries must be reversed through inventory';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists material_entries_protect_inventory on public.material_entries;
create trigger material_entries_protect_inventory
  before update or delete on public.material_entries
  for each row execute function public.protect_inventory_material_entry();

create or replace function public.receive_purchase_order_item(
  p_purchase_order_item_id uuid,
  p_quantity numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_line public.purchase_order_items%rowtype;
  target_order public.purchase_orders%rowtype;
  movement_id uuid;
  all_received boolean;
  previous_flag text := coalesce(current_setting('coast.inventory_receipt', true), '');
begin
  if not public.can_manage_inventory() then
    raise exception 'Inventory manager permission required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Received quantity must be greater than zero';
  end if;

  select * into target_line
  from public.purchase_order_items
  where id = p_purchase_order_item_id
  for update;
  if not found then
    raise exception 'Purchase order line not found';
  end if;

  select * into target_order
  from public.purchase_orders
  where id = target_line.purchase_order_id
  for update;
  if target_order.status not in ('ordered', 'partially_received') then
    raise exception 'Purchase order is not open for receiving';
  end if;
  if target_line.quantity_received + p_quantity > target_line.quantity then
    raise exception 'Received quantity exceeds the remaining order quantity';
  end if;

  insert into public.inventory_movements (
    inventory_item_id, movement_type, quantity, unit_cost,
    purchase_order_item_id, note, created_by
  ) values (
    target_line.inventory_item_id, 'receipt', p_quantity, target_line.unit_cost,
    target_line.id, nullif(btrim(p_note), ''), auth.uid()
  ) returning id into movement_id;

  perform set_config('coast.inventory_receipt', 'on', true);
  update public.purchase_order_items
  set quantity_received = quantity_received + p_quantity
  where id = target_line.id;

  select bool_and(quantity_received >= quantity)
  into all_received
  from public.purchase_order_items
  where purchase_order_id = target_order.id;

  update public.purchase_orders
  set status = case
    when all_received then 'received'::public.purchase_order_status
    else 'partially_received'::public.purchase_order_status
  end
  where id = target_order.id;
  perform set_config('coast.inventory_receipt', previous_flag, true);

  return movement_id;
end;
$$;

create or replace function public.adjust_inventory(
  p_inventory_item_id uuid,
  p_direction text,
  p_quantity numeric,
  p_unit_cost numeric,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_average numeric(14,4);
  movement_id uuid;
begin
  if not public.can_manage_inventory() then
    raise exception 'Inventory manager permission required';
  end if;
  if p_direction not in ('in', 'out') then
    raise exception 'Inventory adjustment direction is invalid';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Adjustment quantity must be greater than zero';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'Adjustment reason is required';
  end if;

  select average_cost into item_average
  from public.inventory_items
  where id = p_inventory_item_id;
  if not found then
    raise exception 'Inventory item not found';
  end if;

  if p_direction = 'in' and p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'Unit cost cannot be negative';
  end if;

  insert into public.inventory_movements (
    inventory_item_id, movement_type, quantity, unit_cost, note, created_by
  ) values (
    p_inventory_item_id,
    case
      when p_direction = 'in' then 'adjustment_in'::public.inventory_movement_type
      else 'adjustment_out'::public.inventory_movement_type
    end,
    p_quantity,
    case when p_direction = 'in' then coalesce(p_unit_cost, item_average) else item_average end,
    btrim(p_note),
    auth.uid()
  ) returning id into movement_id;

  return movement_id;
end;
$$;

create or replace function public.issue_inventory_to_work_order(
  p_inventory_item_id uuid,
  p_work_order_id uuid,
  p_quantity numeric,
  p_note text default null
)
returns table (movement_id uuid, material_entry_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_item public.inventory_items%rowtype;
  target_work_order public.work_orders%rowtype;
  created_movement public.inventory_movements%rowtype;
  created_material_id uuid;
begin
  if not public.can_manage_inventory() then
    raise exception 'Inventory manager permission required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Issue quantity must be greater than zero';
  end if;

  select * into target_item
  from public.inventory_items
  where id = p_inventory_item_id and active = true;
  if not found then
    raise exception 'Active inventory item not found';
  end if;

  select * into target_work_order
  from public.work_orders
  where id = p_work_order_id;
  if not found then
    raise exception 'Work order not found';
  end if;
  if target_work_order.status in ('completed', 'cancelled') then
    raise exception 'Inventory cannot be issued to a closed work order';
  end if;

  insert into public.inventory_movements (
    inventory_item_id, movement_type, quantity, unit_cost,
    project_id, work_order_id, note, created_by
  ) values (
    target_item.id, 'issue', p_quantity, target_item.average_cost,
    target_work_order.project_id, target_work_order.id,
    nullif(btrim(p_note), ''), auth.uid()
  ) returning * into created_movement;

  insert into public.material_entries (
    work_order_id, description, part_number, quantity, unit, unit_cost,
    entered_by, inventory_item_id, inventory_movement_id
  ) values (
    target_work_order.id, target_item.name, target_item.sku, p_quantity,
    target_item.unit, created_movement.unit_cost, auth.uid(),
    target_item.id, created_movement.id
  ) returning id into created_material_id;

  return query select created_movement.id, created_material_id;
end;
$$;

create or replace function public.reverse_inventory_issue(
  p_material_entry_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_material public.material_entries%rowtype;
  target_movement public.inventory_movements%rowtype;
  reversal_id uuid;
  previous_flag text := coalesce(current_setting('coast.inventory_reversal', true), '');
begin
  if not public.can_manage_inventory() then
    raise exception 'Inventory manager permission required';
  end if;

  select * into target_material
  from public.material_entries
  where id = p_material_entry_id
  for update;
  if not found or target_material.inventory_movement_id is null then
    raise exception 'Warehouse material entry not found';
  end if;
  if target_material.reversed_at is not null then
    raise exception 'Warehouse issue has already been reversed';
  end if;

  select * into target_movement
  from public.inventory_movements
  where id = target_material.inventory_movement_id
    and movement_type = 'issue';
  if not found then
    raise exception 'Original inventory issue not found';
  end if;

  insert into public.inventory_movements (
    inventory_item_id, movement_type, quantity, unit_cost,
    project_id, work_order_id, reverses_movement_id, note, created_by
  ) values (
    target_material.inventory_item_id, 'return_from_project',
    target_material.quantity, target_material.unit_cost,
    target_movement.project_id, target_movement.work_order_id,
    target_movement.id,
    coalesce(nullif(btrim(p_note), ''), 'Reversed warehouse issue'),
    auth.uid()
  ) returning id into reversal_id;

  perform set_config('coast.inventory_reversal', 'on', true);
  update public.material_entries
  set reversed_at = now(), reversed_by = auth.uid()
  where id = target_material.id;
  perform set_config('coast.inventory_reversal', previous_flag, true);

  return reversal_id;
end;
$$;

revoke all on function public.receive_purchase_order_item(uuid, numeric, text) from public;
grant execute on function public.receive_purchase_order_item(uuid, numeric, text) to authenticated;
revoke all on function public.adjust_inventory(uuid, text, numeric, numeric, text) from public;
grant execute on function public.adjust_inventory(uuid, text, numeric, numeric, text) to authenticated;
revoke all on function public.issue_inventory_to_work_order(uuid, uuid, numeric, text) from public;
grant execute on function public.issue_inventory_to_work_order(uuid, uuid, numeric, text) to authenticated;
revoke all on function public.reverse_inventory_issue(uuid, text) from public;
grant execute on function public.reverse_inventory_issue(uuid, text) to authenticated;

alter table public.suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.inventory_movements enable row level security;

drop policy if exists suppliers_view on public.suppliers;
create policy suppliers_view on public.suppliers for select
  using (public.can_view_purchasing());
drop policy if exists suppliers_manage on public.suppliers;
create policy suppliers_manage on public.suppliers for all
  using (public.can_manage_inventory())
  with check (public.can_manage_inventory());

drop policy if exists inventory_items_view on public.inventory_items;
create policy inventory_items_view on public.inventory_items for select
  using (public.can_view_inventory());
drop policy if exists inventory_items_manage on public.inventory_items;
create policy inventory_items_manage on public.inventory_items for all
  using (public.can_manage_inventory())
  with check (public.can_manage_inventory());

drop policy if exists purchase_orders_view on public.purchase_orders;
create policy purchase_orders_view on public.purchase_orders for select
  using (public.can_view_purchasing());
drop policy if exists purchase_orders_manage on public.purchase_orders;
create policy purchase_orders_manage on public.purchase_orders for all
  using (public.can_manage_inventory())
  with check (public.can_manage_inventory());

drop policy if exists purchase_order_items_view on public.purchase_order_items;
create policy purchase_order_items_view on public.purchase_order_items for select
  using (public.can_view_purchasing());
drop policy if exists purchase_order_items_manage on public.purchase_order_items;
create policy purchase_order_items_manage on public.purchase_order_items for all
  using (public.can_manage_inventory())
  with check (public.can_manage_inventory());

drop policy if exists inventory_movements_view on public.inventory_movements;
create policy inventory_movements_view on public.inventory_movements for select
  using (public.can_view_purchasing());
