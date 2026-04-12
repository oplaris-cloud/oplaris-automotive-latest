-- 013_gdpr_export_complete.sql — Add job_parts and work_logs to GDPR export
--
-- The customer_data_export_impl function was missing job_parts and work_logs.
-- These tables contain customer-related data (linked via jobs) and must be
-- included for a complete GDPR subject access response.

begin;

create or replace function private.customer_data_export_impl(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'exported_at', now(),
    'customer', (select to_jsonb(c) from public.customers c where c.id = p_customer_id),
    'vehicles', coalesce(
      (select jsonb_agg(to_jsonb(v)) from public.vehicles v where v.customer_id = p_customer_id),
      '[]'::jsonb
    ),
    'jobs', coalesce(
      (select jsonb_agg(to_jsonb(j)) from public.jobs j where j.customer_id = p_customer_id),
      '[]'::jsonb
    ),
    'job_parts', coalesce(
      (select jsonb_agg(to_jsonb(jp))
       from public.job_parts jp
       join public.jobs j on j.id = jp.job_id
       where j.customer_id = p_customer_id),
      '[]'::jsonb
    ),
    'work_logs', coalesce(
      (select jsonb_agg(to_jsonb(wl))
       from public.work_logs wl
       join public.jobs j on j.id = wl.job_id
       where j.customer_id = p_customer_id),
      '[]'::jsonb
    ),
    'approval_requests', coalesce(
      (select jsonb_agg(to_jsonb(ar))
       from public.approval_requests ar where ar.customer_id = p_customer_id),
      '[]'::jsonb
    ),
    'warranties', coalesce(
      (select jsonb_agg(to_jsonb(w))
       from public.warranties w
       join public.vehicles v on v.id = w.vehicle_id
       where v.customer_id = p_customer_id),
      '[]'::jsonb
    )
  ) into result;

  return result;
end $$;

commit;
