-- Inventory catalogue enrichment, inbound delivery tracking, and Xero sync state.
-- Stock remains ledger-controlled: ordered goods do not become on-hand until
-- receive_purchase_order_item() records a receipt movement.

alter table public.inventory_items
  drop constraint if exists inventory_items_category_check;

alter table public.inventory_items
  add constraint inventory_items_category_check check (
    category in (
      'aluminum', 'steel', 'fastener', 'paint', 'mechanical', 'electrical',
      'electronics', 'plumbing', 'steering', 'engine', 'deck', 'dock',
      'consumable', 'safety', 'part', 'other'
    )
  );

alter table public.inventory_items
  add column if not exists manufacturer text,
  add column if not exists image_url text,
  add column if not exists product_url text,
  add column if not exists source text not null default 'crm',
  add column if not exists xero_item_id uuid,
  add column if not exists xero_is_tracked boolean not null default false,
  add column if not exists xero_sales_account_code text,
  add column if not exists xero_purchase_account_code text,
  add column if not exists xero_inventory_asset_account_code text,
  add column if not exists xero_updated_at timestamptz,
  add column if not exists xero_synced_at timestamptz,
  add column if not exists xero_sync_status text not null default 'not_linked',
  add column if not exists xero_sync_error text;

alter table public.inventory_items
  drop constraint if exists inventory_items_source_check,
  add constraint inventory_items_source_check check (
    source in ('crm', 'xero', 'marinepartssupply', 'mercury', 'westernmarine')
  ),
  drop constraint if exists inventory_items_xero_sync_status_check,
  add constraint inventory_items_xero_sync_status_check check (
    xero_sync_status in ('not_linked', 'synced', 'pending_push', 'conflict', 'failed')
  );

create unique index if not exists inventory_items_xero_item_unique
  on public.inventory_items (xero_item_id)
  where xero_item_id is not null;

alter table public.purchase_orders
  add column if not exists external_source text,
  add column if not exists external_order_id text,
  add column if not exists external_order_number text,
  add column if not exists shipping_status text not null default 'not_applicable',
  add column if not exists carrier_name text,
  add column if not exists tracking_number text,
  add column if not exists tracking_url text,
  add column if not exists shipped_at timestamptz,
  add column if not exists supplier_synced_at timestamptz,
  add column if not exists supplier_sync_error text;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_external_source_check,
  add constraint purchase_orders_external_source_check check (
    external_source is null or external_source in (
      'marinepartssupply', 'mercury', 'westernmarine', 'xero'
    )
  ),
  drop constraint if exists purchase_orders_shipping_status_check,
  add constraint purchase_orders_shipping_status_check check (
    shipping_status in (
      'not_applicable', 'ordered', 'confirmed', 'processing', 'backordered',
      'shipped', 'partially_received', 'delivered', 'cancelled', 'unknown'
    )
  );

create unique index if not exists purchase_orders_external_order_unique
  on public.purchase_orders (external_source, external_order_id)
  where external_source is not null and external_order_id is not null;

create index if not exists purchase_orders_shipping_status_idx
  on public.purchase_orders (shipping_status, expected_date, order_date desc);

alter table public.purchase_order_items
  add column if not exists external_line_id text,
  add column if not exists image_url text,
  add column if not exists product_url text;

create unique index if not exists purchase_order_items_external_line_unique
  on public.purchase_order_items (purchase_order_id, external_line_id)
  where external_line_id is not null;

create table if not exists public.xero_connections (
  id                    text primary key default 'primary' check (id = 'primary'),
  tenant_id             uuid not null,
  tenant_name           text,
  token_ciphertext      text not null,
  token_expires_at      timestamptz not null,
  scopes                text[] not null default '{}',
  connected_by          uuid references public.profiles(id) on delete set null,
  connected_at          timestamptz not null default now(),
  last_item_pull_at     timestamptz,
  last_item_push_at     timestamptz,
  last_success_at       timestamptz,
  last_error            text,
  updated_at            timestamptz not null default now()
);

drop trigger if exists trg_xero_connections_touch on public.xero_connections;
create trigger trg_xero_connections_touch
  before update on public.xero_connections
  for each row execute function public.touch_updated_at();

create table if not exists public.integration_sync_runs (
  id              uuid primary key default gen_random_uuid(),
  integration     text not null check (integration in ('xero', 'marinepartssupply', 'mercury', 'westernmarine')),
  direction       text not null check (direction in ('pull', 'push', 'bidirectional')),
  status          text not null check (status in ('running', 'succeeded', 'partial', 'failed')),
  imported_count  integer not null default 0 check (imported_count >= 0),
  updated_count   integer not null default 0 check (updated_count >= 0),
  failed_count    integer not null default 0 check (failed_count >= 0),
  details         jsonb not null default '{}'::jsonb,
  error_message   text,
  started_by      uuid references public.profiles(id) on delete set null,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists integration_sync_runs_recent_idx
  on public.integration_sync_runs (integration, started_at desc);

create or replace function public.reconcile_inventory_from_xero(
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_average_cost numeric,
  p_xero_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_item public.inventory_items%rowtype;
  delta numeric(14,3);
  previous_flag text := coalesce(current_setting('coast.inventory_ledger', true), '');
begin
  if not public.can_manage_inventory() then
    raise exception 'Inventory manager permission required';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'Xero quantity cannot be negative';
  end if;
  if p_average_cost is null or p_average_cost < 0 then
    raise exception 'Xero average cost cannot be negative';
  end if;

  select * into target_item
  from public.inventory_items
  where id = p_inventory_item_id
  for update;
  if not found then
    raise exception 'Inventory item not found';
  end if;

  delta := round(p_quantity - target_item.quantity_on_hand, 3);
  if delta <> 0 then
    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity, unit_cost, note, created_by
    ) values (
      target_item.id,
      case when delta > 0
        then 'adjustment_in'::public.inventory_movement_type
        else 'adjustment_out'::public.inventory_movement_type
      end,
      abs(delta),
      case when delta > 0 then p_average_cost else target_item.average_cost end,
      'Xero quantity reconciliation',
      auth.uid()
    );
  end if;

  perform set_config('coast.inventory_ledger', 'on', true);
  update public.inventory_items
  set average_cost = round(p_average_cost, 4),
      xero_updated_at = coalesce(p_xero_updated_at, xero_updated_at),
      xero_synced_at = now(),
      xero_sync_status = 'synced',
      xero_sync_error = null
  where id = target_item.id;
  perform set_config('coast.inventory_ledger', previous_flag, true);
end;
$$;

revoke all on function public.reconcile_inventory_from_xero(uuid, numeric, numeric, timestamptz) from public;
grant execute on function public.reconcile_inventory_from_xero(uuid, numeric, numeric, timestamptz) to authenticated;

alter table public.xero_connections enable row level security;
alter table public.integration_sync_runs enable row level security;

-- OAuth refresh tokens are deliberately service-role only. Even authenticated
-- owners read a redacted status through server code, never this table directly.
revoke all on table public.xero_connections from anon, authenticated;

drop policy if exists integration_sync_runs_view on public.integration_sync_runs;
create policy integration_sync_runs_view on public.integration_sync_runs for select
  using (public.can_view_purchasing());

drop policy if exists integration_sync_runs_manage on public.integration_sync_runs;
create policy integration_sync_runs_manage on public.integration_sync_runs for all
  using (public.can_manage_inventory())
  with check (public.can_manage_inventory());
