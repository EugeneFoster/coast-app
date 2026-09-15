-- Account-level currency confirmation and gradual exact-SKU discovery for MPS stock.
create table if not exists public.supplier_price_currency_settings (
  supplier_code text primary key check (supplier_code in ('westernmarine', 'marinepartssupply')),
  currency text not null check (currency in ('CAD', 'USD')),
  confirmed_by uuid not null references public.profiles(id),
  confirmed_at timestamptz not null default now()
);

create table if not exists public.supplier_price_discovery_attempts (
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  supplier_code text not null check (supplier_code = 'marinepartssupply'),
  last_status text not null check (last_status in ('no_match', 'error')),
  last_error text,
  last_attempted_at timestamptz not null default now(),
  primary key (inventory_item_id, supplier_code)
);

alter table public.supplier_price_currency_settings enable row level security;
alter table public.supplier_price_discovery_attempts enable row level security;

drop policy if exists supplier_price_currency_settings_view on public.supplier_price_currency_settings;
create policy supplier_price_currency_settings_view on public.supplier_price_currency_settings for select
  using (public.can_view_purchasing());
drop policy if exists supplier_price_currency_settings_manage on public.supplier_price_currency_settings;
create policy supplier_price_currency_settings_manage on public.supplier_price_currency_settings for all
  using (public.can_manage_inventory()) with check (public.can_manage_inventory());
drop policy if exists supplier_price_discovery_attempts_view on public.supplier_price_discovery_attempts;
create policy supplier_price_discovery_attempts_view on public.supplier_price_discovery_attempts for select
  using (public.can_view_purchasing());

grant select, insert, update on public.supplier_price_currency_settings to authenticated;
grant select, insert, update on public.supplier_price_currency_settings,
  public.supplier_price_discovery_attempts to service_role;
grant select on public.supplier_price_discovery_attempts to authenticated;

create or replace function public.supplier_price_discovery_candidates(p_limit integer default 10)
returns table(item_id uuid, sku text)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  return query
    select i.id, i.sku
    from public.inventory_items i
    where i.active and i.quantity_on_hand > 0
      and i.sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$'
      and not exists (
        select 1 from public.supplier_price_watches w
        where w.inventory_item_id = i.id and w.supplier_code = 'marinepartssupply'
      )
      and not exists (
        select 1 from public.supplier_price_discovery_attempts a
        where a.inventory_item_id = i.id and a.supplier_code = 'marinepartssupply'
          and a.last_attempted_at > now() - case
            when a.last_status = 'error' then interval '1 hour'
            else interval '30 days' end
      )
    -- Sierra OEM-number stock is known to have exact MPS catalogue rows;
    -- still require a live exact-code match before any watch is created.
    order by case when i.sku like '18-%' then 0 else 1 end, i.sku, i.id
    limit least(greatest(coalesce(p_limit, 10), 1), 20);
end;
$$;

revoke all on function public.supplier_price_discovery_candidates(integer) from public;
grant execute on function public.supplier_price_discovery_candidates(integer) to service_role;
