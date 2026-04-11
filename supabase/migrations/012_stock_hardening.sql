-- 012_stock_hardening.sql — stock integrity fixes flagged in pre-deploy test pass
--
-- 1. Add a CHECK constraint to stock_items.quantity_on_hand so a negative
--    quantity can never land in the table, regardless of how it got there.
--    Previously this was enforced only at the app layer (`Math.max(0, ...)`
--    in recordStockMovement), which would paper over accounting bugs instead
--    of catching them. With the constraint, a real bug surfaces as a DB
--    error the application can report and the manager can investigate.
--
-- 2. Introduce `public.apply_stock_movement(p_stock_item_id, p_delta, p_job_id, p_reason)`
--    — a SECURITY DEFINER RPC that inserts the movement row and updates
--    `quantity_on_hand` in a single atomic statement. The previous JS
--    implementation read the current quantity, added the delta in
--    TypeScript, and wrote it back, which is a classic lost-update race
--    when two movements land concurrently. The RPC does it as one
--    `update ... set quantity_on_hand = quantity_on_hand + $delta`
--    inside an implicit transaction, so concurrent movements serialise
--    correctly and the CHECK constraint catches any attempt to go negative.

begin;

-- 1. Non-negative quantity invariant
alter table public.stock_items
  add constraint stock_items_quantity_non_negative
  check (quantity_on_hand >= 0);

-- 2. Atomic stock movement RPC
create or replace function public.apply_stock_movement(
  p_stock_item_id uuid,
  p_delta int,
  p_job_id uuid default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_garage_id uuid := private.current_garage();
  v_staff_id uuid;
  v_item_garage uuid;
begin
  if v_garage_id is null then
    raise exception 'no garage_id in JWT claims';
  end if;

  if p_delta = 0 then
    raise exception 'delta must be non-zero';
  end if;

  v_staff_id := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;

  -- Confirm the stock item belongs to the caller's garage. Prevents
  -- a forged stock_item_id from a different tenant slipping through
  -- just because SECURITY DEFINER bypasses RLS on the update below.
  select garage_id into v_item_garage
  from public.stock_items
  where id = p_stock_item_id;

  if v_item_garage is null then
    raise exception 'stock item not found';
  end if;
  if v_item_garage <> v_garage_id then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  insert into public.stock_movements (
    garage_id, stock_item_id, job_id, delta, reason, staff_id
  ) values (
    v_garage_id, p_stock_item_id, p_job_id, p_delta, p_reason, v_staff_id
  );

  -- Atomic, race-free quantity update. The CHECK constraint above
  -- guarantees the new value is >= 0 or the whole transaction aborts.
  update public.stock_items
     set quantity_on_hand = quantity_on_hand + p_delta,
         updated_at = now()
   where id = p_stock_item_id;
end;
$$;

grant execute on function public.apply_stock_movement(uuid, int, uuid, text)
  to authenticated;

commit;
