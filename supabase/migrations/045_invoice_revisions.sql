-- 045_invoice_revisions.sql — Tiered invoice editing
--
-- Before this migration, the `quoted` state silently locked editing
-- even though the charges actions still allowed CRUD. Once promoted
-- to `quoted`, managers had no way to adjust pricing short of
-- schema-level hacks. This migration adds the minimal metadata to
-- support the real-world flow: quote revisions pre-invoice, lock
-- post-invoice with an explicit "Revert to quoted" manager override.
--
-- New columns:
--   revision    int  — starts at 1; bumps on any charge change while
--                      the invoice is in `quoted` state. Surfaces to
--                      the customer as an "Updated" chip so they
--                      can see pricing changed mid-flight.
--   updated_at  timestamptz — stamped on every row mutation via the
--                      trigger below. Already present as a default but
--                      not auto-maintained; we wire a trigger now so
--                      downstream UI can honestly show "Updated 3m ago".

begin;

alter table public.invoices
  add column if not exists revision integer not null default 1;

-- `updated_at` already exists per migration 023; add only if missing
-- to remain idempotent on a reset.
alter table public.invoices
  add column if not exists updated_at timestamptz not null default now();

-- Auto-bump updated_at on every UPDATE. Safe on existing rows (the
-- default already populated them).
create or replace function public.invoices_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists invoices_touch_updated_at on public.invoices;
create trigger invoices_touch_updated_at
  before update on public.invoices
  for each row
  execute function public.invoices_touch_updated_at();

commit;
