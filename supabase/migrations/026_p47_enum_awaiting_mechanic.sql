-- 026_p47_enum_awaiting_mechanic.sql
-- P47: new job status for a job paused while a mechanic works a passback.
-- Kept separate from 026_p47_checkin_routing so the enum value is committed
-- before any query references it.

alter type public.job_status add value if not exists 'awaiting_mechanic';
