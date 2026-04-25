-- ────────────────────────────────────────────────────────────────────
-- Migration 053 — public wrappers for sms_outbox helpers
--
-- Migration 047 created `insert_sms_outbox`, `attach_sms_twilio_sid`,
-- `update_sms_status`, `mark_sms_failed`, and `cancel_sms` in the
-- `private` schema. The application code in `src/lib/sms/queue.ts`,
-- `src/app/(app)/app/messages/actions.ts`, and
-- `src/app/api/webhooks/twilio/status/route.ts` calls them via
-- `supabase.rpc("<name>", args)`, which only resolves against schemas
-- PostgREST exposes — by default just `public`. Result: every status-
-- page code request and every quote/charge/approval SMS dispatch threw
-- "Could not find the function `public.insert_sms_outbox(...)` in the
-- schema cache" the moment it tried to insert into sms_outbox.
--
-- Fix: thin SECURITY DEFINER wrappers in `public` that delegate to the
-- existing `private.*` versions. The wrappers themselves do no work —
-- they exist purely so PostgREST sees the functions. EXECUTE is locked
-- to `service_role`, matching 047's access model (every call site uses
-- `createSupabaseAdminClient()`); `authenticated` + `anon` are revoked.
-- `set search_path = private, public` is defensive, not load-bearing,
-- because every call body schema-qualifies the private invocation.
-- ────────────────────────────────────────────────────────────────────

create or replace function public.insert_sms_outbox(
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
language sql
security definer
set search_path = private, public
as $$
  select private.insert_sms_outbox(
    p_garage_id, p_vehicle_id, p_customer_id, p_job_id,
    p_phone, p_message_body, p_message_type, p_scheduled_for
  );
$$;

revoke all on function public.insert_sms_outbox(uuid, uuid, uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.insert_sms_outbox(uuid, uuid, uuid, uuid, text, text, text, timestamptz)
  to service_role;

create or replace function public.attach_sms_twilio_sid(
  p_outbox_id  uuid,
  p_twilio_sid text,
  p_status     text default 'sent'
)
returns void
language sql
security definer
set search_path = private, public
as $$
  select private.attach_sms_twilio_sid(p_outbox_id, p_twilio_sid, p_status);
$$;

revoke all on function public.attach_sms_twilio_sid(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.attach_sms_twilio_sid(uuid, text, text)
  to service_role;

create or replace function public.update_sms_status(
  p_twilio_sid    text,
  p_status        text,
  p_error_code    text default null,
  p_error_message text default null
)
returns void
language sql
security definer
set search_path = private, public
as $$
  select private.update_sms_status(p_twilio_sid, p_status, p_error_code, p_error_message);
$$;

revoke all on function public.update_sms_status(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_sms_status(text, text, text, text)
  to service_role;

create or replace function public.mark_sms_failed(
  p_outbox_id     uuid,
  p_error_code    text default null,
  p_error_message text default null
)
returns void
language sql
security definer
set search_path = private, public
as $$
  select private.mark_sms_failed(p_outbox_id, p_error_code, p_error_message);
$$;

revoke all on function public.mark_sms_failed(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_sms_failed(uuid, text, text)
  to service_role;

create or replace function public.cancel_sms(
  p_outbox_id     uuid,
  p_cancel_reason text
)
returns integer
language sql
security definer
set search_path = private, public
as $$
  select private.cancel_sms(p_outbox_id, p_cancel_reason);
$$;

revoke all on function public.cancel_sms(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_sms(uuid, text)
  to service_role;
