-- Supplier replacement-price monitoring. Historical inventory costs and stock ledger are untouched.

create table if not exists public.supplier_price_watches (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  supplier_code text not null check (supplier_code in ('westernmarine', 'marinepartssupply')),
  query_part_number text not null check (length(btrim(query_part_number)) between 2 and 64),
  expected_part_number text not null,
  expected_supplier_sku text,
  confirmed_currency text check (confirmed_currency is null or confirmed_currency in ('CAD', 'USD')),
  currency_confirmed_by uuid references public.profiles(id),
  currency_confirmed_at timestamptz,
  mapping_confirmed_by uuid references public.profiles(id),
  last_dealer_cost numeric(14,4) check (last_dealer_cost is null or last_dealer_cost >= 0),
  last_list_price numeric(12,2) check (last_list_price is null or last_list_price >= 0),
  last_currency text,
  last_checked_at timestamptz,
  last_attempted_at timestamptz,
  last_error text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_item_id, supplier_code)
);

create index if not exists supplier_price_watches_due_idx
  on public.supplier_price_watches (last_attempted_at, id) where active;

create table if not exists public.supplier_price_observations (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.supplier_price_watches(id) on delete cascade,
  dealer_cost numeric(14,4),
  list_price numeric(12,2),
  currency text,
  checked_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  check (dealer_cost is null or dealer_cost >= 0),
  check (list_price is null or list_price >= 0)
);

create index if not exists supplier_price_observations_history_idx
  on public.supplier_price_observations (watch_id, checked_at desc);

create table if not exists public.supplier_price_alerts (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.supplier_price_watches(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  reason text not null check (reason in ('supplier_increase', 'below_current_srp')),
  previous_dealer_cost numeric(14,4),
  dealer_cost numeric(14,4),
  previous_list_price numeric(12,2),
  list_price numeric(12,2),
  currency text,
  current_selling_price numeric(12,2),
  suggested_selling_price numeric(12,2),
  supplier_checked_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'approved', 'dismissed', 'stale')),
  detected_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  check (suggested_selling_price is null or suggested_selling_price >= 0)
);

create unique index if not exists supplier_price_alerts_one_open_idx
  on public.supplier_price_alerts (watch_id) where status = 'open';
create index if not exists supplier_price_alerts_open_idx
  on public.supplier_price_alerts (detected_at desc) where status = 'open';

drop trigger if exists trg_supplier_price_watches_touch on public.supplier_price_watches;
create trigger trg_supplier_price_watches_touch
  before update on public.supplier_price_watches
  for each row execute function public.touch_updated_at();

alter table public.supplier_price_watches enable row level security;
alter table public.supplier_price_observations enable row level security;
alter table public.supplier_price_alerts enable row level security;

drop policy if exists supplier_price_watches_view on public.supplier_price_watches;
create policy supplier_price_watches_view on public.supplier_price_watches for select
  using (public.can_view_purchasing());
drop policy if exists supplier_price_watches_manage on public.supplier_price_watches;
create policy supplier_price_watches_manage on public.supplier_price_watches for all
  using (public.can_manage_inventory()) with check (public.can_manage_inventory());
drop policy if exists supplier_price_observations_view on public.supplier_price_observations;
create policy supplier_price_observations_view on public.supplier_price_observations for select
  using (public.can_view_purchasing());
drop policy if exists supplier_price_alerts_view on public.supplier_price_alerts;
create policy supplier_price_alerts_view on public.supplier_price_alerts for select
  using (public.can_view_purchasing());

grant select, insert, update on public.supplier_price_watches to authenticated;
grant select on public.supplier_price_observations, public.supplier_price_alerts to authenticated;
grant select, insert, update on public.supplier_price_watches,
  public.supplier_price_observations, public.supplier_price_alerts to service_role;

