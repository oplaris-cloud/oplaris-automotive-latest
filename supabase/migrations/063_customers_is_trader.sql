-- 063_customers_is_trader.sql
-- B4 (Batch 4) — TRADER customer flag.
--
-- Trade customers (other garages, dealers) get a visible TRADER label
-- + a flag to filter on later. The Edit-customer dialog and the
-- NewCustomerForm both surface a Switch wired into the existing
-- updateCustomer / createCustomer Server Actions.
--
-- Authorisation model:
--   * The Server Actions are already manager-gated (`requireManager`)
--     so the happy path is locked.
--   * Defence-in-depth: a BEFORE UPDATE trigger raises if a non-manager
--     attempts to flip is_trader. The UPDATE policy itself stays as-is
--     (it has no OLD/NEW comparison primitive — RLS WITH CHECK only sees
--     NEW values). Trigger fires *before* the row write, so a non-manager
--     calling the table directly via PostgREST cannot smuggle a flag flip
--     even with a JWT scoped to the right garage.
--   * INSERTs that set is_trader=true are gated the same way via a
--     BEFORE INSERT branch, so creating a trader row is also manager-only.
--
-- Filter integration is deferred to Batch 5 (the in-page customer
-- search ships then; the is_trader filter chip falls out of that
-- work naturally). A TODO marker lives in the customers list page
-- referencing Batch 5 — see the action commit.

begin;

alter table public.customers
  add column if not exists is_trader boolean not null default false;

comment on column public.customers.is_trader is
  'B4 — true marks the customer as a trade customer (other garage, dealer).
  Manager-only writes via the BEFORE UPDATE / INSERT trigger
  enforce_customer_is_trader_manager_only.';

-- =============================================================================
-- Trigger: only managers can flip is_trader on UPDATE; INSERT can only
-- set is_trader=true if the actor is a manager.
-- =============================================================================

create or replace function private.enforce_customer_is_trader_manager_only()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_trader is true and not private.has_role('manager') then
      raise exception 'is_trader can only be set by a manager'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- IS DISTINCT FROM treats NULLs sanely (column is NOT NULL but
    -- belt-and-braces) and only fires when the value actually changed.
    if (new.is_trader is distinct from old.is_trader)
       and not private.has_role('manager') then
      raise exception 'is_trader can only be changed by a manager'
        using errcode = '42501';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_customer_is_trader on public.customers;
create trigger trg_enforce_customer_is_trader
  before insert or update on public.customers
  for each row
  execute function private.enforce_customer_is_trader_manager_only();

commit;
