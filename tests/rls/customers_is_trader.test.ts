/**
 * B4 — customers.is_trader manager-only write enforcement.
 *
 * Migration 063 adds the column + a BEFORE INSERT/UPDATE trigger
 * (enforce_customer_is_trader_manager_only) that raises 42501 when a
 * non-manager attempts to flip is_trader. Manager writes pass; the
 * existing customers UPDATE policy continues to scope by garage_id.
 *
 * Mechanic / MOT-tester touching unrelated columns on a row (whether
 * is_trader is true or false) MUST still succeed — the trigger only
 * fires when is_trader actually changes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asSuperuser, pool, withTx } from "./db";
import {
  A_CUSTOMER,
  A_MANAGER,
  A_MECHANIC,
  A_TESTER,
  GARAGE_A,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

beforeAll(setupFixtures);
afterAll(async () => {
  await tearDownFixtures();
  await pool.end();
});

const aManager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const aMechanic = {
  sub: A_MECHANIC,
  garage_id: GARAGE_A,
  role: "mechanic" as const,
};
const aTester = {
  sub: A_TESTER,
  garage_id: GARAGE_A,
  role: "mot_tester" as const,
};

beforeEach(async () => {
  // Reset the seeded customer's is_trader to false before every case.
  await asSuperuser(async (c) => {
    await c.query(
      `update public.customers set is_trader = false where id = $1`,
      [A_CUSTOMER],
    );
  });
});

describe("customers.is_trader — manager-only writes (mig 063)", () => {
  it("manager CAN flip is_trader to true", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query(
        `update public.customers set is_trader = true where id = $1
         returning is_trader`,
        [A_CUSTOMER],
      );
      expect(r.rows[0]?.is_trader).toBe(true);
    });
  });

  it("manager CAN flip is_trader back to false", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `update public.customers set is_trader = true where id = $1`,
        [A_CUSTOMER],
      );
    });
    await withTx(aManager, async (c) => {
      const r = await c.query(
        `update public.customers set is_trader = false where id = $1
         returning is_trader`,
        [A_CUSTOMER],
      );
      expect(r.rows[0]?.is_trader).toBe(false);
    });
  });

  it("mechanic CANNOT flip is_trader (42501)", async () => {
    await withTx(aMechanic, async (c) => {
      await expect(
        c.query(
          `update public.customers set is_trader = true where id = $1`,
          [A_CUSTOMER],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("MOT tester CANNOT flip is_trader (42501)", async () => {
    await withTx(aTester, async (c) => {
      await expect(
        c.query(
          `update public.customers set is_trader = true where id = $1`,
          [A_CUSTOMER],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("mechanic CAN still update other columns (trigger no-ops when is_trader unchanged)", async () => {
    await withTx(aMechanic, async (c) => {
      const r = await c.query(
        `update public.customers set notes = 'mechanic-touched' where id = $1
         returning notes`,
        [A_CUSTOMER],
      );
      expect(r.rows[0]?.notes).toBe("mechanic-touched");
    });
  });

  it("mechanic can update other columns on a customer ALREADY marked trader (no flip)", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `update public.customers set is_trader = true where id = $1`,
        [A_CUSTOMER],
      );
    });
    await withTx(aMechanic, async (c) => {
      // Re-stating is_trader = true is the realistic ORM pattern (the
      // form sends every field). The trigger should treat
      // NEW.is_trader IS NOT DISTINCT FROM OLD.is_trader as no change.
      const r = await c.query(
        `update public.customers
            set notes = 'mechanic-noted', is_trader = true
          where id = $1
         returning notes, is_trader`,
        [A_CUSTOMER],
      );
      expect(r.rows[0]?.notes).toBe("mechanic-noted");
      expect(r.rows[0]?.is_trader).toBe(true);
    });
  });

  it("mot_tester INSERT with is_trader=true is rejected (42501)", async () => {
    // mot_tester is the lowest-privilege role allowed to INSERT
    // customers per the existing customers_insert RLS policy
    // (private.is_staff_or_manager — mechanic is NOT a staff_or_manager
    // for INSERT purposes, see mig 025).
    await withTx(aTester, async (c) => {
      await expect(
        c.query(
          `insert into public.customers (garage_id, full_name, phone, is_trader)
           values ($1, 'Trader Mc Tester', '+447900000099', true)`,
          [GARAGE_A],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("mot_tester INSERT with is_trader=false (default) is allowed", async () => {
    await withTx(aTester, async (c) => {
      const r = await c.query(
        `insert into public.customers (garage_id, full_name, phone)
         values ($1, 'Regular Customer Mc Tester', '+447900000088')
         returning is_trader`,
        [GARAGE_A],
      );
      expect(r.rows[0]?.is_trader).toBe(false);
    });
  });
});
