-- 046_invoice_payments.sql — Payment state + method on invoices
--
-- Extends the invoice lifecycle from `draft → quoted → invoiced` to
-- `draft → quoted → invoiced → paid`. The `paid` state locks the
-- invoice in the same way `invoiced` does (migration 045's
-- `assertInvoiceEditable` gate already treats non-draft as locked;
-- this migration's action-layer update widens the lock to cover
-- `paid` too).
--
-- Columns:
--   paid_at         — stamped when `quote_status` flips to 'paid'.
--                     Cleared on `revertToInvoiced()`.
--   payment_method  — one of cash / card / bank_transfer / other.
--                     UK garage context — no online rails in v1.
--
-- `quote_status` is already a TEXT column, no enum to alter. The
-- CHECK constraint on that column predates multi-tenant work, so we
-- need to drop and recreate it to include 'paid'. Done in a single
-- transaction so nothing observes an intermediate state.

begin;

-- Drop the existing quote_status CHECK constraint and add one that
-- allows 'paid'. Name generated from the migration 023 schema.
alter table public.invoices
  drop constraint if exists invoices_quote_status_check;

alter table public.invoices
  add constraint invoices_quote_status_check
  check (quote_status in ('draft', 'quoted', 'invoiced', 'paid'));

alter table public.invoices
  add column if not exists paid_at timestamptz;

alter table public.invoices
  add column if not exists payment_method text
  check (payment_method is null or payment_method in ('cash', 'card', 'bank_transfer', 'other'));

-- Partial index to speed up the aging queries on /reports. 30-day
-- aging cuts the table to one scan of unpaid rows, not a full scan.
create index if not exists invoices_unpaid_aging_idx
  on public.invoices (invoiced_at)
  where quote_status = 'invoiced' and paid_at is null;

commit;
