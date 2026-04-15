-- 026_p47_insert_passback_booking_rpc.sql
-- P47 — SECURITY DEFINER RPC so an MOT tester (not just a manager) can
-- insert a passback booking. The existing bookings INSERT path is
-- service-role only (kiosk); this is the user-facing tester path.
--
-- Authorisation checks are inside the function: caller must be a manager
-- or mot_tester at the target garage.

create or replace function public.insert_passback_booking(
  p_garage_id uuid,
  p_service public.booking_service,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_registration text,
  p_make text,
  p_model text,
  p_passback_note text,
  p_passback_items jsonb,
  p_passed_from_job_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_booking_id uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not (private.is_manager() or private.has_role('mot_tester')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_garage_id <> private.current_garage() then
    raise exception 'cross-tenant forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.jobs j
     where j.id = p_passed_from_job_id
       and j.garage_id = p_garage_id
  ) then
    raise exception 'originating job not found' using errcode = 'P0002';
  end if;

  insert into public.bookings (
    garage_id, source, service,
    customer_name, customer_phone, customer_email,
    registration, make, model,
    priority, passback_note, passback_items, passed_from_job_id
  ) values (
    p_garage_id, 'manager', p_service,
    p_customer_name, p_customer_phone, p_customer_email,
    p_registration, p_make, p_model,
    1, p_passback_note, p_passback_items, p_passed_from_job_id
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

revoke all on function public.insert_passback_booking(uuid, public.booking_service, text, text, text, text, text, text, text, jsonb, uuid)
  from public, anon;
grant execute on function public.insert_passback_booking(uuid, public.booking_service, text, text, text, text, text, text, text, jsonb, uuid)
  to authenticated;
