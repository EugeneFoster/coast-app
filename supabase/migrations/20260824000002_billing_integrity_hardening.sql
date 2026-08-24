-- P5 hardening: normalize status timestamps and validate estimate-linked invoices.

create or replace function public.validate_invoice_project_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_client_id uuid;
  quote record;
begin
  if new.project_id is not null then
    select client_id into project_client_id
    from public.projects
    where id = new.project_id;

    if not found then
      raise exception 'Project not found';
    end if;
    if project_client_id is null or project_client_id <> new.client_id then
      raise exception 'Invoice customer must match the project customer';
    end if;
  end if;

  if new.source_estimate_id is not null then
    select e.status, e.client_id, o.project_id
    into quote
    from public.estimates e
    join public.opportunities o on o.id = e.opportunity_id
    where e.id = new.source_estimate_id;

    if not found then
      raise exception 'Source estimate not found';
    end if;
    if quote.status <> 'accepted' then
      raise exception 'Only an accepted estimate can be linked to an invoice';
    end if;
    if quote.project_id is null then
      raise exception 'Source estimate must be converted to a project first';
    end if;
    if quote.client_id is distinct from new.client_id
       or quote.project_id is distinct from new.project_id then
      raise exception 'Invoice customer and project must match the source estimate';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_validate_project_client on public.invoices;
create trigger invoices_validate_project_client
  before insert or update of client_id, project_id, source_estimate_id
  on public.invoices
  for each row execute function public.validate_invoice_project_client();

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
  elsif old.status = 'draft' and new.status = 'void' then
    null;
  elsif old.status = 'sent' and new.status = 'void' then
    if old.amount_paid <> 0 then
      raise exception 'An invoice with payments cannot be voided';
    end if;
  elsif old.status = 'void' and new.status = 'draft' then
    select count(*) into active_payments
    from public.invoice_payments
    where invoice_id = old.id and reversed_at is null;
    if old.amount_paid <> 0 or active_payments <> 0 then
      raise exception 'An invoice with payments cannot return to Draft';
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
  return new;
end;
$$;
