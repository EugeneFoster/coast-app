-- Extend the exact-match price watcher to the authenticated Marine Parts Supply catalogue.
alter table public.supplier_price_watches
  drop constraint if exists supplier_price_watches_supplier_code_check;
alter table public.supplier_price_watches
  add constraint supplier_price_watches_supplier_code_check
  check (supplier_code in ('westernmarine', 'marinepartssupply'));
