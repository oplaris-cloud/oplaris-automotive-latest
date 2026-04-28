/**
 * P2.4 — bay-change rows on `audit_log` are visible to all staff in
 * the same garage (so the `job_timeline_events.bay_change` kind
 * surfaces on tech + manager timelines), but the catch-all manager-
 * only audit_log SELECT policy is intact for non-bay actions like
 * `pii_read`. Cross-tenant isolation must hold either way.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asSuperuser, pool, withTx } from "./db";
import {
  A_JOB,
  A_MANAGER,
  A_MECHANIC,
  A_TESTER,
  B_JOB,
  B_MANAGER,
  B_MECHANIC,
  GARAGE_A,
  GARAGE_B,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

beforeAll(setupFixtures);
afterAll(async () => {
  await tearDownFixtures();
  await pool.end();
});

const aManager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const aTester = { sub: A_TESTER, garage_id: GARAGE_A, role: "mot_tester" as const };
const aMechanic = {
  sub: A_MECHANIC,
  garage_id: GARAGE_A,
  role: "mechanic" as const,
};
const bManager = {
  sub: B_MANAGER,
  garage_id: GARAGE_B,
  role: "manager" as const,
};
const bMechanic = {
  sub: B_MECHANIC,
  garage_id: GARAGE_B,
  role: "mechanic" as const,
};

beforeEach(async () => {
  // Seed one bay-change row + one PII-read row per garage.
  await asSuperuser(async (c) => {
    await c.query(
      `delete from audit_log
        where action in ('bay_assigned','bay_changed','pii_read_test')`,
    );
    await c.query(
      `insert into audit_log (garage_id, actor_staff_id, action, target_table, target_id, meta)
       values
         ($1, $2, 'bay_assigned', 'jobs', $3, '{"to_bay_id":"00000000-0000-0000-0000-000000000001"}'::jsonb),
         ($1, $2, 'pii_read_test', 'customers', null, '{}'::jsonb),
         ($4, $5, 'bay_assigned', 'jobs', $6, '{"to_bay_id":"00000000-0000-0000-0000-00000000ffff"}'::jsonb)`,
      [GARAGE_A, A_MANAGER, A_JOB, GARAGE_B, B_MANAGER, B_JOB],
    );
  });
});

describe("audit_log RLS — P2.4 bay-change visibility", () => {
  it("garage-A manager sees garage-A bay-change rows", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.audit_log
          where garage_id = $1 and action = 'bay_assigned'`,
        [GARAGE_A],
      );
      expect(r.rows[0]?.n).toBeGreaterThan(0);
    });
  });

  it("garage-A mechanic CAN see bay-change rows for their garage (P2.4 new policy)", async () => {
    await withTx(aMechanic, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.audit_log
          where garage_id = $1 and action = 'bay_assigned'`,
        [GARAGE_A],
      );
      expect(r.rows[0]?.n).toBeGreaterThan(0);
    });
  });

  it("garage-A MOT tester CAN see bay-change rows for their garage (P2.4 new policy)", async () => {
    await withTx(aTester, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.audit_log
          where garage_id = $1 and action = 'bay_assigned'`,
        [GARAGE_A],
      );
      expect(r.rows[0]?.n).toBeGreaterThan(0);
    });
  });

  it("garage-A mechanic does NOT see PII-read rows (manager-only stays)", async () => {
    await withTx(aMechanic, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.audit_log
          where garage_id = $1 and action = 'pii_read_test'`,
        [GARAGE_A],
      );
      expect(r.rows[0]?.n).toBe(0);
    });
  });

  it("garage-A manager DOES see PII-read rows (catch-all manager policy)", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.audit_log
          where garage_id = $1 and action = 'pii_read_test'`,
        [GARAGE_A],
      );
      expect(r.rows[0]?.n).toBeGreaterThan(0);
    });
  });

  it("garage-B mechanic sees zero garage-A bay-change rows", async () => {
    await withTx(bMechanic, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.audit_log
          where garage_id = $1 and action = 'bay_assigned'`,
        [GARAGE_A],
      );
      expect(r.rows[0]?.n).toBe(0);
    });
  });

  it("garage-B manager sees zero garage-A bay-change rows", async () => {
    await withTx(bManager, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.audit_log
          where garage_id = $1`,
        [GARAGE_A],
      );
      expect(r.rows[0]?.n).toBe(0);
    });
  });

  it("authenticated cannot direct-INSERT into audit_log (only service_role)", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query(
          `insert into audit_log (garage_id, actor_staff_id, action, target_table, target_id)
           values ($1, $2, 'bay_assigned', 'jobs', $3)`,
          [GARAGE_A, A_MANAGER, A_JOB],
        ),
      ).rejects.toThrow();
    });
  });
});

describe("job_timeline_events — bay_change kind (P2.4)", () => {
  it("garage-A mechanic sees the bay_change row in the unified view", async () => {
    await withTx(aMechanic, async (c) => {
      const r = await c.query(
        `select kind, payload
           from public.job_timeline_events
          where job_id = $1 and kind = 'bay_change'`,
        [A_JOB],
      );
      expect(r.rows.length).toBeGreaterThan(0);
      const row = r.rows[0];
      expect(row.kind).toBe("bay_change");
      // payload carries the audit meta + an `action` discriminator
      expect(row.payload.action).toBe("bay_assigned");
    });
  });

  it("garage-B manager sees zero bay_change rows for garage-A's job", async () => {
    await withTx(bManager, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.job_timeline_events
          where job_id = $1 and kind = 'bay_change'`,
        [A_JOB],
      );
      expect(r.rows[0]?.n).toBe(0);
    });
  });
});
