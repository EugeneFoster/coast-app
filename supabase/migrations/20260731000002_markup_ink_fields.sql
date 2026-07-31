-- Ink stroke metadata + permissioned delete for eraser tool.

alter table public.drawing_markups add column if not exists color text;
alter table public.drawing_markups add column if not exists stroke_width real;
alter table public.drawing_markups add column if not exists opacity real not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'drawing_markups'
      and policyname = 'markups_member_delete'
  ) then
    create policy markups_member_delete on public.drawing_markups for delete
      using (
        public.can_access_drawing(drawing_id)
        and (
          public.is_admin()
          or (kind = 'ink' and created_by = auth.uid())
        )
      );
  end if;
end $$;
