-- Idempotent migrations + demo seed. Safe to run on every deploy.

-- New project fields used by the UI.
alter table public.projects add column if not exists revision integer not null default 1;
alter table public.projects add column if not exists drawing_count integer not null default 0;
alter table public.projects add column if not exists structure_type text;

-- Demo data: only when the project table is still empty.
do $$
declare
  c_coastal uuid;
  c_gibsons uuid;
  c_sunshine uuid;
  c_private uuid;
  c_pender uuid;
  c_westcoast uuid;
begin
  if not exists (select 1 from public.projects) then
    insert into public.clients (name) values ('Coastal Marine Ltd') returning id into c_coastal;
    insert into public.clients (name) values ('Gibsons Harbour') returning id into c_gibsons;
    insert into public.clients (name) values ('Sunshine Docks Inc') returning id into c_sunshine;
    insert into public.clients (name) values ('Private') returning id into c_private;
    insert into public.clients (name) values ('Pender Harbour') returning id into c_pender;
    insert into public.clients (name) values ('West Coast Marine') returning id into c_westcoast;

    insert into public.projects
      (name, client_id, status, revision, drawing_count, structure_type, description)
    values
      ('Dock · Roberts Creek',  c_coastal,   'in_progress', 3, 5, 'dock',    'Floating dock with aluminium gangway.'),
      ('Wharf · Gibsons',       c_gibsons,   'in_review',   2, 4, 'wharf',   'Timber-decked commercial wharf upgrade.'),
      ('Pontoon · Sechelt',     c_sunshine,  'in_progress', 1, 6, 'pontoon', 'Concrete pontoon array for marina expansion.'),
      ('Dock · Halfmoon Bay',   c_private,   'completed',   4, 5, 'dock',    'Private residential dock and ramp.'),
      ('Ramp · Pender',         c_pender,    'planned',     1, 3, 'ramp',    'Vehicle launch ramp with abutment works.'),
      ('Pontoon · Egmont',      c_westcoast, 'completed',   3, 4, 'pontoon', 'Pontoon refit and reanchoring.');
  end if;
end $$;
