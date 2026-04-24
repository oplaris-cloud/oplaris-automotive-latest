/**
 * job_passbacks RLS — direct SELECT visibility (audit F5 follow-up,
 * 2026-04-21).
 *
 * Coverage requested by `[STRATEGIST] 2026-04-21 09:45` Step 3: confirm
 * a mechanic assigned to a job CAN SELECT the job's pass-back row
 * directly (the new `tech/job/[id]/page.tsx` RSC fetch reads the
 * unreturned `job_passbacks` row through the user session and renders
 * the `PassbackContextCard`).
 *
 * Existing coverage in `passback_rpcs.test.ts` exercises the SECURITY
 * DEFINER RPCs (`pass_job_to_mechanic`, `return_job_to_mot_tester`,
 * `claim_passback`, `insert_passback_booking`) but does not exercise
 * direct SELECT through user-session RLS. This file fills that gap.
 *
 * No new migration; the `job_passbacks_select` policy was added in
 * migration 033 (P51) and is unchanged.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { pool, withTx, asSuperuser } from "./db";
import {
  A_JOB,
  A_MECHANIC,
  A_TESTER,
  GARAGE_A,
  B_MECHANIC,
  GARAGE_B,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

beforeAll(setupFixtures);
afterAll(async () => {
  await asSuperuser((c) =>
    c.query("delete from job_passbacks where garage_id in ($1, $2)", [GARAGE_A, GARAGE_B]),
  );
  await tearDownFixtures();
  await pool.end();
});

afterEach(async () => {
  await asSuperuser((c) =>
    c.query("delete from job_passbacks where garage_id in ($1, $2)", [GARAGE_A, GARAGE_B]),
  );
});

const SEED_PASSBACK_SQL = `
  insert into job_passbacks
    (garage_id, job_id, from_role, to_role, items, note)
  values
    ($1, $2, 'mot_tester', 'mechanic',
     '[{"item":"brake_pads"}]'::jsonb, 'Brake noise')
  returning id
`;

const mechanic = { sub: A_MECHANIC, garage_id: GARAGE_A, role: "mechanic" as const };
const tester = { sub: A_TESTER, garage_id: GARAGE_A, role: "mot_tester" as const };
const bMechanic = { sub: B_MECHANIC, garage_id: GARAGE_B, role: "mechanic" as const };

describe("job_passbacks SELECT (migration 033 policy, audit F5 coverage)", () => {
  it("assigned mechanic CAN SELECT the open pass-back on their job", async () => {
    await asSuperuser((c) => c.query(SEED_PASSBACK_SQL, [GARAGE_A, A_JOB]));

    await withTx(mechanic, async (c) => {
      const r = await c.query(
        "select id, items, note from job_passbacks where job_id = $1 and returned_at is null",
        [A_JOB],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].note).toBe("Brake noise");
    });
  });

  it("mot_tester in the same garage CAN also SELECT (no role gate on policy)", async () => {
    await asSuperuser((c) => c.query(SEED_PASSBACK_SQL, [GARAGE_A, A_JOB]));

    await withTx(tester, async (c) => {
      const r = await c.query(
        "select id from job_passbacks where job_id = $1",
        [A_JOB],
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it("cross-tenant SELECT returns no rows — B mechanic cannot read A's pass-back", async () => {
    await asSuperuser((c) => c.query(SEED_PASSBACK_SQL, [GARAGE_A, A_JOB]));

    await withTx(bMechanic, async (c) => {
      const r = await c.query(
        "select id from job_passbacks where job_id = $1",
        [A_JOB],
      );
      expect(r.rowCount).toBe(0);
    });
  });
});
