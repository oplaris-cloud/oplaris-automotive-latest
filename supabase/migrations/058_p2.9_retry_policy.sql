-- 058_p2.9_retry_policy.sql
-- P2.9 — Type-aware SMS retry policy.
--
-- Migration 054 added the retry queue worker that flips failed rows
-- back to `queued` with exponential backoff. It treats every type
-- identically: a failed `status_code` OTP older than its 10-minute
-- server-side validity will get re-sent at minute 12 anyway, even
-- though the code is already expired by the time Twilio's carriers
-- actually deliver it.
--
-- The TS-side policy lives in `src/lib/sms/retry-policy.ts`. Keep
-- both in sync if you tweak the windows.
--
-- Locked windows (Hossein 2026-04-25):
--
--   status_code        — 8 minutes (10-min OTP validity, 2-min
--                        delivery + typing tail)
--   approval_request   — 24 hours (signed HMAC token expires at 24 h)
--   mot_reminder_30d   \
--   mot_reminder_7d     } 24 hours (day late OK; week late mislabels
--   mot_reminder_5d    /  the window)
--   quote_sent         \
--   quote_updated       } indefinite — no time-sensitive content
--   invoice_sent       /
--
-- Behaviour change: rows older than their type's window no longer
-- flip back to `queued`. Instead, the worker stamps them
-- `failed_final` with `error_code='expired_by_policy'` and an
-- `error_message` that reports the window the row exceeded.

begin;

-- Pure boolean helper — true when the row is past its retry window
-- given a now() reference. Inlined (immutable, no security context)
-- so the planner can use it inside the worker's WHERE clauses
-- without LATERAL gymnastics.
create or replace function private.sms_row_expired_by_policy(
  p_message_type text,
  p_created_at timestamptz,
  p_now timestamptz default now()
)
returns boolean
language sql
immutable
as $$
  select case p_message_type
    when 'status_code'        then p_created_at + interval '8 minutes' < p_now
    when 'approval_request'   then p_created_at + interval '24 hours'  < p_now
    when 'mot_reminder_30d'   then p_created_at + interval '24 hours'  < p_now
    when 'mot_reminder_7d'    then p_created_at + interval '24 hours'  < p_now
    when 'mot_reminder_5d'    then p_created_at + interval '24 hours'  < p_now
    -- quote_sent / quote_updated / invoice_sent — indefinite. Any
    -- unknown type is treated as indefinite too; the manager can
    -- still cancel the row from /app/messages.
    else false
  end
$$;

-- Update the worker. Three buckets per call:
--
--   1. Rows expired-by-policy (any retry_count) → mark failed_final
--      with the diagnostic error_code so the Messages tab can
--      surface "expired" instead of just "Failed (no retry)".
--   2. Rows that are eligible (within window + under retry cap +
--      backoff elapsed) → flip to queued for the next dispatcher tick.
--   3. Rows that have exhausted 3 retries AND have been at the cap
--      for 24 h → age into failed_final (existing behaviour from 054).

create or replace function private.process_sms_retry_queue()
returns int
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_promoted int := 0;
  r record;
begin
  -- 1. Type-expired rows: skip retry, mark failed_final immediately.
  --    This catches any row whose content has aged past its useful
  --    window even if it still has retries left — re-sending an
  --    8-minute-old OTP would arrive after the 10-minute server-side
  --    code expiry.
  update public.sms_outbox o
  set status = 'failed_final',
      status_updated_at = now(),
      error_code = 'expired_by_policy',
      error_message = case o.message_type
        when 'status_code'      then 'status_code exceeded its 8-minute retry window'
        when 'approval_request' then 'approval_request exceeded its 24-hour retry window'
        when 'mot_reminder_30d' then 'mot_reminder_30d exceeded its 24-hour retry window'
        when 'mot_reminder_7d'  then 'mot_reminder_7d exceeded its 24-hour retry window'
        when 'mot_reminder_5d'  then 'mot_reminder_5d exceeded its 24-hour retry window'
        else o.message_type || ' exceeded its retry window'
      end
  where o.status = 'failed'
    and o.cancelled_at is null
    and private.sms_row_expired_by_policy(o.message_type, o.created_at);

  -- 2. Eligible-for-retry rows: flip back to queued, bump retry_count.
  --    Same backoff math as migration 054.
  for r in
    select id, retry_count, status_updated_at, created_at
    from public.sms_outbox
    where status = 'failed'
      and retry_count < 3
      and cancelled_at is null
      and not private.sms_row_expired_by_policy(message_type, created_at)
      and (
        coalesce(status_updated_at, created_at)
        + ((retry_count + 1) * interval '5 minutes')
      ) <= now()
    order by status_updated_at asc nulls first
    limit 50
  loop
    update public.sms_outbox
    set status = 'queued',
        retry_count = retry_count + 1,
        status_updated_at = now(),
        error_code = null,
        error_message = null
    where id = r.id;
    v_promoted := v_promoted + 1;
  end loop;

  -- 3. Exhausted-retry sweep (unchanged from 054). Captures rows that
  --    aren't expired-by-policy but have hit their 3-retry cap and
  --    sat at it for 24 h.
  update public.sms_outbox
  set status = 'failed_final',
      status_updated_at = now()
  where status = 'failed'
    and retry_count >= 3
    and cancelled_at is null
    and coalesce(status_updated_at, created_at) + interval '24 hours' < now();

  return v_promoted;
end;
$$;

-- The grants from migration 054 still apply (revoke from public/anon/
-- authenticated, grant to service_role via the public shim). Re-creating
-- the function preserves them via `create or replace`.

commit;
