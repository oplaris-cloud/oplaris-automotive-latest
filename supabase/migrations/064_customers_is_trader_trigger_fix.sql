-- 064_customers_is_trader_trigger_fix.sql
-- B4 — defensive bypass on the is_trader trigger when there is no
-- JWT in the session.
--
-- Why: the original mig 063 trigger called private.has_role('manager')
-- unconditionally. private.has_role -> private.current_roles() casts
-- current_setting('request.jwt.claims') to jsonb, which raises
-- "invalid input syntax for type json" when the GUC is empty string
-- (which can happen on a pooled connection that previously held a
-- JWT). It also incorrectly blocks direct admin / superuser writes
-- (test fixtures, admin scripts, future migrations) that legitimately
-- need to set is_trader without a JWT context.
--
-- Fix: short-circuit the check when there's no JWT. Direct DB
-- connections (postgres / service_role outside PostgREST) are already
-- privileged — the trigger is a defence-in-depth gate against the
-- authenticated PostgREST path. Anyone with raw DB access bypasses
-- the entire RLS surface anyway, so allowing them past this trigger
-- doesn't widen the attack surface.

create or replace function private.enforce_customer_is_trader_manager_only()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_claims_raw text := nullif(current_setting('request.jwt.claims', true), '');
begin
  -- No JWT in the session → admin / superuser / direct DB connection.
  -- Skip the check entirely; the caller already has privileges that
  -- bypass RLS. Authenticated PostgREST calls always carry a JWT.
  if v_claims_raw is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_trader is true and not private.has_role('manager') then
      raise exception 'is_trader can only be set by a manager'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
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
