-- 030_start_work_from_checkin_rpc.sql
-- Mechanic / manager self-starts a non-MOT check-in (electrical,
-- maintenance, or a passback). Mirrors start_mot_from_checkin — the flow
-- crosses tables that require manager-only writes, so SECURITY DEFINER
-- lets us authorise the role inside the function body.

create or replace function public.start_work_from_checkin(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_garage_id uuid := private.current_garage();
  v_booking public.bookings;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_reg text;
  v_job_id uuid;
  v_job_number text;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not (private.is_manager() or private.has_role('mechanic')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_garage_id is null then
    raise exception 'no garage_id in JWT claims' using errcode = '42501';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id
     and garage_id = v_garage_id
     and job_id is null
     and deleted_at is null;

  if not found then
    raise exception 'Check-in not found or already converted'
      using errcode = 'P0002';
  end if;

  if v_booking.service = 'mot' and v_booking.passed_from_job_id is null then
    raise exception 'MOT check-ins must be started by the MOT tester flow'
      using errcode = '22023';
  end if;

  v_reg := upper(regexp_replace(v_booking.registration, '\s+', '', 'g'));

  select id into v_customer_id
    from public.customers
   where phone = v_booking.customer_phone
     and garage_id = v_garage_id
     and deleted_at is null
   limit 1;

  if v_customer_id is null then
    insert into public.customers (garage_id, full_name, phone, email)
    values (
      v_garage_id,
      v_booking.customer_name,
      v_booking.customer_phone,
      nullif(v_booking.customer_email::text, '')
    )
    returning id into v_customer_id;
  end if;

  select id into v_vehicle_id
    from public.vehicles
   where registration = v_reg
     and garage_id = v_garage_id
     and deleted_at is null
   limit 1;

  if v_vehicle_id is null then
    insert into public.vehicles (garage_id, customer_id, registration, make, model)
    values (v_garage_id, v_customer_id, v_reg, v_booking.make, v_booking.model)
    returning id into v_vehicle_id;
  end if;

  v_job_number := private.next_job_number(v_garage_id);

  insert into public.jobs (
    garage_id, job_number, customer_id, vehicle_id, bay_id,
    status, service, source, description, estimated_ready_at, created_by
  ) values (
    v_garage_id, v_job_number, v_customer_id, v_vehicle_id, null,
    'in_diagnosis', v_booking.service, v_booking.source,
    case
      when v_booking.passed_from_job_id is not null
        then 'Passback' || coalesce(': ' || v_booking.passback_note, '')
      else initcap(v_booking.service::text)
             || ' — self-started'
             || coalesce(': ' || v_booking.notes, '')
    end,
    v_booking.preferred_date::timestamptz,
    v_uid
  )
  returning id into v_job_id;

  update public.bookings
     set job_id = v_job_id
   where id = p_booking_id;

  insert into public.job_assignments (job_id, staff_id, garage_id)
  values (v_job_id, v_uid, v_garage_id);

  return v_job_id;
end;
$$;

revoke all on function public.start_work_from_checkin(uuid) from public, anon;
grant execute on function public.start_work_from_checkin(uuid) to authenticated;
