-- P6: connect invoice part lines to stock, record COGS, and keep sale movements auditable.

alter table public.invoice_items
  add column if not exists inventory_item_id uuid
    references public.inventory_items(id) on delete restrict;

alter table public.inventory_movements
  add column if not exists invoice_id uuid
    references public.invoices(id) on delete restrict;

create index if not exists invoice_items_inventory_idx
  on public.invoice_items (inventory_item_id, invoice_id)
  where inventory_item_id is not null;

create index if not exists inventory_movements_invoice_idx
  on public.inventory_movements (invoice_id, occurred_at desc)
  where invoice_id is not null;

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
        )
        or (
          project_id is null
          and work_order_id is null
          and invoice_id is not null
        )
      )
    )
    or (
      movement_type in ('adjustment_in', 'adjustment_out')
      and purchase_order_item_id is null
      and project_id is null
      and work_order_id is null
      and invoice_id is null
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
        )
        or (
          project_id is null
          and work_order_id is null
          and invoice_id is not null
        )
      )
    )
  );

create table if not exists public.invoice_item_costs (
  invoice_item_id       uuid primary key
                          references public.invoice_items(id) on delete cascade,
  invoice_id            uuid not null
                          references public.invoices(id) on delete cascade,
  inventory_item_id     uuid not null
                          references public.inventory_items(id) on delete restrict,
  inventory_movement_id uuid not null unique
                          references public.inventory_movements(id) on delete restrict,
  quantity              numeric(12,2) not null check (quantity > 0),
  unit_cost             numeric(14,4) not null check (unit_cost >= 0),
  total_cost            numeric(14,2) generated always as (
                          round(quantity * unit_cost, 2)
                        ) stored,
  created_at            timestamptz not null default now()
);

create index if not exists invoice_item_costs_invoice_idx
  on public.invoice_item_costs (invoice_id, created_at);

create or replace function public.validate_invoice_inventory_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_item public.inventory_items%rowtype;
begin
  if new.inventory_item_id is null then
    return new;
  end if;
  if new.item_type <> 'part' then
    raise exception 'Stock-linked invoice lines must use the Part line type';
  end if;
  select * into linked_item
  from public.inventory_items
  where id = new.inventory_item_id and active = true;
  if not found then
    raise exception 'Active inventory item not found';
  end if;
  if new.unit <> linked_item.unit then
    raise exception 'Invoice line unit must match the inventory item unit';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_items_validate_inventory on public.invoice_items;
create trigger invoice_items_validate_inventory
  before insert or update on public.invoice_items
  for each row execute function public.validate_invoice_inventory_item();

create or replace function public.protect_invoice_item_costs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('coast.invoice_stock', true), '') <> 'on' then
    raise exception 'Invoice COGS can only change through invoice stock workflow';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_item_costs_protect on public.invoice_item_costs;
create trigger invoice_item_costs_protect
  before insert or update or delete on public.invoice_item_costs
  for each row execute function public.protect_invoice_item_costs();

create or replace function public.validate_invoice_item_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_line public.invoice_items%rowtype;
  linked_movement public.inventory_movements%rowtype;
begin
  select * into linked_line
  from public.invoice_items
  where id = new.invoice_item_id;
  if not found
     or linked_line.invoice_id is distinct from new.invoice_id
     or linked_line.inventory_item_id is distinct from new.inventory_item_id
     or linked_line.quantity is distinct from new.quantity then
    raise exception 'Invoice COGS does not match its invoice line';
  end if;

  select * into linked_movement
  from public.inventory_movements
  where id = new.inventory_movement_id;
  if not found
     or linked_movement.movement_type <> 'issue'
     or linked_movement.invoice_id is distinct from new.invoice_id
     or linked_movement.inventory_item_id is distinct from new.inventory_item_id
     or linked_movement.quantity is distinct from new.quantity
     or linked_movement.unit_cost is distinct from new.unit_cost
     or linked_movement.reverses_movement_id is not null then
    raise exception 'Invoice COGS does not match its stock issue';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_item_costs_validate on public.invoice_item_costs;
create trigger invoice_item_costs_validate
  before insert or update on public.invoice_item_costs
  for each row execute function public.validate_invoice_item_cost();

create or replace function public.validate_invoice_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice public.invoices%rowtype;
  original_movement public.inventory_movements%rowtype;
begin
  if new.invoice_id is null then
    return new;
  end if;
  if coalesce(current_setting('coast.invoice_stock', true), '') <> 'on' then
    raise exception 'Invoice stock can only change through invoice status workflow';
  end if;

  select * into target_invoice
  from public.invoices
  where id = new.invoice_id;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if new.movement_type = 'issue' then
    if target_invoice.status <> 'draft' or new.reverses_movement_id is not null then
      raise exception 'Invoice stock can only be issued when sending a draft';
    end if;
  elsif new.movement_type = 'return_from_project' then
    if target_invoice.status <> 'sent' or new.reverses_movement_id is null then
      raise exception 'Invoice stock can only be returned when voiding a sent invoice';
    end if;
    select * into original_movement
    from public.inventory_movements
    where id = new.reverses_movement_id;
    if not found
       or original_movement.movement_type <> 'issue'
       or original_movement.invoice_id is distinct from new.invoice_id
       or original_movement.inventory_item_id is distinct from new.inventory_item_id
       or original_movement.quantity is distinct from new.quantity
       or original_movement.unit_cost is distinct from new.unit_cost then
      raise exception 'Invoice stock return does not match the original sale';
    end if;
  else
    raise exception 'Invalid invoice inventory movement type';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_movements_validate_invoice on public.inventory_movements;
