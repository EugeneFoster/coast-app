-- Dealer Net and SRP can be quoted per package while inventory is sold per ea.
alter table public.supplier_price_watches
  add column if not exists supplier_units_per_pack integer
    check (supplier_units_per_pack between 2 and 500),
  add column if not exists pack_source text;
alter table public.supplier_price_alerts
  add column if not exists package_units integer
    check (package_units between 2 and 500),
  add column if not exists pack_check_required boolean not null default false;

-- Verified manufacturer entries. Exact part and ea unit only; the stock quantity is never a divisor.
update public.supplier_price_watches w set
  supplier_units_per_pack = 50,
  pack_source = 'https://shop.toadmarinesupply.com/utility/includes/content/sierra/catalogpages/8025-343.pdf'
from public.inventory_items i
where i.id = w.inventory_item_id and lower(btrim(i.unit)) in ('ea', 'each')
  and w.supplier_code = 'marinepartssupply' and w.expected_part_number = '18-24301-9'
  and upper(btrim(i.sku)) = '18-24301-9';
update public.supplier_price_watches w set
  supplier_units_per_pack = 8,
  pack_source = 'https://www.marineparts-online.ch/images/content/pdf-kataloge/Komplet_582-864.pdf'
from public.inventory_items i
where i.id = w.inventory_item_id and lower(btrim(i.unit)) in ('ea', 'each')
  and w.supplier_code = 'marinepartssupply' and w.expected_part_number = '18-2341-1-9'
  and upper(btrim(i.sku)) = '18-2341-1-9';

-- Correct pending proposals immediately. No inventory selling price or purchase cost is modified.
update public.supplier_price_alerts a set
  package_units = w.supplier_units_per_pack,
  pack_check_required = false,
  suggested_selling_price = round(greatest(
    coalesce(a.current_selling_price, 0),
    coalesce(a.list_price / w.supplier_units_per_pack, 0),
    coalesce(a.current_selling_price, 0) + case
      when a.previous_dealer_cost is not null and a.dealer_cost > a.previous_dealer_cost
        then (a.dealer_cost - a.previous_dealer_cost) / w.supplier_units_per_pack
      else 0 end
  ), 2)
from public.supplier_price_watches w, public.inventory_items i
where a.watch_id = w.id and i.id = a.inventory_item_id
  and a.status = 'open' and w.supplier_units_per_pack is not null
  and lower(btrim(i.unit)) in ('ea', 'each');
update public.supplier_price_alerts set status = 'stale'
where status = 'open' and package_units is not null
  and current_selling_price is not null
  and suggested_selling_price <= current_selling_price;

-- An unexplained package-sized jump must not be approved using the package price as an ea price.
update public.supplier_price_alerts a set
  suggested_selling_price = null, pack_check_required = true
from public.supplier_price_watches w
where a.watch_id = w.id and a.status = 'open' and a.package_units is null
  and w.supplier_units_per_pack is null
  and a.current_selling_price > 0 and a.list_price >= a.current_selling_price * 3;

