-- Storage buckets
insert into storage.buckets (id, name, public) values
  ('project-covers', 'project-covers', true),
  ('project-models', 'project-models', false),
  ('project-drawings', 'project-drawings', false),
  ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Avatars: public read, users write own folder
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

create policy avatars_own_write on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy avatars_own_update on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy avatars_own_delete on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Project covers: public read, admins write
create policy covers_public_read on storage.objects
  for select using (bucket_id = 'project-covers');

create policy covers_admin_write on storage.objects
  for all using (bucket_id = 'project-covers' and public.is_admin())
  with check (bucket_id = 'project-covers' and public.is_admin());

-- Project models: admins only
create policy models_admin on storage.objects
  for all using (bucket_id = 'project-models' and public.is_admin())
  with check (bucket_id = 'project-models' and public.is_admin());

-- Project drawings: admins only
create policy drawings_admin on storage.objects
  for all using (bucket_id = 'project-drawings' and public.is_admin())
  with check (bucket_id = 'project-drawings' and public.is_admin());
