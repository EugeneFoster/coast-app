-- Route price checks to the supplier used for the product, never to every portal.
alter table public.supplier_price_discovery_attempts
  drop constraint if exists supplier_price_discovery_attempts_supplier_code_check;
alter table public.supplier_price_discovery_attempts add constraint supplier_price_discovery_attempts_supplier_code_check
  check (supplier_code in ('marinepartssupply', 'westernmarine'));

create or replace function public.price_supplier_code(p_name text)
returns text language sql immutable set search_path = public as $$
  select case lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9]', '', 'g'))
    when 'marinepartssupply' then 'marinepartssupply'
    when 'marinepartssupplycanada' then 'marinepartssupply'
    when 'westernmarine' then 'westernmarine'
    when 'westernmarinecompany' then 'westernmarine'
    when 'westernmarinesupply' then 'westernmarine'
    when 'westernmarinesupplier' then 'westernmarine'
    else null end;
$$;

-- Pure policy shared by discovery and existing-watch validation. An assigned
-- supplier may be 'other': that is a deliberate no-route, not missing metadata.
create or replace function public.choose_price_supplier(
  p_sku text, p_name text, p_description text, p_manufacturer text,
  p_category text, p_assigned text default null
) returns table(supplier_code text, reason text)
language plpgsql immutable set search_path = public as $$
declare
  v_text text := concat_ws(' ', p_name, p_description, p_manufacturer);
  v_sierra boolean := concat_ws(' ', p_name, p_description, p_manufacturer) ~* '\mSierra\M'
    or (nullif(btrim(p_manufacturer), '') is null and p_sku ~ '^18-[0-9]{3,}');
  v_yamaha boolean := concat_ws(' ', p_name, p_description, p_manufacturer) ~* '\m(Yamaha|Yamalube)\M';
  v_accessory boolean := concat_ws(' ', p_name, p_description) ~* '\m(anode|zinc|cleat|vent|seat|chair|pedestal|anchor|shackle|rope|fender|buoy|ladder|cup holder|rod holder)\M';
begin
  if ((p_category in ('aluminum', 'steel') and not v_accessory)
      or (v_text ~* '\m(alum|aluminum|aluminium|steel|metal)\M'
        and v_text ~* '\m(sheet|flat bar|square tube|plate|angle|HSS|6061|5052|round steel)\M'
        and not v_accessory)) then
    supplier_code := null; reason := 'Raw metal: outside these supplier catalogues';
  elsif p_assigned = 'marinepartssupply' and v_yamaha then
    supplier_code := null; reason := 'Yamaha is excluded from Marine Parts Supply';
  elsif p_assigned is not null then
    supplier_code := case when p_assigned in ('marinepartssupply', 'westernmarine') then p_assigned end;
    reason := case when supplier_code is null then 'Assigned supplier has no supported price portal' else 'Confirmed supplier assignment' end;
  elsif v_sierra or v_text ~* '\mEMP\M' then
    supplier_code := 'westernmarine'; reason := 'Sierra / EMP: Western Marine by default';
  elsif p_category = 'paint' or v_text ~* '\m(paint|antifouling|bottomkote|micron CSC|hempel|hempaspeed|interlux)\M' then
    supplier_code := 'westernmarine'; reason := 'Marine paint';
  elsif v_yamaha or v_text ~* '\mHonda\M' then
    supplier_code := null; reason := 'Confirm a supplier for Yamaha / Honda before searching';
  elsif v_text ~* '\m(Mercury|Mercruiser|Volvo|Suzuki|JNN)\M' then
    supplier_code := 'marinepartssupply'; reason := 'MPS engine / aftermarket range';
  elsif p_category in ('deck', 'dock') or v_accessory
      or v_text ~* '\m(water pump|bilge pump|washdown pump|freshwater pump|ballast pump|impeller|boat accessories)\M' then
    supplier_code := 'westernmarine'; reason := 'Boat accessories / water pumps';
  else
    supplier_code := null; reason := 'Supplier or product range needs identification';
  end if;
  return next;
end;
$$;

