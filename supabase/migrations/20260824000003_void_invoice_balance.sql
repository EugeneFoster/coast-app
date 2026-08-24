-- P5 accounting hardening: void invoices retain history but have no amount due.

alter table public.invoices drop constraint if exists invoices_balance_check;
alter table public.invoices add constraint invoices_balance_check check (
  (status = 'void' and balance_due = 0)
  or
  (status <> 'void' and balance_due = round(total - amount_paid, 2))
);

create or replace function public.calculate_invoice_totals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  taxable numeric(14,2);
begin
  if new.discount_amount > new.subtotal then
    raise exception 'Invoice discount cannot exceed the subtotal';
  end if;
  taxable := round(new.subtotal - new.discount_amount, 2);
  new.tax_amount := round(taxable * new.tax_rate_percent / 100, 2);
  new.total := round(taxable + new.tax_amount, 2);
  if new.amount_paid > new.total then
    raise exception 'Invoice payments cannot exceed the total';
  end if;
  new.balance_due := case
    when new.status = 'void' then 0
    else round(new.total - new.amount_paid, 2)
  end;
  new.updated_at := now();
  return new;
end;
$$;
create or replace function public.protect_invoice_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  internal_recalculation boolean :=
    coalesce(current_setting('coast.invoice_recalculation', true), '') = 'on';
  internal_payment boolean :=
    coalesce(current_setting('coast.invoice_payment', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft'
       or new.subtotal <> 0
       or new.tax_amount <> 0
       or new.total <> 0
       or new.amount_paid <> 0
       or new.balance_due <> 0 then
      raise exception 'New invoices must start as an empty draft';
    end if;
    if new.created_by <> auth.uid() then
      raise exception 'Invoice creator must match the authenticated user';
    end if;
    return new;
  end if;

  if new.invoice_number is distinct from old.invoice_number
     or new.created_by is distinct from old.created_by
     or new.source_estimate_id is distinct from old.source_estimate_id then
    raise exception 'Invoice identity fields cannot be changed';
  end if;

  if old.source_estimate_id is not null and (
    new.client_id is distinct from old.client_id
    or new.project_id is distinct from old.project_id
  ) then
    raise exception 'Estimate-linked invoice customer and project cannot be changed';
  end if;

  if new.subtotal is distinct from old.subtotal
     and not internal_recalculation then
    raise exception 'Invoice totals are calculated automatically';
  end if;

  if (
    new.tax_amount is distinct from old.tax_amount
    or new.total is distinct from old.total
  ) and not internal_recalculation and not internal_payment
    and new.discount_amount is not distinct from old.discount_amount
    and new.tax_rate_percent is not distinct from old.tax_rate_percent
    and new.subtotal is not distinct from old.subtotal then
    raise exception 'Invoice totals are calculated automatically';
  end if;

  if new.balance_due is distinct from old.balance_due
     and not internal_recalculation and not internal_payment
     and new.status is not distinct from old.status
     and new.discount_amount is not distinct from old.discount_amount
     and new.tax_rate_percent is not distinct from old.tax_rate_percent
     and new.subtotal is not distinct from old.subtotal
     and new.amount_paid is not distinct from old.amount_paid then
    raise exception 'Invoice totals are calculated automatically';
  end if;

  if new.amount_paid is distinct from old.amount_paid and not internal_payment then
    raise exception 'Invoice payments must be recorded through the payment ledger';
  end if;

  if (
    new.sent_at is distinct from old.sent_at
    or new.paid_at is distinct from old.paid_at
    or new.voided_at is distinct from old.voided_at
  ) and new.status = old.status and not internal_payment then
    raise exception 'Invoice status timestamps are calculated automatically';
  end if;

  if old.status <> 'draft' and not internal_payment and (
    new.client_id is distinct from old.client_id
    or new.project_id is distinct from old.project_id
    or new.title is distinct from old.title
    or new.issue_date is distinct from old.issue_date
    or new.due_date is distinct from old.due_date
    or new.notes is distinct from old.notes
    or new.terms is distinct from old.terms
    or new.tax_rate_percent is distinct from old.tax_rate_percent
    or new.discount_amount is distinct from old.discount_amount
  ) then
    raise exception 'Only draft invoice details can be edited';
  end if;

  return new;
end;
$$;

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
  new.balance_due := case
    when new.status = 'void' then 0
    else round(new.total - new.amount_paid, 2)
  end;
  return new;
end;
$$;
