-- Employee roles and multi-skill trade profiles.
-- Enum values are added in their own migration because PostgreSQL requires a
-- commit before new enum values can be referenced by functions or data.

alter type public.user_role add value if not exists 'project_manager';
alter type public.user_role add value if not exists 'sales';
alter type public.user_role add value if not exists 'painter';
alter type public.user_role add value if not exists 'mechanic';
alter type public.user_role add value if not exists 'installer';
alter type public.user_role add value if not exists 'parts';
alter type public.user_role add value if not exists 'accounting';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'employee_specialty') then
    create type public.employee_specialty as enum (
      'cad_design',
      'welding',
      'aluminum_fabrication',
      'boat_painting',
      'marine_mechanics',
      'dock_installation',
      'haul_transport',
      'parts_sales'
    );
  end if;
end $$;

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles
  add column if not exists specialties public.employee_specialty[] not null default '{}';

create index if not exists profiles_role_status_idx
  on public.profiles (role, status);
