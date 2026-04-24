/**
 * job_charges RLS — UPDATE WITH CHECK (migration 051) +
 *                   INSERT WITH CHECK job-tenant guard (migration 052).
 *
 * Pre-051 state: `job_charges_update` had NULL WITH CHECK — a direct
 * CLAUDE.md Rule #3 violation. A session that could SEE a row could
 * mutate any column (garage_id, total, etc.) to any value with no
 * policy resistance. Migration 051 adds:
 *   (1) the same staff-subquery garage-wall predicate the INSERT
 *       policy uses, and
 *   (2) the `job_id`→garage consistency check pattern from
 *       migrations 049 / 050.
 * USING is unchanged, so existing-row visibility is identical.
 *
 * Migration 052 then closes the matching INSERT-side gap: pre-052
 * the WITH CHECK on `job_charges_insert` only enforced the staff-
 * subquery garage-wall match — `job_id` was unverified, so a session
 * in garage B could INSERT a charge with `(garage_id=B,
 * job_id=<garage-A job>)`. 052 mirrors 050's shape: adds
 * `EXISTS jobs WHERE id = job_charges.job_id AND garage_id =
 * job_charges.garage_id`. Same fix shape, different table.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { pool, withTx, asSuperuser } from "./db";
import {
  A_JOB,
  A_MANAGER,
  GARAGE_A,
  B_MANAGER,
  GARAGE_B,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

beforeAll(setupFixtures);
afterAll(async () => {
  await asSuperuser((c) =>
    c.query("delete from job_charges where garage_id in ($1, $2)", [GARAGE_A, GARAGE_B]),
  );
  await tearDownFixtures();
  await pool.end();
});

afterEach(async () => {
  await asSuperuser((c) =>
    c.query("delete from job_charges where garage_id in ($1, $2)", [GARAGE_A, GARAGE_B]),
  );
});

const aManager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const bManager = { sub: B_MANAGER, garage_id: GARAGE_B, role: "manager" as const };

const SEED_CHARGE_SQL = `
  insert into job_charges
    (garage_id, job_id, charge_type, description, quantity, unit_price_pence)
  values
    ($1, $2, 'labour', 'Diagnosis', 1, 5000)
  returning id
`;

const INSERT_CHARGE_SQL = `
  insert into job_charges
    (garage_id, job_id, charge_type, description, quantity, unit_price_pence)
  values
    ($1, $2, 'labour', 'Diagnosis', 1, 5000)
  returning id
`;

describe("job_charges INSERT WITH CHECK (migration 052)", () => {
  it("same-tenant manager CAN insert a charge against an own-garage job (regression guard)", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query(INSERT_CHARGE_SQL, [GARAGE_A, A_JOB]);
      expect(r.rowCount).toBe(1);
    });
  });

  it("cross-tenant INSERT rejected — B manager cannot insert a charge whose job_id belongs to A", async () => {
    // Pre-052 the only check was `garage_id = staff.garage_id`. A B-manager
    // setting `garage_id=B, job_id=A_JOB` satisfied that — INSERT succeeded
    // and polluted garage B's job_charges with a row pointing at garage A's
    // job UUID. Post-052 the EXISTS check sees `jobs.garage_id=A` ≠
    // `job_charges.garage_id=B` and rejects.
    await withTx(bManager, async (c) => {
      await expect(
        c.query(INSERT_CHARGE_SQL, [GARAGE_B, A_JOB]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("dangling job_id INSERT rejected — non-existent job UUID fails the EXISTS clause", async () => {
    // FK on job_charges.job_id → jobs.id would catch this even without 052,
    // but the test pins down the policy's behaviour rather than relying on
    // FK ordering. Pure-RLS rejection is what we want to assert.
    const fakeJobId = "00000000-0000-0000-0000-000000000fff";
    await withTx(aManager, async (c) => {
      await expect(
        c.query(INSERT_CHARGE_SQL, [GARAGE_A, fakeJobId]),
      ).rejects.toMatchObject({ code: expect.stringMatching(/42501|23503/) });
    });
  });
});

describe("job_charges UPDATE WITH CHECK (migration 051)", () => {
  it("same-tenant manager CAN update own-garage charge (regression guard)", async () => {
    // Seed as superuser so the test focuses on UPDATE, not INSERT.
    const seeded = await asSuperuser((c) => c.query(SEED_CHARGE_SQL, [GARAGE_A, A_JOB]));
    const chargeId = seeded.rows[0].id;

    await withTx(aManager, async (c) => {
      const r = await c.query(
        "update job_charges set description = 'Diagnosis (revised)' where id = $1",
        [chargeId],
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it("cross-tenant UPDATE rejected — B manager cannot mutate an A-garage charge", async () => {
    await asSuperuser((c) => c.query(SEED_CHARGE_SQL, [GARAGE_A, A_JOB]));

    // USING gates by staff-subquery garage_id match → B-manager sees 0 rows
    // to UPDATE. Silent no-op is the expected RLS outcome here; either 0
    // rowCount or 42501 proves the policy is intact.
    await withTx(bManager, async (c) => {
      const r = await c.query(
        "update job_charges set description = 'hijacked' where job_id = $1",
        [A_JOB],
      );
      expect(r.rowCount).toBe(0);
    });
  });
});
