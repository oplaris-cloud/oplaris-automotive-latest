/**
 * V1 — garages_update_manager policy (migration 041).
 *
 * Pins the manager-scoped write access that the billing + branding
 * settings pages rely on. Prior to 041 the billing action updated
 * zero rows silently; this suite guards against regressing to that
 * state.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asSuperuser, pool, withTx } from "./db";
import {
  A_MANAGER,
  A_MECHANIC,
  A_TESTER,
  B_MANAGER,
  GARAGE_A,
  GARAGE_B,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

beforeAll(setupFixtures);
afterAll(async () => {
  // Restore the seeded placeholder so other suites that read this row
  // still see a stable brand_primary_hex.
  await asSuperuser(async (c) => {
    await c.query(
      `update public.garages set brand_primary_hex = '#D4232A' where id = $1`,
      [GARAGE_A],
    );
  });
  await tearDownFixtures();
  await pool.end();
});

const manager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const mechanic = {
  sub: A_MECHANIC,
  garage_id: GARAGE_A,
  role: "mechanic" as const,
};
const tester = { sub: A_TESTER, garage_id: GARAGE_A, role: "mot_tester" as const };
const bManager = {
  sub: B_MANAGER,
  garage_id: GARAGE_B,
  role: "manager" as const,
};

describe("garages_update_manager", () => {
  it("manager can update their own garage's brand row", async () => {
    await withTx(manager, async (c) => {
      const r = await c.query(
        `update public.garages
            set brand_primary_hex = '#112233'
          where id = $1
          returning brand_primary_hex`,
        [GARAGE_A],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0]?.brand_primary_hex).toBe("#112233");
    });
  });

  it("mechanic cannot update the garage row (silent no-op)", async () => {
    await withTx(mechanic, async (c) => {
      const r = await c.query(
        `update public.garages set brand_primary_hex = '#abcdef' where id = $1`,
        [GARAGE_A],
      );
      // RLS filters the target away — zero rows without raising.
      expect(r.rowCount).toBe(0);
    });
  });

  it("tester cannot update the garage row", async () => {
    await withTx(tester, async (c) => {
      const r = await c.query(
        `update public.garages set brand_primary_hex = '#abcdef' where id = $1`,
        [GARAGE_A],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  it("manager from another garage cannot update garage A", async () => {
    await withTx(bManager, async (c) => {
      const r = await c.query(
        `update public.garages set brand_primary_hex = '#abcdef' where id = $1`,
        [GARAGE_A],
      );
      expect(r.rowCount).toBe(0);
    });
  });
});

