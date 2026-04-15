-- 040_v1_garage_logos_bucket.sql
-- Phase 3 > V1.5 — Storage for garage-branded logos.
--
-- Files keyed under `{garage_id}/logo.{ext}` so managers can only
-- upload/overwrite/remove their own garage's logo. Public-read bucket
-- because the URL is embedded on public surfaces (kiosk, customer
-- status page, PDF job sheets).
--
-- Manager role is enforced on top of the folder-ownership check —
-- logo upload is a brand-identity decision, not something mechanics
-- should be able to flip.

begin;

insert into storage.buckets (id, name, public)
values ('garage-logos', 'garage-logos', true)
on conflict (id) do nothing;

-- SELECT: anyone can read — logos are intentionally public so the
-- kiosk + status page can link them without an auth round-trip.
drop policy if exists garage_logos_select on storage.objects;
create policy garage_logos_select on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'garage-logos');

-- INSERT/UPDATE/DELETE: only managers in the same garage may write,
-- and only into their own garage's folder. The folder prefix must
-- equal the caller's garage_id claim.
drop policy if exists garage_logos_insert on storage.objects;
create policy garage_logos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'garage-logos'
    and private.has_role('manager')
    and (storage.foldername(name))[1] = private.current_garage()::text
  );

drop policy if exists garage_logos_update on storage.objects;
create policy garage_logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'garage-logos'
    and private.has_role('manager')
    and (storage.foldername(name))[1] = private.current_garage()::text
  );

drop policy if exists garage_logos_delete on storage.objects;
create policy garage_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'garage-logos'
    and private.has_role('manager')
    and (storage.foldername(name))[1] = private.current_garage()::text
  );

commit;
