-- 031_garage_labour_default_description.sql
-- P40 — optional default description for labour charges.
-- Lets a manager pre-fill, e.g. "Workshop labour" so the Labour-from-logs
-- dialog starts with a sensible description instead of auto-generated text.

alter table public.garages
  add column if not exists labour_default_description text;
