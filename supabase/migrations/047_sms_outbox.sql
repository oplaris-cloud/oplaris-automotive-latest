-- 047_sms_outbox.sql — Universal SMS outbox + vehicle MOT tracking
--
-- Two intertwined features in one migration so they share the
-- realtime publication update at the bottom:
--
--   1. `sms_outbox` — every outgoing SMS (quote, resend, approval,
--      status code, invoice, MOT reminder) lands here first.
--      `queueSms()` writes the row + calls Twilio + stamps the SID.
--      Twilio's status webhook updates the row as the message moves
--      from queued → sent → delivered (or → failed). Manager-visible
--      via /app/messages so failures stop being invisible to the team.
--
--   2. `vehicles.mot_expiry_date` + `mot_last_checked_at` — first-class
--      columns for the MOT reminder cron. Today the data lives only
--      inside the cached DVSA JSON payload, which is fine for display
--      but painful to query against (date arithmetic on a JSON field
--      every cron run). Storing the expiry as a real DATE lets the
--      30-day / 7-day / 5-day reminder query become a simple index
--      lookup.
--
-- RLS pattern follows audit_log + job_status_events: manager-only
-- SELECT, INSERT/UPDATE/DELETE revoked from `authenticated`,
-- writes mediated by SECURITY DEFINER functions in `private`.
-- This keeps a leaked tech JWT from forging "delivered" status on
-- their own quote.

begin;

-- ---------------------------------------------------------------
-- 1a. sms_outbox
-- ---------------------------------------------------------------

create table public.sms_outbox (
  id                  uuid primary key default gen_random_uuid(),
  garage_id           uuid not null references public.garages(id) on delete cascade,
  vehicle_id          uuid references public.vehicles(id) on delete set null,
  customer_id         uuid references public.customers(id) on delete set null,
  job_id              uuid references public.jobs(id) on delete set null,

  -- Message content
  phone               text not null,
  message_body        text not null,
  message_type        text not null,

  -- Scheduling. Null = send immediately (the queueSms helper fires
  -- Twilio synchronously and stamps the row). A future date means
  -- the cron picks it up at scheduled_for >= now().
  scheduled_for       timestamptz,

  -- DVSA pre-check (MOT reminders only). When the cron looks up the
  -- DVSA cache before sending, the result is recorded here so the
  -- Messages UI can show "skipped — MOT renewed elsewhere".
  dvsa_checked_at     timestamptz,
  dvsa_result         text,

  -- Twilio delivery tracking
  twilio_sid          text,
  status              text not null default 'queued',
  status_updated_at   timestamptz,
  error_code          text,
  error_message       text,

  -- Lifecycle
  cancelled_at        timestamptz,
  cancel_reason       text,
  created_at          timestamptz not null default now(),

  constraint sms_type_check check (
    message_type in (
      'mot_reminder_30d', 'mot_reminder_7d', 'mot_reminder_5d',
      'quote_sent', 'quote_updated',
      'approval_request',
      'status_code',
      'invoice_sent'
    )
  ),
  constraint sms_status_check check (
    status in ('queued', 'sent', 'delivered', 'failed', 'cancelled')
  ),
  constraint sms_dvsa_result_check check (
    dvsa_result is null
    or dvsa_result in ('no_new_mot', 'mot_renewed_skipped')
  )
);

-- ---------------------------------------------------------------
-- 1b. Indexes — match the four query shapes in the plan
-- ---------------------------------------------------------------

-- Cron: "what's queued and ready to send"
create index sms_outbox_queued_idx
  on public.sms_outbox (garage_id, scheduled_for)
  where status = 'queued' and cancelled_at is null;

-- Messages page: "show me everything for this garage by date desc"
create index sms_outbox_status_date_idx
  on public.sms_outbox (garage_id, status, created_at desc);

-- MOT cron dedup: "is there already a row for this vehicle + type"
create index sms_outbox_vehicle_idx
  on public.sms_outbox (vehicle_id, message_type, scheduled_for)
  where vehicle_id is not null;

-- Webhook: "find the row this Twilio status-callback belongs to"
create index sms_outbox_twilio_sid_idx
  on public.sms_outbox (twilio_sid)
  where twilio_sid is not null;

-- ---------------------------------------------------------------
-- 1c. RLS
-- ---------------------------------------------------------------

alter table public.sms_outbox enable row level security;

