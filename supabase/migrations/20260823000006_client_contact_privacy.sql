-- Keep project-visible customer names separate from sales-only contact details.

create table if not exists public.client_contacts (
  client_id        uuid primary key references public.clients(id) on delete cascade,
  contact_name     text,
  email            text,
  phone            text,
  billing_address  text,
  service_address  text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

insert into public.client_contacts (
  client_id,
  contact_name,
  email,
  phone,
  billing_address,
  service_address,
  notes
)
select
  id,
  contact_name,
  email,
  phone,
  billing_address,
  service_address,
  notes
from public.clients
on conflict (client_id) do update set
  contact_name = excluded.contact_name,
  email = excluded.email,
  phone = excluded.phone,
  billing_address = excluded.billing_address,
  service_address = excluded.service_address,
  notes = excluded.notes,
  updated_at = now();

drop trigger if exists trg_client_contacts_touch on public.client_contacts;
create trigger trg_client_contacts_touch
  before update on public.client_contacts
  for each row execute function public.touch_updated_at();

alter table public.client_contacts enable row level security;

drop policy if exists client_contacts_manage on public.client_contacts;
create policy client_contacts_manage on public.client_contacts for all
  using (public.can_manage_sales())
  with check (public.can_manage_sales());

drop policy if exists client_contacts_accounting_read on public.client_contacts;
create policy client_contacts_accounting_read on public.client_contacts for select
  using (public.can_view_sales());

create index if not exists client_contacts_email_idx
  on public.client_contacts (lower(email)) where email is not null;
create index if not exists client_contacts_phone_idx
  on public.client_contacts (phone) where phone is not null;

alter table public.clients drop column if exists contact_name;
alter table public.clients drop column if exists email;
alter table public.clients drop column if exists phone;
alter table public.clients drop column if exists billing_address;
alter table public.clients drop column if exists service_address;
alter table public.clients drop column if exists notes;
