-- P10: versioned project models and server-side Onshape imports.

create table public.project_models (
  id                       uuid primary key default gen_random_uuid(),
  project_id               uuid not null references public.projects(id) on delete cascade,
  name                     text not null check (char_length(btrim(name)) between 1 and 160),
  storage_path             text not null check (char_length(btrim(storage_path)) between 1 and 500),
  source                   text not null default 'upload' check (source in ('upload', 'onshape')),
  is_primary               boolean not null default false,
  file_size_bytes          bigint check (file_size_bytes is null or file_size_bytes between 1 and 83886080),
  onshape_document_id      text,
  onshape_wvm              text check (onshape_wvm is null or onshape_wvm in ('w', 'v', 'm')),
  onshape_wvm_id           text,
  onshape_element_id       text,
  onshape_element_type     text check (onshape_element_type is null or onshape_element_type in ('PARTSTUDIO', 'ASSEMBLY')),
  onshape_source_url       text,
  onshape_translation_id   text,
  onshape_resolution       text check (onshape_resolution is null or onshape_resolution in ('COARSE', 'MEDIUM', 'FINE')),
  imported_by              uuid references public.profiles(id) on delete set null,
  imported_at              timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  unique (project_id, storage_path),
  check (
    source = 'upload'
    or (
      onshape_document_id is not null
      and onshape_wvm is not null
      and onshape_wvm_id is not null
      and onshape_element_id is not null
      and onshape_element_type is not null
      and onshape_source_url is not null
      and onshape_translation_id is not null
      and onshape_resolution is not null
    )
  )
);

create unique index project_models_one_primary_idx
  on public.project_models (project_id)
  where is_primary;

create index project_models_project_imported_idx
  on public.project_models (project_id, imported_at desc);

alter table public.project_models enable row level security;

create policy project_models_read on public.project_models
  for select to authenticated
  using (
    public.is_active_user()
    and (
      public.is_admin()
      or exists (
        select 1
        from public.project_members member
        where member.project_id = project_models.project_id
          and member.profile_id = auth.uid()
      )
    )
  );

grant select on public.project_models to authenticated;

-- Preserve models uploaded before the model registry existed.
insert into public.project_models (
  project_id,
  name,
  storage_path,
  source,
  is_primary,
  imported_by,
  imported_at
)
select
  project.id,
  'Uploaded model',
  project.model_url,
  'upload',
  true,
  project.created_by,
  project.updated_at
from public.projects project
where nullif(btrim(project.model_url), '') is not null
on conflict (project_id, storage_path) do nothing;

create or replace function public.register_project_model(
  p_project_id uuid,
  p_name text,
  p_storage_path text,
  p_source text default 'upload',
  p_file_size_bytes bigint default null,
  p_onshape_document_id text default null,
  p_onshape_wvm text default null,
  p_onshape_wvm_id text default null,
  p_onshape_element_id text default null,
  p_onshape_element_type text default null,
  p_onshape_source_url text default null,
  p_onshape_translation_id text default null,
  p_onshape_resolution text default null,
  p_imported_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  model_id uuid;
  actor_id uuid := auth.uid();
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'Only project managers can register project models';
  end if;

  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found';
  end if;

  if auth.role() <> 'service_role' and p_imported_by is distinct from actor_id then
    raise exception 'Importer does not match the current user';
  end if;

  update public.project_models
  set is_primary = false
  where project_id = p_project_id and is_primary;

  insert into public.project_models (
    project_id,
    name,
    storage_path,
    source,
    is_primary,
    file_size_bytes,
    onshape_document_id,
    onshape_wvm,
    onshape_wvm_id,
    onshape_element_id,
    onshape_element_type,
    onshape_source_url,
    onshape_translation_id,
    onshape_resolution,
    imported_by
  ) values (
    p_project_id,
    btrim(p_name),
    btrim(p_storage_path),
    p_source,
    true,
    p_file_size_bytes,
    p_onshape_document_id,
    p_onshape_wvm,
    p_onshape_wvm_id,
    p_onshape_element_id,
    p_onshape_element_type,
    p_onshape_source_url,
    p_onshape_translation_id,
    p_onshape_resolution,
    p_imported_by
  )
  returning id into model_id;

  update public.projects
  set model_url = btrim(p_storage_path)
  where id = p_project_id;

  return model_id;
end;
$$;

create or replace function public.set_primary_project_model(
  p_project_id uuid,
  p_model_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_path text;
begin
  if not public.is_admin() then
    raise exception 'Only project managers can select the primary project model';
  end if;

  select storage_path into selected_path
  from public.project_models
  where id = p_model_id and project_id = p_project_id;

  if selected_path is null then
    raise exception 'Project model not found';
  end if;

  update public.project_models
  set is_primary = false
  where project_id = p_project_id and is_primary;

  update public.project_models
  set is_primary = true
  where id = p_model_id and project_id = p_project_id;

  update public.projects
  set model_url = selected_path
  where id = p_project_id;
end;
$$;

revoke all on function public.register_project_model(
  uuid, text, text, text, bigint, text, text, text, text, text, text, text, text, uuid
) from public;
grant execute on function public.register_project_model(
  uuid, text, text, text, bigint, text, text, text, text, text, text, text, text, uuid
) to authenticated, service_role;

revoke all on function public.set_primary_project_model(uuid, uuid) from public;
grant execute on function public.set_primary_project_model(uuid, uuid) to authenticated;

comment on table public.project_models is
  'Versioned 3D models attached to projects, including traceable Onshape imports.';
comment on function public.register_project_model(
  uuid, text, text, text, bigint, text, text, text, text, text, text, text, text, uuid
) is 'Atomically registers a model as primary and synchronizes projects.model_url.';