create or replace function public.record_supplier_price_check(
  p_watch_id uuid, p_part_number text, p_supplier_sku text,
  p_dealer_cost numeric, p_list_price numeric, p_currency text, p_checked_at timestamptz
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_watch public.supplier_price_watches%rowtype;
  v_item public.inventory_items%rowtype;
  v_open public.supplier_price_alerts%rowtype;
  v_currency text;
  v_factor integer;
  v_unverified boolean;
  v_cost_increased boolean;
  v_list_increased boolean;
  v_cost_baseline numeric;
  v_suggestion numeric(12,2);
  v_reason text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_dealer_cost < 0 or p_list_price < 0 or p_checked_at is null then
    raise exception 'Invalid supplier price';
  end if;
  select * into v_watch from public.supplier_price_watches
    where id = p_watch_id and active for update;
  if not found then return false; end if;
  if v_watch.last_checked_at is not null and p_checked_at < v_watch.last_checked_at then return false; end if;
  if p_part_number is distinct from v_watch.expected_part_number
     or p_supplier_sku is distinct from v_watch.expected_supplier_sku then
    raise exception 'Supplier part identity changed';
  end if;
  select * into v_item from public.inventory_items where id = v_watch.inventory_item_id for update;
  if not found then return false; end if;

  v_currency := case when p_currency is not null then p_currency else v_watch.confirmed_currency end;
  if p_currency is not null and v_watch.confirmed_currency is not null
     and p_currency <> v_watch.confirmed_currency then v_currency := null; end if;
  v_factor := case when lower(btrim(v_item.unit)) in ('ea', 'each')
    then coalesce(v_watch.supplier_units_per_pack, 1) else 1 end;
  v_unverified := coalesce(v_watch.supplier_units_per_pack is null
    and v_item.selling_price > 0 and p_list_price >= v_item.selling_price * 3, false);
  v_cost_increased := v_watch.last_checked_at is not null and v_watch.last_dealer_cost is not null
    and p_dealer_cost is not null and p_dealer_cost > v_watch.last_dealer_cost;
  v_list_increased := v_watch.last_checked_at is not null and v_watch.last_list_price is not null
    and p_list_price is not null and p_list_price > v_watch.last_list_price;
  select * into v_open from public.supplier_price_alerts
    where watch_id = p_watch_id and status = 'open' for update;
  v_cost_baseline := case when v_open.id is not null
    then v_open.previous_dealer_cost else v_watch.last_dealer_cost end;

  if v_currency = 'CAD' and not v_unverified then
    v_suggestion := round(greatest(
      coalesce(v_item.selling_price, 0),
      coalesce(p_list_price / v_factor, 0),
      coalesce(v_item.selling_price, 0) + case
        when v_cost_baseline is not null and p_dealer_cost > v_cost_baseline
          then (p_dealer_cost - v_cost_baseline) / v_factor else 0 end
    ), 2);
    if v_item.selling_price is not null and v_suggestion <= v_item.selling_price then
      v_suggestion := null;
    elsif v_item.selling_price is null and v_suggestion = 0 then
      v_suggestion := null;
    end if;
  end if;

  v_reason := case
    when v_cost_increased or v_list_increased then 'supplier_increase'
    when v_open.id is not null and (
      v_unverified or
      (v_open.previous_dealer_cost is not null and p_dealer_cost > v_open.previous_dealer_cost) or
      (v_open.previous_list_price is not null and p_list_price > v_open.previous_list_price) or
      (v_currency = 'CAD' and p_list_price is not null and
        (v_item.selling_price is null or p_list_price / v_factor > v_item.selling_price))
    ) then v_open.reason
    when (v_watch.last_checked_at is null or v_watch.last_currency is distinct from 'CAD')
      and v_currency = 'CAD' and p_list_price is not null
      and (v_unverified or v_item.selling_price is null or p_list_price / v_factor > v_item.selling_price)
      then 'below_current_srp'
    else null
  end;

  insert into public.supplier_price_observations
    (watch_id, dealer_cost, list_price, currency, checked_at)
  values (p_watch_id, p_dealer_cost, p_list_price, v_currency, p_checked_at);
  update public.supplier_price_watches set
    last_dealer_cost = p_dealer_cost, last_list_price = p_list_price,
    last_currency = v_currency, last_checked_at = p_checked_at,
    last_attempted_at = now(), last_error = null
  where id = p_watch_id;

  if v_reason is not null and v_item.active and v_item.quantity_on_hand > 0 then
    insert into public.supplier_price_alerts (
      watch_id, inventory_item_id, reason, previous_dealer_cost, dealer_cost,
      previous_list_price, list_price, currency, current_selling_price,
      suggested_selling_price, supplier_checked_at, package_units, pack_check_required
    ) values (
      p_watch_id, v_item.id, v_reason, v_watch.last_dealer_cost, p_dealer_cost,
      v_watch.last_list_price, p_list_price, v_currency, v_item.selling_price,
      v_suggestion, p_checked_at, case when v_factor > 1 then v_factor else null end, v_unverified
    ) on conflict (watch_id) where status = 'open' do update set
      reason = excluded.reason,
      previous_dealer_cost = case
        when public.supplier_price_alerts.reason = 'below_current_srp'
          and excluded.reason = 'below_current_srp' then null
        else coalesce(public.supplier_price_alerts.previous_dealer_cost, excluded.previous_dealer_cost) end,
      previous_list_price = case
        when public.supplier_price_alerts.reason = 'below_current_srp'
          and excluded.reason = 'below_current_srp' then null
        else coalesce(public.supplier_price_alerts.previous_list_price, excluded.previous_list_price) end,
      dealer_cost = excluded.dealer_cost, list_price = excluded.list_price,
      currency = excluded.currency, current_selling_price = excluded.current_selling_price,
      suggested_selling_price = excluded.suggested_selling_price,
      supplier_checked_at = excluded.supplier_checked_at,
      package_units = excluded.package_units,
      pack_check_required = excluded.pack_check_required, detected_at = now();
    return true;
  end if;
  if v_open.id is not null then
    update public.supplier_price_alerts set status = 'stale' where id = v_open.id;
  end if;
  return false;
end;
$$;

revoke all on function public.record_supplier_price_check(uuid,text,text,numeric,numeric,text,timestamptz) from public;
grant execute on function public.record_supplier_price_check(uuid,text,text,numeric,numeric,text,timestamptz) to service_role;

create or replace function public.decide_supplier_price_alert(p_alert_id uuid, p_decision text)
returns text language plpgsql security definer set search_path = public
as $$
declare
  v_alert public.supplier_price_alerts%rowtype;
  v_watch public.supplier_price_watches%rowtype;
  v_item public.inventory_items%rowtype;
  v_watch_id uuid;
  v_item_id uuid;
begin
  if not public.can_manage_inventory() then raise exception 'Inventory manager required'; end if;
  if p_decision not in ('approve', 'dismiss') then raise exception 'Invalid decision'; end if;
  select watch_id, inventory_item_id into v_watch_id, v_item_id
    from public.supplier_price_alerts where id = p_alert_id;
  if not found then return 'not_open'; end if;
  select * into v_watch from public.supplier_price_watches where id = v_watch_id for update;
  select * into v_item from public.inventory_items where id = v_item_id for update;
  select * into v_alert from public.supplier_price_alerts where id = p_alert_id for update;
  if not found or v_alert.status <> 'open' then return 'not_open'; end if;
  if p_decision = 'dismiss' then
    update public.supplier_price_alerts set status = 'dismissed',
      decided_by = auth.uid(), decided_at = now() where id = p_alert_id;
    return 'dismissed';
  end if;
  if not v_watch.active or not v_item.active or v_item.quantity_on_hand <= 0
     or v_watch.last_checked_at is distinct from v_alert.supplier_checked_at
     or v_watch.last_currency is distinct from 'CAD'
     or v_watch.last_dealer_cost is distinct from v_alert.dealer_cost
     or v_watch.last_list_price is distinct from v_alert.list_price
     or v_item.selling_price is distinct from v_alert.current_selling_price
     or v_alert.suggested_selling_price is null or v_alert.pack_check_required
     or (v_alert.package_units is distinct from v_watch.supplier_units_per_pack
       and lower(btrim(v_item.unit)) in ('ea', 'each'))
     or (v_item.selling_price is not null
       and v_alert.suggested_selling_price <= v_item.selling_price) then
    update public.supplier_price_alerts set status = 'stale',
      decided_by = auth.uid(), decided_at = now() where id = p_alert_id;
    return 'stale';
  end if;
  update public.inventory_items set selling_price = v_alert.suggested_selling_price
    where id = v_item.id;
  update public.supplier_price_alerts set status = 'approved',
    decided_by = auth.uid(), decided_at = now() where id = p_alert_id;
  return 'approved';
end;
$$;
revoke all on function public.decide_supplier_price_alert(uuid,text) from public;
grant execute on function public.decide_supplier_price_alert(uuid,text) to authenticated;
