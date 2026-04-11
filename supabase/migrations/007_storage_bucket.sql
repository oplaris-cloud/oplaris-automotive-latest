-- 007_storage_bucket.sql — parts-invoices storage bucket + RLS
--
-- Path convention: {garage_id}/{job_id}/{uuid}.{ext}
-- Only authenticated staff can read (scoped to their garage + assigned jobs).
-- Writes go through a Server Action that validates MIME + magic bytes.

begin;

-- Create the bucket if it doesn't exist. Private (not public).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'parts-invoices',
  'parts-invoices',
  false,
  10485760, -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- =============================================================================
-- Storage RLS policies
-- =============================================================================

-- READ: authenticated staff in the same garage, with job visibility check.
-- Managers + MOT testers see all jobs; mechanics only see assigned jobs.
drop policy if exists parts_invoices_read on storage.objects;
create policy parts_invoices_read on storage.objects for select to authenticated
  using (
    bucket_id = 'parts-invoices'
    and (storage.foldername(name))[1] = private.current_garage()::text
    and exists (
      select 1 from public.jobs j
      where j.id::text = (storage.foldername(name))[2]
        and j.garage_id = private.current_garage()
        and (
          private.current_role() in ('manager', 'mot_tester')
          or exists (
            select 1 from public.job_assignments ja
            where ja.job_id = j.id and ja.staff_id = auth.uid()
          )
        )
    )
  );

-- WRITE: authenticated staff in the same garage. The Server Action
-- validates file content before uploading, so the storage policy only
-- needs to enforce the garage path prefix.
drop policy if exists parts_invoices_write on storage.objects;
create policy parts_invoices_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'parts-invoices'
    and (storage.foldername(name))[1] = private.current_garage()::text
  );

-- UPDATE (metadata): same as write — needed for Supabase storage to
-- complete multipart uploads.
drop policy if exists parts_invoices_update on storage.objects;
create policy parts_invoices_update on storage.objects for update to authenticated
  using (
    bucket_id = 'parts-invoices'
    and (storage.foldername(name))[1] = private.current_garage()::text
  )
  with check (
    bucket_id = 'parts-invoices'
    and (storage.foldername(name))[1] = private.current_garage()::text
  );

commit;
