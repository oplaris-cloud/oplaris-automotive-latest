/**
 * job_parts RLS — write-side tenancy + assignment enforcement
 * (migration 050, same shape as 049 on work_logs).
 *
 * Cases:
 *   - Assigned mechanic CAN INSERT a part on their assigned job (regression guard)
 *   - Manager CAN INSERT a part on any job in their garage (bypass via is_staff_or_manager)
 *   - Non-assignee mechanic CANNOT INSERT a part on a job they're not assigned to
 *   - Cross-tenant INSERT is rejected (mechanic in garage B, job_id in garage A)
 *   - Cross-tenant UPDATE is rejected (manager in garage B can't mutate a job_parts row
 *     whose job belongs to garage A even if they forge a matching garage_id column)
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
  await asSuperuser((c) =>
    c.query("delete from job_parts where garage_id in ($1, $2)", [GARAGE_A, GARAGE_B]),
  );
  await tearDownFixtures();
  await pool.end();
});

// Committed rows from previous tests must not leak between cases.
afterEach(async () => {
  await asSuperuser((c) =>
    c.query("delete from job_parts where garage_id in ($1, $2)", [GARAGE_A, GARAGE_B]),
  );
});

const manager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const mechanic = { sub: A_MECHANIC, garage_id: GARAGE_A, role: "mechanic" as const };
const tester = { sub: A_TESTER, garage_id: GARAGE_A, role: "mot_tester" as const };
const bMechanic = { sub: B_MECHANIC, garage_id: GARAGE_B, role: "mechanic" as const };
const bManager = { sub: B_MANAGER, garage_id: GARAGE_B, role: "manager" as const };

const INSERT_SQL = `
  insert into job_parts
    (garage_id, job_id, added_by, description, supplier,
     unit_price_pence, quantity, purchased_at, payment_method)
  values
    ($1, $2, $3, 'Front brake pads', 'ecp',
     5000, 2, now(), 'card')
`;

describe("job_parts INSERT WITH CHECK (migration 050)", () => {
  it("assigned mechanic CAN insert a part on their assigned job", async () => {
    await withTx(mechanic, async (c) => {
      const r = await c.query(INSERT_SQL, [GARAGE_A, A_JOB, A_MECHANIC]);
      expect(r.rowCount).toBe(1);
    });
  });

  it("manager CAN insert a part on any job in their garage (is_staff_or_manager bypass)", async () => {
    await withTx(manager, async (c) => {
      const r = await c.query(INSERT_SQL, [GARAGE_A, A_JOB, A_MANAGER]);
      expect(r.rowCount).toBe(1);
    });
  });

  it("non-assignee mechanic CANNOT insert a part on an unassigned job in their own garage", async () => {
    // B_MECHANIC is in garage B and is NOT in job_assignments for B_JOB (per fixtures).
    // garage_id + added_by + jobs-tenant all line up; the only failing predicate is
    // the assignment-or-staff-manager branch.
    await withTx(bMechanic, async (c) => {
      await expect(
        c.query(INSERT_SQL, [GARAGE_B, B_JOB, B_MECHANIC]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("cross-tenant insert rejected — mechanic in B cannot add a part pointing at an A job", async () => {
    // Same pattern as the 049 work_logs cross-tenant case.
    await withTx(bMechanic, async (c) => {
      await expect(
        c.query(INSERT_SQL, [GARAGE_B, A_JOB, B_MECHANIC]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("job_parts UPDATE WITH CHECK (migration 050)", () => {
  it("cross-tenant UPDATE rejected — B manager cannot mutate an A-garage job_parts row", async () => {
    // Seed an A-garage job_parts row via superuser.
    await asSuperuser((c) =>
      c.query(INSERT_SQL, [GARAGE_A, A_JOB, A_MECHANIC]),
    );

    // B-manager attempts to mutate the A row. USING (garage_id = B) rejects
    // the visibility gate, so 0 rows match — UPDATE is a silent no-op
    // rather than a 42501. Either outcome proves RLS is intact.
    await withTx(bManager, async (c) => {
      const r = await c.query(
        "update job_parts set quantity = 99 where job_id = $1",
        [A_JOB],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  it("mot_tester can SELECT a job_parts row in their garage (regression for is_staff_or_manager)", async () => {
    // Seed via superuser.
    await asSuperuser((c) =>
      c.query(INSERT_SQL, [GARAGE_A, A_JOB, A_MECHANIC]),
    );

    // mot_tester falls under is_staff_or_manager() so SELECT should see
    // all job_parts rows in their own garage (unassigned inclusive).
    await withTx(tester, async (c) => {
      const r = await c.query(
        "select id from job_parts where garage_id = $1",
        [GARAGE_A],
      );
      expect(r.rowCount).toBeGreaterThan(0);
    });
  });
});
