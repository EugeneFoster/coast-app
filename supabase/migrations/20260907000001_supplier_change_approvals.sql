-- P11: supplier-driven change approvals, CRM notifications, and an audit trail.
--
-- Nothing a supplier lookup suggests may touch business data on its own. A
-- proposal is recorded here, a notification asks a human to confirm or reject
-- it, and only an approved request may be executed — exactly once.

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

-- Who may raise a supplier-driven proposal: the roles that already manage
-- operations (owner, project_manager, draftsperson) or inventory (parts).
create or replace function public.can_propose_supplier_change()
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
      and role::text in ('owner', 'project_manager', 'draftsperson', 'parts')
  )
$$;

-- Who may decide one. Deliberately narrower than is_admin(): approving these
-- requests moves money and can write to the accounting system, so it is limited
-- to the roles that already manage BOTH operations and billing.
create or replace function public.can_approve_supplier_change()
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
      and role::text in ('owner', 'project_manager')
  )
$$;

-- ---------------------------------------------------------------------------
-- Notifications (generic; this CRM had none before)
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  recipient_id        uuid not null references public.profiles(id) on delete cascade,
  kind                text not null check (kind in (
                        'info',
                        'approval_request',
                        'approval_decided',
                        'approval_stale',
                        'sync_failed'
                      )),
  title               text not null check (char_length(btrim(title)) between 1 and 200),
  body                text check (body is null or char_length(body) <= 2000),
  approval_request_id uuid,
  link_path           text check (link_path is null or link_path ~ '^/'),
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications (recipient_id)
  where read_at is null;

alter table public.notifications enable row level security;

-- ---------------------------------------------------------------------------
-- Change approval requests
-- ---------------------------------------------------------------------------

create table if not exists public.change_approval_requests (
  id                    uuid primary key default gen_random_uuid(),

  action_type           text not null check (action_type in (
                          'add_work_order_material',
                          'update_work_order_material_cost',
                          'replace_superseded_part',
                          'remove_work_order_material',
                          'update_inventory_item_cost'
                        )),
  entity_type           text not null check (entity_type in (
                          'material_entry',
                          'inventory_item'
                        )),
  -- Null for "create" actions; set once the entity exists.
  entity_id             uuid,
  -- Owning record the change hangs off (work order, project, …).
  parent_entity_id      uuid,

  supplier              text check (supplier is null or supplier in (
                          'mercury', 'marinepartssupply', 'westernmarine'
                        )),
  source_part_number    text,
  proposed_part_number  text,

  summary               text not null check (char_length(btrim(summary)) between 1 and 300),
  proposed_changes      jsonb not null,
  current_values        jsonb not null default '{}'::jsonb,

  xero_impact           text not null default 'none' check (xero_impact in (
                          'none',
                          'not_configured',
                          'item_create',
                          'item_update',
                          'invoice_line_update',
                          'unknown'
                        )),
  xero_impact_detail    text,

  -- When the supplier data behind this proposal was actually read.
  supplier_checked_at   timestamptz,

  status                text not null default 'pending_approval' check (status in (
                          'pending_approval',
                          'approved',
                          'rejected',
                          'expired',
                          'executing',
                          'executed',
                          'failed',
                          'stale_requires_reapproval'
                        )),

  requested_by          uuid not null references public.profiles(id) on delete restrict,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null default now() + interval '7 days',

  decided_at            timestamptz,
  decided_by            uuid references public.profiles(id) on delete set null,
  rejection_reason      text check (rejection_reason is null or char_length(rejection_reason) <= 500),

  executing_at          timestamptz,
  executed_at           timestamptz,
  execution_status      text check (execution_status is null or execution_status in ('succeeded', 'failed')),
  execution_error       text check (execution_error is null or char_length(execution_error) <= 1000),
  -- The row the execution created or changed.
  result_entity_id      uuid,

  external_sync_status  text not null default 'not_required' check (external_sync_status in (
                          'not_required',
                          'pending',
                          'synced',
                          'failed'
                        )),
  external_sync_error   text check (external_sync_error is null or char_length(external_sync_error) <= 1000),
  external_sync_at      timestamptz,

  -- Makes proposal creation and execution idempotent under double submission.
  idempotency_key       text not null unique check (char_length(idempotency_key) between 8 and 200),

  updated_at            timestamptz not null default now(),

  -- A decided request must record who decided it and when.
  constraint change_approval_requests_decision_complete check (
    (decided_at is null and decided_by is null)
    or (decided_at is not null and decided_by is not null)
  ),
  -- Only rejections carry a rejection reason.
  constraint change_approval_requests_rejection_reason check (
    rejection_reason is null or status = 'rejected'
  )
);