-- The portal check and all three writes happen together, with the watch row locked.
-- Only the service-role client may supply supplier data to this function.
create or replace function public.record_supplier_price_check(
  p_watch_id uuid,
  p_part_number text,
  p_supplier_sku text,
  p_dealer_cost numeric,
  p_list_price numeric,
  p_currency text,
  p_checked_at timestamptz
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_watch public.supplier_price_watches%rowtype;
  v_item public.inventory_items%rowtype;
  v_currency text;
  v_cost_increased boolean;
  v_list_increased boolean;
  v_suggestion numeric(12,2);
  v_reason text;
  v_open public.supplier_price_alerts%rowtype;
  v_cost_baseline numeric(14,4);
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_dealer_cost < 0 or p_list_price < 0 or p_checked_at is null then
    raise exception 'Invalid supplier price';
  end if;

  select * into v_watch from public.supplier_price_watches
    where id = p_watch_id and active for update;
  if not found then return false; end if;
  if v_watch.last_checked_at is not null and p_checked_at < v_watch.last_checked_at then
    return false;
  end if;
  if p_part_number is distinct from v_watch.expected_part_number
     or p_supplier_sku is distinct from v_watch.expected_supplier_sku then
    raise exception 'Supplier part identity changed';
  end if;
  select * into v_item from public.inventory_items where id = v_watch.inventory_item_id for update;
  if not found then return false; end if;

  v_currency := case
    when p_currency is not null then p_currency
    else v_watch.confirmed_currency
  end;
  if p_currency is not null and v_watch.confirmed_currency is not null
     and p_currency <> v_watch.confirmed_currency then
    v_currency := null;
  end if;
  v_cost_increased := v_watch.last_checked_at is not null
    and v_watch.last_dealer_cost is not null and p_dealer_cost is not null
    and p_dealer_cost > v_watch.last_dealer_cost;
  v_list_increased := v_watch.last_checked_at is not null
    and v_watch.last_list_price is not null and p_list_price is not null
    and p_list_price > v_watch.last_list_price;

  select * into v_open from public.supplier_price_alerts
    where watch_id = p_watch_id and status = 'open' for update;
  v_cost_baseline := case when v_open.id is not null
    then v_open.previous_dealer_cost else v_watch.last_dealer_cost end;

  if v_currency = 'CAD' then
    v_suggestion := greatest(
      coalesce(v_item.selling_price, 0),
      coalesce(p_list_price, 0),
      coalesce(v_item.selling_price, 0) + case
        when v_cost_baseline is not null and p_dealer_cost > v_cost_baseline
          then p_dealer_cost - v_cost_baseline else 0 end
    );
    v_suggestion := round(v_suggestion, 2);
    if v_item.selling_price is not null and v_suggestion <= v_item.selling_price then
      v_suggestion := null;
    elsif v_item.selling_price is null and v_suggestion = 0 then
      v_suggestion := null;
    end if;
  end if;

  v_reason := case
    when v_cost_increased or v_list_increased then 'supplier_increase'
    when v_open.id is not null and (
      (v_open.previous_dealer_cost is not null and p_dealer_cost > v_open.previous_dealer_cost)
      or (v_open.previous_list_price is not null and p_list_price > v_open.previous_list_price)
      or (v_currency = 'CAD' and p_list_price is not null
        and (v_item.selling_price is null or p_list_price > v_item.selling_price))
    ) then v_open.reason
    when (v_watch.last_checked_at is null or v_watch.last_currency is distinct from 'CAD')
      and v_currency = 'CAD'
      and p_list_price is not null
      and (v_item.selling_price is null or p_list_price > v_item.selling_price)
      then 'below_current_srp'
    else null
  end;

  insert into public.supplier_price_observations
    (watch_id, dealer_cost, list_price, currency, checked_at)
  values (p_watch_id, p_dealer_cost, p_list_price, v_currency, p_checked_at);

  update public.supplier_price_watches set
    last_dealer_cost = p_dealer_cost,
    last_list_price = p_list_price,
    last_currency = v_currency,
    last_checked_at = p_checked_at,
    last_attempted_at = now(),
    last_error = null
  where id = p_watch_id;

  if v_reason is not null and v_item.active and v_item.quantity_on_hand > 0 then
    insert into public.supplier_price_alerts (
      watch_id, inventory_item_id, reason, previous_dealer_cost, dealer_cost,
      previous_list_price, list_price, currency, current_selling_price,
      suggested_selling_price, supplier_checked_at
    ) values (
      p_watch_id, v_item.id, v_reason, v_watch.last_dealer_cost, p_dealer_cost,
      v_watch.last_list_price, p_list_price, v_currency, v_item.selling_price,
      v_suggestion, p_checked_at
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
      dealer_cost = excluded.dealer_cost,
      list_price = excluded.list_price,
      currency = excluded.currency,
      current_selling_price = excluded.current_selling_price,
      suggested_selling_price = excluded.suggested_selling_price,
      supplier_checked_at = excluded.supplier_checked_at,
      detected_at = now();
    return true;
  end if;
  if v_open.id is not null then
    update public.supplier_price_alerts set status = 'stale'
      where id = v_open.id;
  end if;
  return false;
end;
$$;

revoke all on function public.record_supplier_price_check(uuid, text, text, numeric, numeric, text, timestamptz) from public;
grant execute on function public.record_supplier_price_check(uuid, text, text, numeric, numeric, text, timestamptz) to service_role;

create or replace function public.decide_supplier_price_alert(p_alert_id uuid, p_decision text)
returns text
language plpgsql security definer set search_path = public
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
  -- Match the recorder's watch -> item -> alert lock order to prevent deadlocks.
  select * into v_watch from public.supplier_price_watches where id = v_watch_id for update;
  select * into v_item from public.inventory_items where id = v_item_id for update;
  select * into v_alert from public.supplier_price_alerts
    where id = p_alert_id for update;
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
     or v_alert.suggested_selling_price is null
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

revoke all on function public.decide_supplier_price_alert(uuid, text) from public;
grant execute on function public.decide_supplier_price_alert(uuid, text) to authenticated;
