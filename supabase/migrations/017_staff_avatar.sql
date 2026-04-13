-- 017_staff_avatar.sql — Add avatar_url to staff table + storage bucket

begin;

alter table staff add column if not exists avatar_url text;

-- Storage bucket for staff profile pictures
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone authenticated can read avatars (public bucket)
-- Only the staff member themselves can upload their own avatar
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