create index if not exists change_approval_requests_status_idx
  on public.change_approval_requests (status, created_at desc);

create index if not exists change_approval_requests_pending_idx
  on public.change_approval_requests (created_at desc)
  where status in ('pending_approval', 'stale_requires_reapproval');

create index if not exists change_approval_requests_parent_idx
  on public.change_approval_requests (parent_entity_id, created_at desc);

create index if not exists change_approval_requests_requested_by_idx
  on public.change_approval_requests (requested_by, created_at desc);

alter table public.change_approval_requests enable row level security;

alter table public.notifications
  drop constraint if exists notifications_approval_request_id_fkey;
alter table public.notifications
  add constraint notifications_approval_request_id_fkey
  foreign key (approval_request_id)
  references public.change_approval_requests(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Immutable audit trail
-- ---------------------------------------------------------------------------

create table if not exists public.change_approval_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.change_approval_requests(id) on delete cascade,
  event_type  text not null check (event_type in (
                'proposed',
                'approved',
                'rejected',
                'expired',
                'execution_started',
                'executed',
                'execution_failed',
                'marked_stale',
                'external_sync_succeeded',
                'external_sync_failed'
              )),
  actor_id    uuid references public.profiles(id) on delete set null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists change_approval_events_request_idx
  on public.change_approval_events (request_id, created_at);

alter table public.change_approval_events enable row level security;

-- Audit rows are append-only, including for the service role.
create or replace function public.protect_change_approval_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Approval audit events are immutable.';
end;
$$;

drop trigger if exists change_approval_events_immutable on public.change_approval_events;
create trigger change_approval_events_immutable
  before update or delete on public.change_approval_events
  for each row execute function public.protect_change_approval_events();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- Reads: approvers see everything; a proposer sees what they raised. All writes
-- go through the SECURITY DEFINER functions below, so there are no write
-- policies at all — a client cannot flip a status directly.
drop policy if exists change_approval_requests_read on public.change_approval_requests;
create policy change_approval_requests_read on public.change_approval_requests
  for select to authenticated
  using (
    public.is_active_user()
    and (public.can_approve_supplier_change() or requested_by = auth.uid())
  );

drop policy if exists change_approval_events_read on public.change_approval_events;
create policy change_approval_events_read on public.change_approval_events
  for select to authenticated
  using (
    public.is_active_user()
    and exists (
      select 1
      from public.change_approval_requests request
      where request.id = change_approval_events.request_id
        and (public.can_approve_supplier_change() or request.requested_by = auth.uid())
    )
  );

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
  for select to authenticated
  using (public.is_active_user() and recipient_id = auth.uid());

grant select on public.change_approval_requests to authenticated;
grant select on public.change_approval_events to authenticated;
grant select on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Proposal
-- ---------------------------------------------------------------------------

create or replace function public.create_change_approval_request(
  p_action_type          text,
  p_entity_type          text,
  p_entity_id            uuid,
  p_parent_entity_id     uuid,
  p_supplier             text,
  p_source_part_number   text,
  p_proposed_part_number text,
  p_summary              text,
  p_proposed_changes     jsonb,
  p_current_values       jsonb,
  p_xero_impact          text,
  p_xero_impact_detail   text,
  p_supplier_checked_at  timestamptz,
  p_idempotency_key      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_id      uuid;
  v_existing public.change_approval_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if not public.can_propose_supplier_change() then
    raise exception 'Your role cannot propose supplier changes.' using errcode = '42501';
  end if;

  -- Idempotent: a resubmitted proposal returns the request already recorded
  -- rather than creating a second one.
  select * into v_existing
  from public.change_approval_requests
  where idempotency_key = p_idempotency_key;

  if found then
    return v_existing.id;
  end if;

  insert into public.change_approval_requests (
    action_type, entity_type, entity_id, parent_entity_id,
    supplier, source_part_number, proposed_part_number,
    summary, proposed_changes, current_values,
    xero_impact, xero_impact_detail, supplier_checked_at,
    requested_by, idempotency_key
  )
  values (
    p_action_type, p_entity_type, p_entity_id, p_parent_entity_id,
    p_supplier, p_source_part_number, p_proposed_part_number,
    p_summary, coalesce(p_proposed_changes, '{}'::jsonb), coalesce(p_current_values, '{}'::jsonb),
    coalesce(p_xero_impact, 'none'), p_xero_impact_detail, p_supplier_checked_at,
    v_actor, p_idempotency_key
  )
  returning id into v_id;

  insert into public.change_approval_events (request_id, event_type, actor_id, detail)
  values (
    v_id,
    'proposed',
    v_actor,
    jsonb_build_object('actionType', p_action_type, 'supplier', p_supplier)
  );

  -- Ask every approver to decide. This is the CRM notification the workflow
  -- requires before anything changes.
  insert into public.notifications (recipient_id, kind, title, body, approval_request_id, link_path)
  select
    approver.id,
    'approval_request',
    'Approval required',
    p_summary,
    v_id,
    '/approvals'
  from public.profiles approver
  where approver.status = 'active'
    and approver.role::text in ('owner', 'project_manager');

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Decision
-- ---------------------------------------------------------------------------

create or replace function public.decide_change_approval_request(
  p_request_id uuid,
  p_decision   text,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_request public.change_approval_requests%rowtype;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if not public.can_approve_supplier_change() then
    raise exception 'Your role cannot approve supplier changes.' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision.' using errcode = '22023';
  end if;

  -- Serialize concurrent decisions on this request. Two people pressing
  -- Approve and Reject at the same moment queue here; the first to acquire the
  -- lock decides, the second is told it is already settled.
  select * into v_request
  from public.change_approval_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_request.status not in ('pending_approval', 'stale_requires_reapproval') then
    return jsonb_build_object('ok', false, 'code', 'already_decided', 'status', v_request.status);
  end if;

  if v_request.expires_at <= now() then
    update public.change_approval_requests
      set status = 'expired', updated_at = now()
      where id = p_request_id;
    insert into public.change_approval_events (request_id, event_type, actor_id)
      values (p_request_id, 'expired', v_actor);
    return jsonb_build_object('ok', false, 'code', 'expired', 'status', 'expired');
  end if;

  update public.change_approval_requests
    set status = p_decision,
        decided_at = now(),
        decided_by = v_actor,
        rejection_reason = case when p_decision = 'rejected' then v_reason else null end,
        updated_at = now()
    where id = p_request_id;

  insert into public.change_approval_events (request_id, event_type, actor_id, detail)
  values (p_request_id, p_decision, v_actor, jsonb_build_object('reason', v_reason));

  -- The decision is made: retire the outstanding "please decide" notifications.
  update public.notifications
    set read_at = now()
    where approval_request_id = p_request_id
      and kind = 'approval_request'
      and read_at is null;

  if v_request.requested_by is distinct from v_actor then
    insert into public.notifications (recipient_id, kind, title, body, approval_request_id, link_path)
    values (
      v_request.requested_by,
      'approval_decided',
      case when p_decision = 'approved' then 'Change approved' else 'Change rejected' end,
      v_request.summary,
      p_request_id,
      '/approvals'
    );
  end if;

  return jsonb_build_object('ok', true, 'code', p_decision, 'status', p_decision);
end;
$$;

-- ---------------------------------------------------------------------------
-- Execution lifecycle
-- ---------------------------------------------------------------------------

-- Claim an approved request for execution. This is the single point that makes
-- execution happen at most once: the compare-and-set from 'approved' to
-- 'executing' succeeds for exactly one caller, so a double-clicked Approve
-- cannot insert two parts.
create or replace function public.begin_change_approval_execution(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_claimed uuid;
  v_status  text;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if not public.can_approve_supplier_change() then
    raise exception 'Your role cannot execute supplier changes.' using errcode = '42501';
  end if;

  update public.change_approval_requests
    set status = 'executing',
        executing_at = now(),
        updated_at = now()
    where id = p_request_id
      and status = 'approved'
    returning id into v_claimed;

  if v_claimed is null then
    select status into v_status
    from public.change_approval_requests
    where id = p_request_id;

    if v_status is null then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    return jsonb_build_object('ok', false, 'code', 'not_executable', 'status', v_status);
  end if;

  insert into public.change_approval_events (request_id, event_type, actor_id)
  values (p_request_id, 'execution_started', v_actor);

  return jsonb_build_object('ok', true, 'code', 'claimed', 'status', 'executing');
end;
$$;

create or replace function public.complete_change_approval_execution(
  p_request_id       uuid,
  p_result_entity_id uuid,
  p_sync_status      text default 'not_required',
  p_sync_error       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_updated uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if p_sync_status not in ('not_required', 'pending', 'synced', 'failed') then
    raise exception 'Invalid sync status.' using errcode = '22023';
  end if;

  update public.change_approval_requests
    set status = 'executed',
        executed_at = now(),
        execution_status = 'succeeded',
        result_entity_id = coalesce(p_result_entity_id, result_entity_id),
        entity_id = coalesce(entity_id, p_result_entity_id),
        external_sync_status = p_sync_status,
        external_sync_error = p_sync_error,
        external_sync_at = case when p_sync_status in ('synced', 'failed') then now() else null end,
        updated_at = now()
    where id = p_request_id
      and status = 'executing'
    returning id into v_updated;

  if v_updated is null then
    return jsonb_build_object('ok', false, 'code', 'not_executing');
  end if;

  insert into public.change_approval_events (request_id, event_type, actor_id, detail)
  values (
    p_request_id,
    'executed',
    v_actor,
    jsonb_build_object('resultEntityId', p_result_entity_id, 'syncStatus', p_sync_status)
  );

  if p_sync_status = 'failed' then
    insert into public.change_approval_events (request_id, event_type, actor_id, detail)
    values (p_request_id, 'external_sync_failed', v_actor, jsonb_build_object('error', p_sync_error));

    -- The CRM change landed but the accounting system did not: say so rather
    -- than letting the user believe everything synced.
    insert into public.notifications (recipient_id, kind, title, body, approval_request_id, link_path)
    select approver.id,
           'sync_failed',
           'Accounting sync failed',
           'The change was applied in Coastal CRM but could not be synced to Xero.',
           p_request_id,
           '/approvals'
    from public.profiles approver
    where approver.status = 'active'
      and approver.role::text in ('owner', 'project_manager');
  elsif p_sync_status = 'synced' then
    insert into public.change_approval_events (request_id, event_type, actor_id)
    values (p_request_id, 'external_sync_succeeded', v_actor);
  end if;

  return jsonb_build_object('ok', true, 'code', 'executed', 'status', 'executed');
end;
$$;

create or replace function public.fail_change_approval_execution(
  p_request_id uuid,
  p_error      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_updated uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  update public.change_approval_requests
    set status = 'failed',
        execution_status = 'failed',
        execution_error = left(coalesce(p_error, 'Execution failed.'), 1000),
        updated_at = now()
    where id = p_request_id
      and status = 'executing'
    returning id into v_updated;

  if v_updated is null then
    return jsonb_build_object('ok', false, 'code', 'not_executing');
  end if;

  insert into public.change_approval_events (request_id, event_type, actor_id, detail)
  values (p_request_id, 'execution_failed', v_actor, jsonb_build_object('error', left(coalesce(p_error, ''), 1000)));

  return jsonb_build_object('ok', true, 'code', 'failed', 'status', 'failed');
end;
$$;

-- Supplier pricing moved between approval and execution: send it back for a
-- fresh decision instead of applying a number the approver never saw.
create or replace function public.mark_change_approval_stale(
  p_request_id     uuid,
  p_summary        text,
  p_current_values jsonb,
  p_detail         jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_request public.change_approval_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  select * into v_request
  from public.change_approval_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_request.status not in ('approved', 'executing') then
    return jsonb_build_object('ok', false, 'code', 'not_stalable', 'status', v_request.status);
  end if;

  update public.change_approval_requests
    set status = 'stale_requires_reapproval',
        summary = coalesce(nullif(btrim(p_summary), ''), summary),
        current_values = coalesce(p_current_values, current_values),
        supplier_checked_at = now(),
        -- Clear the decision so the request must be decided again.
        decided_at = null,
        decided_by = null,
        executing_at = null,
        updated_at = now()
    where id = p_request_id;

  insert into public.change_approval_events (request_id, event_type, actor_id, detail)
  values (
    p_request_id,
    'marked_stale',
    v_actor,
    coalesce(p_detail, '{}'::jsonb)
      || jsonb_build_object('previousDecisionBy', v_request.decided_by, 'previousDecisionAt', v_request.decided_at)
  );

  insert into public.notifications (recipient_id, kind, title, body, approval_request_id, link_path)
  select approver.id,
         'approval_stale',
         'Re-approval required',
         coalesce(nullif(btrim(p_summary), ''), v_request.summary),
         p_request_id,
         '/approvals'
  from public.profiles approver
  where approver.status = 'active'
    and approver.role::text in ('owner', 'project_manager');

  return jsonb_build_object('ok', true, 'code', 'stale', 'status', 'stale_requires_reapproval');
end;
$$;

create or replace function public.record_external_sync_result(
  p_request_id uuid,
  p_status     text,
  p_error      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_updated uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if p_status not in ('not_required', 'pending', 'synced', 'failed') then
    raise exception 'Invalid sync status.' using errcode = '22023';
  end if;

  update public.change_approval_requests
    set external_sync_status = p_status,
        external_sync_error = case when p_status = 'failed' then left(coalesce(p_error, ''), 1000) else null end,
        external_sync_at = now(),
        updated_at = now()
    where id = p_request_id
      and status = 'executed'
    returning id into v_updated;

  if v_updated is null then
    return jsonb_build_object('ok', false, 'code', 'not_executed');
  end if;

  insert into public.change_approval_events (request_id, event_type, actor_id, detail)
  values (
    p_request_id,
    case when p_status = 'failed' then 'external_sync_failed' else 'external_sync_succeeded' end,
    v_actor,
    jsonb_build_object('status', p_status, 'error', left(coalesce(p_error, ''), 1000))
  );

  return jsonb_build_object('ok', true, 'code', p_status);
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count integer;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  update public.notifications
    set read_at = now()
    where recipient_id = v_actor
      and read_at is null
      and (p_ids is null or id = any (p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.can_propose_supplier_change() to authenticated;
grant execute on function public.can_approve_supplier_change() to authenticated;
grant execute on function public.create_change_approval_request(
  text, text, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, timestamptz, text
) to authenticated;
grant execute on function public.decide_change_approval_request(uuid, text, text) to authenticated;
grant execute on function public.begin_change_approval_execution(uuid) to authenticated;
grant execute on function public.complete_change_approval_execution(uuid, uuid, text, text) to authenticated;
grant execute on function public.fail_change_approval_execution(uuid, text) to authenticated;
grant execute on function public.mark_change_approval_stale(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.record_external_sync_result(uuid, text, text) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