create or replace function public.supplier_price_route(p_item_id uuid, p_manual_supplier text default null)
returns table(supplier_code text, query_part_number text, reason text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_item public.inventory_items%rowtype;
  v_supplier uuid;
  v_assigned text;
  v_supplier_name text;
  v_supplier_active boolean;
  v_query text;
  v_manual_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  select * into v_item from public.inventory_items where id = p_item_id;
  if not found then return; end if;
  v_supplier := v_item.preferred_supplier_id;
  if v_supplier is null then
    select po.supplier_id into v_supplier from public.purchase_order_items pi
    join public.purchase_orders po on po.id = pi.purchase_order_id
    where pi.inventory_item_id = p_item_id and pi.quantity_received > 0 and po.status <> 'cancelled'
    order by po.received_at desc nulls last, po.order_date desc, po.id desc limit 1;
  end if;
  if v_supplier is not null then
    select s.name, s.active into v_supplier_name, v_supplier_active from public.suppliers s where s.id = v_supplier;
    v_assigned := case when v_supplier_active then coalesce(public.price_supplier_code(v_supplier_name), 'other') else 'other' end;
    select nullif(btrim(pi.supplier_sku), '') into v_query from public.purchase_order_items pi
    join public.purchase_orders po on po.id = pi.purchase_order_id
    where pi.inventory_item_id = p_item_id and po.supplier_id = v_supplier
      and pi.quantity_received > 0 and po.status <> 'cancelled' and nullif(btrim(pi.supplier_sku), '') is not null
    order by po.received_at desc nulls last, po.order_date desc, po.id desc limit 1;
  elsif p_manual_supplier in ('marinepartssupply', 'westernmarine') then
    -- Only used after an authenticated inventory manager chooses a supplier.
    v_assigned := p_manual_supplier;
  else
    select count(*), min(w.supplier_code) into v_manual_count, v_assigned
    from public.supplier_price_watches w where w.inventory_item_id = p_item_id
      and w.active and w.created_by is not null;
    if v_manual_count > 1 then v_assigned := 'other'; end if;
  end if;
  return query select r.supplier_code, coalesce(v_query, v_item.sku), r.reason
    from public.choose_price_supplier(v_item.sku, v_item.name, v_item.description,
      v_item.manufacturer, v_item.category, v_assigned) r;
end;
$$;

create or replace function public.routed_supplier_price_candidates(p_limit integer default 10)
returns table(item_id uuid, sku text, supplier_code text, query_part_number text, reason text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  return query
  with candidates as (
    select i.id, i.sku, r.supplier_code, r.query_part_number, r.reason,
      row_number() over (partition by r.supplier_code order by
        case when exists (select 1 from public.supplier_price_watches old where old.inventory_item_id=i.id) then 0 else 1 end,
        i.sku, i.id) as supplier_rank
    from public.inventory_items i
    cross join lateral public.supplier_price_route(i.id) r
    where i.active and i.quantity_on_hand > 0 and r.supplier_code is not null
      and r.query_part_number ~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{1,63}$'
      and not exists (select 1 from public.supplier_price_watches w
        where w.inventory_item_id=i.id and w.supplier_code=r.supplier_code)
      and not exists (select 1 from public.supplier_price_discovery_attempts a
        where a.inventory_item_id=i.id and a.supplier_code=r.supplier_code
          and a.last_attempted_at > now() - case when a.last_status='error' then interval '1 hour' else interval '30 days' end)
  ) select c.id, c.sku, c.supplier_code, c.query_part_number, c.reason
    from candidates c order by c.supplier_rank, c.supplier_code
    limit least(greatest(coalesce(p_limit, 10), 1), 20);
end;
$$;

-- Rolling deployment compatibility: the old worker can no longer scan all stock.
create or replace function public.supplier_price_discovery_candidates(p_limit integer default 10)
returns table(item_id uuid, sku text)
language sql security definer set search_path = public as $$
  select c.item_id, c.sku from public.routed_supplier_price_candidates(p_limit) c
    where c.supplier_code='marinepartssupply' and c.query_part_number=c.sku;
$$;

create or replace function public.reconcile_supplier_price_routes()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  with eligible as (
    select w.id from public.supplier_price_watches w
    cross join lateral public.supplier_price_route(w.inventory_item_id) r
    where not w.active and w.last_error like 'Supplier routing:%'
      and w.supplier_code = r.supplier_code
  ) update public.supplier_price_watches w set active=true, last_error=null, last_attempted_at=null
    from eligible e where w.id=e.id;
  with mismatched as (
    select w.id, r.reason from public.supplier_price_watches w
    cross join lateral public.supplier_price_route(w.inventory_item_id) r
    where w.active and w.supplier_code is distinct from r.supplier_code
  ) update public.supplier_price_watches w set active=false,
      last_error='Supplier routing: ' || m.reason || '. Select the correct supplier to resume.'
    from mismatched m where w.id=m.id;
  get diagnostics v_count = row_count;
  update public.supplier_price_alerts a set status='stale'
    from public.supplier_price_watches w where a.watch_id=w.id and a.status='open'
      and not w.active and w.last_error like 'Supplier routing:%';
  return v_count;
end;
$$;

revoke all on function public.price_supplier_code(text) from public;
revoke all on function public.choose_price_supplier(text,text,text,text,text,text) from public;
revoke all on function public.supplier_price_route(uuid,text) from public;
revoke all on function public.routed_supplier_price_candidates(integer) from public;
revoke all on function public.supplier_price_discovery_candidates(integer) from public;
revoke all on function public.reconcile_supplier_price_routes() from public;
grant execute on function public.price_supplier_code(text), public.choose_price_supplier(text,text,text,text,text,text),
  public.supplier_price_route(uuid,text), public.routed_supplier_price_candidates(integer),
  public.supplier_price_discovery_candidates(integer), public.reconcile_supplier_price_routes() to service_role;

-- No inventory price/cost changes. Retain watches, observations and alert history.
select set_config('request.jwt.claim.role', 'service_role', true);
select public.reconcile_supplier_price_routes();
notify pgrst, 'reload schema';
