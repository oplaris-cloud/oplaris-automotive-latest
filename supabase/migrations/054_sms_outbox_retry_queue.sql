-- ────────────────────────────────────────────────────────────────────
-- Migration 054 — sms_outbox retry queue (P2.2)
--
-- Migration 047 shipped the outbox table + status state machine
-- (queued → sent → delivered, with failed / cancelled side-states).
-- Plan P2.2 adds the auto-retry layer on top:
--
--   - `retry_count` per row so we can cap automatic retries
--   - `failed_final` terminal status meaning "cron has exhausted its
--     attempts; needs human eyes". Manual Retry from the Messages UI
--     still works (creates a fresh row), so the state is not a hard
--     dead-end for the manager — just a "stop auto-retrying" signal.
--   - `private.process_sms_retry_queue()` — the bulk worker the cron
--     calls every 5 min. Pure SQL state management (pg_cron + plpgsql
--     can't reach Twilio, so the actual send happens in the existing
--     queueSms path once a row flips back to `queued` and the next
--     synchronous request fires it).
--   - Exponential-ish backoff: the nth retry waits `n * 5` minutes
--     after the previous attempt's `status_updated_at`, so:
--       attempt #1 → 5 min after the original failure
--       attempt #2 → 10 min after attempt #1
--       attempt #3 → 15 min after attempt #2
--     Past 3 retries the row ages into `failed_final` once it's been
--     sitting at the cap for 24 h.
--   - `public.process_sms_retry_queue()` shim restricted to
--     `service_role` (matches the migration-053 pattern). The cron
--     job is enabled once the Edge Function dispatcher lands; the
--     `select cron.schedule(...)` line at the bottom is commented out
--     so this migration can apply without pg_cron being installed.
-- ────────────────────────────────────────────────────────────────────

alter table public.sms_outbox
  add column if not exists retry_count int not null default 0;

-- Widen the status enum to admit `failed_final` as a sixth value.
alter table public.sms_outbox
  drop constraint if exists sms_status_check;

alter table public.sms_outbox
  add constraint sms_status_check check (
    status in (
      'queued', 'sent', 'delivered',
      'failed', 'failed_final',
      'cancelled'
    )
  );

-- Index the cron's hot query — pick up failed rows with budget left
-- ordered by oldest-first so the queue drains fairly. Partial index
-- keeps it tiny (hundreds of rows max in practice).
create index if not exists sms_outbox_retry_idx
  on public.sms_outbox (status_updated_at)
  where status = 'failed' and retry_count < 3 and cancelled_at is null;

-- ───────────────────────────────────────────────────────────────────
-- Cron worker. Returns the number of rows promoted to `queued` this
-- tick. Side-effect: rows that hit the retry cap AND have been sitting
-- there for 24 h get aged into `failed_final` so they fall out of the
-- "needs retry" partial index.
-- ───────────────────────────────────────────────────────────────────

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
  for r in
    select id, retry_count, status_updated_at, created_at
    from public.sms_outbox
    where status = 'failed'
      and retry_count < 3
      and cancelled_at is null
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

  -- Age out exhausted retries into the terminal state so the cron
  -- partial index stays small and the Messages UI can colour-code
  -- "we tried 3 times and gave up — please look at this".
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

revoke all on function private.process_sms_retry_queue()
  from public, anon, authenticated;

-- Public wrapper — service_role only. The cron will eventually call
-- this via a Supabase Edge Function that owns the service-role JWT.
create or replace function public.process_sms_retry_queue()
returns int
language sql
security definer
set search_path = private, public
as $$
  select private.process_sms_retry_queue();
$$;

revoke all on function public.process_sms_retry_queue()
  from public, anon, authenticated;
grant execute on function public.process_sms_retry_queue() to service_role;

-- ───────────────────────────────────────────────────────────────────
-- pg_cron schedule — kept commented until the Twilio-dispatch Edge
-- Function is live. Enabling it now would flip rows back to `queued`
-- without anything to actually send them, which would silently rot.
-- Re-enable in the same commit that ships the dispatcher.
--
--   select cron.schedule(
--     'sms-retry-queue',
--     '*/5 * * * *',
--     $cron$ select public.process_sms_retry_queue(); $cron$
--   );
-- ───────────────────────────────────────────────────────────────────
