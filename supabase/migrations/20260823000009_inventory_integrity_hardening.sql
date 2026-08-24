-- P4 hardening: protect derived PO totals and warehouse material links.

create or replace function public.recalculate_purchase_order_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_purchase_order_id uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
  previous_flag text := coalesce(current_setting('coast.purchase_order_recalc', true), '');
begin
  perform set_config('coast.purchase_order_recalc', 'on', true);
  update public.purchase_orders
  set subtotal = coalesce((
    select sum(line_total)
    from public.purchase_order_items
    where purchase_order_id = target_purchase_order_id
  ), 0)
  where id = target_purchase_order_id;
  perform set_config('coast.purchase_order_recalc', previous_flag, true);
  return coalesce(new, old);
end;
$$;

create or replace function public.protect_purchase_order_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.subtotal is distinct from old.subtotal
     and coalesce(current_setting('coast.purchase_order_recalc', true), '') <> 'on' then
    raise exception 'Purchase order totals are calculated from order lines';
  end if;

  if old.status <> 'draft' and (
    new.supplier_id is distinct from old.supplier_id
    or new.order_date is distinct from old.order_date
    or new.expected_date is distinct from old.expected_date
    or new.notes is distinct from old.notes
  ) then
    raise exception 'Only draft purchase order details can be edited';
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_orders_protect_fields on public.purchase_orders;
create trigger purchase_orders_protect_fields
  before update on public.purchase_orders
  for each row execute function public.protect_purchase_order_fields();

create or replace function public.validate_inventory_material_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_movement public.inventory_movements%rowtype;
  reference_changed boolean;
  reversal_changed boolean;
begin
  reference_changed := tg_op = 'INSERT' or (
    new.inventory_item_id is distinct from old.inventory_item_id
    or new.inventory_movement_id is distinct from old.inventory_movement_id
  );
  reversal_changed := tg_op = 'INSERT' or (
    new.reversed_at is distinct from old.reversed_at
    or new.reversed_by is distinct from old.reversed_by
  );

  if new.inventory_movement_id is null then
    if new.inventory_item_id is not null then
      raise exception 'Inventory item and movement references must be set together';
    end if;
    if new.reversed_at is not null or new.reversed_by is not null then
      raise exception 'Only warehouse issues can be reversed';
    end if;
    return new;
  end if;

  if new.inventory_item_id is null then
    raise exception 'Inventory item and movement references must be set together';
  end if;

  if reference_changed then
    if coalesce(current_setting('coast.inventory_issue', true), '') <> 'on' then
      raise exception 'Warehouse material links can only be created by stock issue';
    end if;

    select * into linked_movement
    from public.inventory_movements
    where id = new.inventory_movement_id
      and movement_type = 'issue';
    if not found
       or linked_movement.inventory_item_id is distinct from new.inventory_item_id
       or linked_movement.work_order_id is distinct from new.work_order_id then
      raise exception 'Warehouse material link does not match its stock issue';
    end if;
  end if;

  if reversal_changed
     and (new.reversed_at is not null or new.reversed_by is not null)
     and coalesce(current_setting('coast.inventory_reversal', true), '') <> 'on' then
    raise exception 'Warehouse issues can only be reversed through inventory';
  end if;

  return new;
end;
$$;

drop trigger if exists material_entries_validate_inventory on public.material_entries;
create trigger material_entries_validate_inventory
  before insert or update on public.material_entries
  for each row execute function public.validate_inventory_material_entry();

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
  previous_flag text := coalesce(current_setting('coast.inventory_issue', true), '');
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

  perform set_config('coast.inventory_issue', 'on', true);
  insert into public.material_entries (
    work_order_id, description, part_number, quantity, unit, unit_cost,
    entered_by, inventory_item_id, inventory_movement_id
  ) values (
    target_work_order.id, target_item.name, target_item.sku, p_quantity,
    target_item.unit, created_movement.unit_cost, auth.uid(),
    target_item.id, created_movement.id
  ) returning id into created_material_id;
  perform set_config('coast.inventory_issue', previous_flag, true);

  return query select created_movement.id, created_material_id;
end;
$$;

revoke all on function public.issue_inventory_to_work_order(uuid, uuid, numeric, text)
  from public;
grant execute on function public.issue_inventory_to_work_order(uuid, uuid, numeric, text)
  to authenticated;