create trigger inventory_movements_validate_invoice
  before insert on public.inventory_movements
  for each row execute function public.validate_invoice_inventory_movement();

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
  stock_line record;
  cost_line record;
  created_movement public.inventory_movements%rowtype;
  previous_stock_flag text :=
    coalesce(current_setting('coast.invoice_stock', true), '');
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
    if exists (
      select 1
      from public.invoice_items ii
      left join public.inventory_items inv on inv.id = ii.inventory_item_id
      where ii.invoice_id = old.id
        and ii.inventory_item_id is not null
        and (inv.id is null or not inv.active)
    ) then
      raise exception 'All stock-linked invoice lines must use active inventory items';
    end if;
    if exists (
      select 1 from public.invoice_item_costs where invoice_id = old.id
    ) then
      raise exception 'Invoice already has active stock issues';
    end if;

    perform set_config('coast.invoice_stock', 'on', true);
    for stock_line in
      select
        ii.id as invoice_item_id,
        ii.inventory_item_id,
        ii.quantity,
        inv.average_cost
      from public.invoice_items ii
      join public.inventory_items inv on inv.id = ii.inventory_item_id
      where ii.invoice_id = old.id
      order by ii.inventory_item_id, ii.id
    loop
      insert into public.inventory_movements (
        inventory_item_id, movement_type, quantity, unit_cost,
        invoice_id, note, created_by
      ) values (
        stock_line.inventory_item_id, 'issue', stock_line.quantity,
        stock_line.average_cost, old.id,
        'Sold on invoice ' || old.invoice_number, auth.uid()
      ) returning * into created_movement;

      insert into public.invoice_item_costs (
        invoice_item_id, invoice_id, inventory_item_id,
        inventory_movement_id, quantity, unit_cost
      ) values (
        stock_line.invoice_item_id, old.id, stock_line.inventory_item_id,
        created_movement.id, stock_line.quantity, created_movement.unit_cost
      );
    end loop;
    perform set_config('coast.invoice_stock', previous_stock_flag, true);
  elsif old.status = 'draft' and new.status = 'void' then
    null;
  elsif old.status = 'sent' and new.status = 'void' then
    if old.amount_paid <> 0 then
      raise exception 'An invoice with payments cannot be voided';
    end if;
    perform set_config('coast.invoice_stock', 'on', true);
    for cost_line in
      select iic.*, im.id as original_movement_id
      from public.invoice_item_costs iic
      join public.inventory_movements im on im.id = iic.inventory_movement_id
      where iic.invoice_id = old.id
      order by iic.inventory_item_id, iic.invoice_item_id
    loop
      insert into public.inventory_movements (
        inventory_item_id, movement_type, quantity, unit_cost,
        invoice_id, reverses_movement_id, note, created_by
      ) values (
        cost_line.inventory_item_id, 'return_from_project',
        cost_line.quantity, cost_line.unit_cost, old.id,
        cost_line.original_movement_id,
        'Returned from void invoice ' || old.invoice_number, auth.uid()
      );
    end loop;
    delete from public.invoice_item_costs where invoice_id = old.id;
    perform set_config('coast.invoice_stock', previous_stock_flag, true);
  elsif old.status = 'void' and new.status = 'draft' then
    select count(*) into active_payments
    from public.invoice_payments
    where invoice_id = old.id and reversed_at is null;
    if old.amount_paid <> 0 or active_payments <> 0 then
      raise exception 'An invoice with payments cannot return to Draft';
    end if;
    if exists (
      select 1 from public.invoice_item_costs where invoice_id = old.id
    ) then
      raise exception 'Voided invoice still has active stock issues';
    end if;
  else
    raise exception 'Invoice cannot move from % to %', old.status, new.status;
  end if;

  new.sent_at := case
    when old.status = 'draft' and new.status = 'sent' then now()
    else old.sent_at
  end;
  new.paid_at := case
    when new.status = 'paid' then now()
    when old.status = 'paid' then null
    else old.paid_at
  end;
  new.voided_at := case
    when new.status = 'void' then now()
    when old.status = 'void' then null
    else old.voided_at
  end;
  new.balance_due := case
    when new.status = 'void' then 0
    else round(new.total - new.amount_paid, 2)
  end;
  return new;
end;
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
  work_material_totals as (
    select coalesce(sum(me.line_total), 0)::numeric(14,2) as materials
    from public.material_entries me
    join public.work_orders wo on wo.id = me.work_order_id
    where wo.project_id = p_project_id and me.reversed_at is null
  ),
  direct_part_totals as (
    select coalesce(sum(iic.total_cost), 0)::numeric(14,2) as parts
    from public.invoice_item_costs iic
    join public.invoices i on i.id = iic.invoice_id
    where i.project_id = p_project_id
      and i.status in ('sent', 'partially_paid', 'paid')
  ),
  material_totals as (
    select round(wm.materials + dp.parts, 2)::numeric(14,2) as materials
    from work_material_totals wm
    cross join direct_part_totals dp
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

alter table public.invoice_item_costs enable row level security;

drop policy if exists invoice_item_costs_profitability_view
  on public.invoice_item_costs;
create policy invoice_item_costs_profitability_view
  on public.invoice_item_costs for select
  using (
    public.can_view_profitability()
    and exists (
      select 1 from public.invoices i where i.id = invoice_id
    )
  );
