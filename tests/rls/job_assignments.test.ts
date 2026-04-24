/**
 * job_assignments RLS — INSERT WITH CHECK job-tenant guard
 * (migration 052).
 *
 * Pre-052 the WITH CHECK clause was
 *     garage_id = private.current_garage()
 *     and private.is_manager()
 * That blocks non-managers entirely (correct) and blocks cross-tenant
 * `garage_id` mismatches (correct) but does NOT verify that
 * `job_id` belongs to a job in the session's garage. A B-manager
 * could INSERT `(job_id=<garage-A job>, staff_id=B_MECHANIC,
 * garage_id=B)` — pollutes B's `job_assignments` with a row whose
 * `job_id` dangles into A's tenancy and gives B-techs a
 * `currentJobId` oracle on A-job UUIDs through their own tenant-
 * scoped reads. Tenant wall on A's reads is intact; the gap is
 * write-side, identical class to migrations 049 / 050 / 051.
 *
 * Migration 052 closes it by mirroring 050's shape:
 *     EXISTS jobs WHERE id = job_assignments.job_id
 *                  AND garage_id = job_assignments.garage_id
 *
 * The manager-only gate is preserved verbatim — non-managers are
 * still rejected, regression test below pins it down.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { pool, withTx, asSuperuser } from "./db";
import {
  A_JOB,
  A_MANAGER,
  A_MECHANIC,
  A_TESTER,
  GARAGE_A,
  B_JOB,
  B_MANAGER,
  B_MECHANIC,
  GARAGE_B,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

beforeAll(setupFixtures);
afterAll(async () => {
  // Strip ANY job_assignment row inserted during this suite. The fixture's
  // baseline (A_JOB → A_MECHANIC) is re-asserted by setupFixtures on every
  // run, so wiping rows for these two job UUIDs is safe.
  await asSuperuser((c) =>
    c.query(
      "delete from job_assignments where job_id in ($1, $2) and staff_id <> $3",
      [A_JOB, B_JOB, A_MECHANIC],
    ),
  );
  await tearDownFixtures();
  await pool.end();
});

afterEach(async () => {
  await asSuperuser((c) =>
    c.query(
      "delete from job_assignments where job_id in ($1, $2) and staff_id <> $3",
      [A_JOB, B_JOB, A_MECHANIC],
    ),
  );
});

const aManager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const aMechanic = { sub: A_MECHANIC, garage_id: GARAGE_A, role: "mechanic" as const };
const bManager = { sub: B_MANAGER, garage_id: GARAGE_B, role: "manager" as const };

const INSERT_SQL = `
  insert into job_assignments (job_id, staff_id, garage_id)
  values ($1, $2, $3)
`;

describe("job_assignments INSERT WITH CHECK (migration 052)", () => {
  it("same-tenant manager CAN assign a tester to an own-garage job (regression guard)", async () => {
    await withTx(aManager, async (c) => {
      // A_TESTER is not in the fixture baseline assignment for A_JOB.
      const r = await c.query(INSERT_SQL, [A_JOB, A_TESTER, GARAGE_A]);
      expect(r.rowCount).toBe(1);
    });
  });

  it("cross-tenant INSERT rejected — B manager cannot assign B's mechanic to an A-garage job", async () => {
    // Pre-052: `(garage_id=B, job_id=A_JOB, staff_id=B_MECHANIC)` satisfied
    // garage-wall + manager checks. Post-052: EXISTS jobs check fails
    // because `jobs.garage_id=A` ≠ `job_assignments.garage_id=B`.
    await withTx(bManager, async (c) => {
      await expect(
        c.query(INSERT_SQL, [A_JOB, B_MECHANIC, GARAGE_B]),
      ).rejects.toMatchObject({
        code: expect.stringMatching(/42501|23503/),
      });
    });
  });

  it("non-manager rejected — mechanic cannot self-assign even within their own garage", async () => {
    // Defence-in-depth regression: the manager-only gate must keep firing
    // post-052. A self-assigning mechanic would otherwise be a privilege
    // escalation path on top of any future relaxation of the assignment
    // policy.
    await withTx(aMechanic, async (c) => {
      // Use B_MECHANIC's id so we don't collide with the fixture's existing
      // (A_JOB, A_MECHANIC) row — the test isolates the role gate.
      await expect(
        c.query(INSERT_SQL, [A_JOB, B_MECHANIC, GARAGE_A]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});