create policy sms_outbox_select_manager on public.sms_outbox
  for select to authenticated
  using (
    garage_id = private.current_garage()
    and private.has_role('manager')
  );

-- All writes go through SECURITY DEFINER below. A mechanic JWT
-- cannot forge "delivered" on a quote SMS or insert spam rows.
revoke insert, update, delete on public.sms_outbox from authenticated;

-- ---------------------------------------------------------------
-- 1d. SECURITY DEFINER — system inserts
-- ---------------------------------------------------------------

create or replace function private.insert_sms_outbox(
  p_garage_id     uuid,
  p_vehicle_id    uuid,
  p_customer_id   uuid,
  p_job_id        uuid,
  p_phone         text,
  p_message_body  text,
  p_message_type  text,
  p_scheduled_for timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
begin
  insert into public.sms_outbox (
    garage_id, vehicle_id, customer_id, job_id,
    phone, message_body, message_type, scheduled_for
  ) values (
    p_garage_id, p_vehicle_id, p_customer_id, p_job_id,
    p_phone, p_message_body, p_message_type, p_scheduled_for
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------
-- 1e. SECURITY DEFINER — Twilio status updates from the webhook.
--     Two writes happen here:
--       (a) once `queueSms` has the SID, it stamps it + flips
--           status to 'sent' or 'failed' depending on the create
--           call result.
--       (b) Twilio's status-callback POSTs into our webhook with
--           every state change; the webhook calls this RPC.
-- ---------------------------------------------------------------

create or replace function private.update_sms_status(
  p_twilio_sid    text,
  p_status        text,
  p_error_code    text default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  update public.sms_outbox
  set status = p_status,
      status_updated_at = now(),
      error_code = p_error_code,
      error_message = p_error_message
  where twilio_sid = p_twilio_sid;
end;
$$;

-- queueSms calls this immediately after the Twilio create call so
-- the SID is stored even before Twilio's first status callback hits.
create or replace function private.attach_sms_twilio_sid(
  p_outbox_id  uuid,
  p_twilio_sid text,
  p_status     text default 'sent'
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  update public.sms_outbox
  set twilio_sid = p_twilio_sid,
      status = p_status,
      status_updated_at = now()
  where id = p_outbox_id;
end;
$$;

-- queueSms calls this when the Twilio create call throws so the
-- failure is visible in the Messages UI. Distinct from attach_sid
-- so error_code + error_message can be passed without overloading
-- the success path.
create or replace function private.mark_sms_failed(
  p_outbox_id     uuid,
  p_error_code    text default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  update public.sms_outbox
  set status = 'failed',
      status_updated_at = now(),
      error_code = p_error_code,
      error_message = p_error_message
  where id = p_outbox_id;
end;
$$;

-- Manager-initiated cancel from the Messages page (queued rows only).
-- Sets cancelled_at + cancel_reason atomically. Returns the new row
-- count so the action can detect "row was already sent — too late".
create or replace function private.cancel_sms(
  p_outbox_id    uuid,
  p_cancel_reason text
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_count integer;
begin
  -- Manager-only — defensive double-check inside the SECURITY DEFINER
  if not private.has_role('manager') then
    raise exception 'manager role required';
  end if;
  update public.sms_outbox
  set status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = p_cancel_reason,
      status_updated_at = now()
  where id = p_outbox_id
    and status = 'queued'
    and garage_id = private.current_garage();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------
-- 1f. Vehicle MOT columns
-- ---------------------------------------------------------------

alter table public.vehicles
  add column if not exists mot_expiry_date date;

alter table public.vehicles
  add column if not exists mot_last_checked_at timestamptz;

-- Cron query support: "vehicles whose MOT expires in [today, today+30]"
create index if not exists vehicles_mot_expiry_idx
  on public.vehicles (garage_id, mot_expiry_date)
  where mot_expiry_date is not null and deleted_at is null;

-- ---------------------------------------------------------------
-- 1g. Realtime publication
-- ---------------------------------------------------------------

-- Manager Messages page subscribes to status changes via the shared
-- useRealtimeRouterRefresh hook. REPLICA IDENTITY FULL so the
-- payload includes enough columns for the client to filter on
-- garage_id without an extra round-trip.
alter table public.sms_outbox replica identity full;
alter publication supabase_realtime add table public.sms_outbox;

commit;
