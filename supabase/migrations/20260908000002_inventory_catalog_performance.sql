-- Keep the inventory catalogue fast as the Xero item count grows.

create index if not exists inventory_items_active_quantity_name_idx
  on public.inventory_items (active, quantity_on_hand desc, name);

create index if not exists inventory_items_active_category_quantity_name_idx
  on public.inventory_items (active, category, quantity_on_hand desc, name);

create or replace function public.inventory_category_counts()
returns table(category text, item_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select inventory_items.category, count(*)::bigint
  from public.inventory_items
  where active
  group by inventory_items.category
  order by inventory_items.category
$$;

revoke all on function public.inventory_category_counts() from public;
grant execute on function public.inventory_category_counts() to authenticated;

analyze public.inventory_items;
