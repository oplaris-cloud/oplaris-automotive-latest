-- 011_audit_log_rpc.sql — audit log write helper + GDPR export improvements
--
-- audit_log INSERT is locked from authenticated (Phase 1).
-- This SECURITY DEFINER helper lets Server Actions write audit entries
-- without granting direct INSERT to the authenticated role.

begin;

create or replace function public.write_audit_log(
  p_action text,
  p_target_table text default null,
  p_target_id uuid default null,
  p_meta jsonb default null,
  p_actor_ip text default null
)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_garage_id uuid := private.current_garage();
  v_staff_id uuid;
begin
  if v_garage_id is null then return; end if;
  v_staff_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;

  insert into public.audit_log (garage_id, actor_staff_id, actor_ip, action, target_table, target_id, meta)
  values (v_garage_id, v_staff_id, p_actor_ip::inet, p_action, p_target_table, p_target_id, p_meta);
end;
$$;

grant execute on function public.write_audit_log(text, text, uuid, jsonb, text) to authenticated;

-- Public wrapper for customer_data_export — PostgREST can only call
-- public schema functions. The actual logic stays in private.
create or replace function public.customer_data_export(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
begin
  -- Only managers may export
  if private.current_role() <> 'manager' then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  return private.customer_data_export_impl(p_customer_id);
end $$;

grant execute on function public.customer_data_export(uuid) to authenticated;
revoke execute on function public.customer_data_export(uuid) from anon, public;

-- The actual implementation in private schema
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
