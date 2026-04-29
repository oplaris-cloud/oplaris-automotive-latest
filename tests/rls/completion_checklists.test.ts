/**
 * P3.3 — RLS guarantees behind the end-of-job completion checklist.
 *
 * Two tables involved:
 *   * job_completion_checklists — manager-only writes; staff-only reads.
 *   * job_completion_checks     — RPC-only writes; same-garage staff reads.
 *
 * Cross-tenant isolation is the load-bearing test — these tables sit
 * behind manager settings + tech submissions, so a leak across garages
 * would expose private SOPs and compliance audit trails.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asSuperuser, pool, withTx } from "./db";
import {
  A_JOB,
  A_MANAGER,
  A_MECHANIC,
  B_MANAGER,
  GARAGE_A,
  GARAGE_B,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

beforeAll(setupFixtures);
afterAll(async () => {
  await asSuperuser((c) =>
    c.query("delete from job_completion_checks where garage_id in ($1, $2)", [
      GARAGE_A,
      GARAGE_B,
    ]),
  );
  await asSuperuser((c) =>
    c.query("delete from job_completion_checklists where garage_id in ($1, $2)", [
      GARAGE_A,
      GARAGE_B,
    ]),
  );
  await tearDownFixtures();
  await pool.end();
});

const aManager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const aMechanic = { sub: A_MECHANIC, garage_id: GARAGE_A, role: "mechanic" as const };
const bManager = { sub: B_MANAGER, garage_id: GARAGE_B, role: "manager" as const };

describe("job_completion_checklists RLS", () => {
  it("non-manager cannot UPDATE checklists (mechanic blocked)", async () => {
    // Seed a checklist row for garage A.
    await asSuperuser((c) =>
      c.query(
        `insert into public.job_completion_checklists (garage_id, role, items, enabled)
         values ($1, 'mechanic', '["q1"]'::jsonb, false)
         on conflict (garage_id, role) do nothing`,
        [GARAGE_A],
      ),
    );

    await withTx(aMechanic, async (c) => {
      const r = await c.query(
        `update public.job_completion_checklists
            set enabled = true
          where garage_id = $1 and role = 'mechanic'`,
        [GARAGE_A],
      );
      // RLS UPDATE policy denies non-manager → 0 rows affected, no error.
      expect(r.rowCount).toBe(0);
    });
  });

  it("tech CAN SELECT same-garage checklists (UI fetches them at job-complete time)", async () => {
    await withTx(aMechanic, async (c) => {
      const r = await c.query(
        `select role, items, enabled
           from public.job_completion_checklists
          where garage_id = $1 and role = 'mechanic'`,
        [GARAGE_A],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].role).toBe("mechanic");
    });
  });

  it("cross-garage manager cannot SELECT another garage's checklist", async () => {
    await withTx(bManager, async (c) => {
      const r = await c.query(
        `select id from public.job_completion_checklists where garage_id = $1`,
        [GARAGE_A],
      );
      expect(r.rowCount).toBe(0);
    });
  });
});

describe("job_completion_checks RLS", () => {
  it("non-staff cannot SELECT checks across garages", async () => {
    // Seed a check row for garage A as superuser.
    await asSuperuser((c) =>
      c.query(
        `insert into public.job_completion_checks
           (garage_id, job_id, staff_id, role, answers)
         values ($1, $2, $3, 'mechanic',
                 '[{"question":"q1","answer":"yes"}]'::jsonb)`,
        [GARAGE_A, A_JOB, A_MECHANIC],
      ),
    );

    try {
      // Same-garage staff CAN read.
      await withTx(aMechanic, async (c) => {
        const r = await c.query(
          `select id from public.job_completion_checks where garage_id = $1`,
          [GARAGE_A],
        );
        expect(r.rowCount).toBe(1);
      });

      // Cross-garage manager CANNOT.
      await withTx(bManager, async (c) => {
        const r = await c.query(
          `select id from public.job_completion_checks where garage_id = $1`,
          [GARAGE_A],
        );
        expect(r.rowCount).toBe(0);
      });
    } finally {
      await asSuperuser((c) =>
        c.query("delete from public.job_completion_checks where job_id = $1", [
          A_JOB,
        ]),
      );
    }
  });

  it("authenticated client cannot INSERT directly into job_completion_checks (RPC-only)", async () => {
    await withTx(aMechanic, async (c) => {
      // Direct INSERTs are revoked from authenticated; only the
      // SECURITY DEFINER RPC writes through. Expect a 42501.
      await expect(
        c.query(
          `insert into public.job_completion_checks
             (garage_id, job_id, staff_id, role, answers)
           values ($1, $2, $3, 'mechanic',
                   '[{"question":"q1","answer":"yes"}]'::jsonb)`,
          [GARAGE_A, A_JOB, A_MECHANIC],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("job_completion_checklists manager writes", () => {
  it("garage A manager CAN UPDATE their own garage's checklist (regression guard)", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query(
        `update public.job_completion_checklists
            set enabled = true
          where garage_id = $1 and role = 'mechanic'`,
        [GARAGE_A],
      );
      expect(r.rowCount).toBe(1);
    });
  });
});
