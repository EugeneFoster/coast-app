-- Private bucket for DZI tile pyramids (used when R2 is not configured).
insert into storage.buckets (id, name, public)
values ('drawing-tiles', 'drawing-tiles', false)
on conflict (id) do nothing;
