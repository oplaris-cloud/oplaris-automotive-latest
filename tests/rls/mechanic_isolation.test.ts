/**
 * Mechanic isolation overlay: a mechanic must only see jobs they're
 * assigned to. Managers and MOT testers see everything in their garage.
 *
 * Anna (A_MECHANIC) is assigned to A_JOB. Bob (B_MECHANIC) is assigned to
 * NOTHING in his garage, so he should see zero jobs even though they exist.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import {
  A_JOB,
  A_MANAGER,
  A_MECHANIC,
  A_TESTER,
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

describe("mechanic job visibility", () => {
  it("assigned mechanic sees their job", async () => {
    await withTx(
      { sub: A_MECHANIC, garage_id: GARAGE_A, role: "mechanic" },
      async (c) => {
        const r = await c.query("select id from jobs");
        expect(r.rows.map((row) => row.id)).toContain(A_JOB);
      },
    );
  });

  it("unassigned mechanic sees zero jobs in their own garage", async () => {
    await withTx(
      { sub: B_MECHANIC, garage_id: GARAGE_B, role: "mechanic" },
      async (c) => {
        const r = await c.query("select id from jobs");
        expect(r.rowCount).toBe(0);
      },
    );
  });

  it("manager sees all jobs in their garage", async () => {
    await withTx(
      { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" },
      async (c) => {
        const r = await c.query("select id from jobs");
        expect(r.rows.map((row) => row.id)).toContain(A_JOB);
      },
    );
  });

  it("mot_tester sees all jobs in their garage (no mechanic overlay)", async () => {
    await withTx(
      { sub: A_TESTER, garage_id: GARAGE_A, role: "mot_tester" },
      async (c) => {
        const r = await c.query("select id from jobs");
        expect(r.rows.map((row) => row.id)).toContain(A_JOB);
      },
    );
  });
});

describe("mechanic CANNOT create jobs", () => {
  it("mechanic INSERT on jobs is denied (manager-only policy)", async () => {
    await withTx(
      { sub: A_MECHANIC, garage_id: GARAGE_A, role: "mechanic" },
      async (c) => {
        await expect(
          c.query(
            `insert into jobs (garage_id, job_number, customer_id, vehicle_id)
             select garage_id, 'NOPE-001', customer_id, vehicle_id from jobs limit 1`,
          ),
        ).rejects.toMatchObject({ code: "42501" });
      },
    );
  });
});

describe("work_logs are mechanic-bound", () => {
  it("mechanic CANNOT log time against a job they're not assigned to", async () => {
    await withTx(
      { sub: B_MECHANIC, garage_id: GARAGE_B, role: "mechanic" },
      async (c) => {
        // Even though B_MECHANIC is in garage B, they have no assignment.
        await expect(
          c.query(
            `insert into work_logs (garage_id, job_id, staff_id, task_type, started_at)
             values ($1, $2, $3, 'diagnosis', now())`,
            [GARAGE_B, A_JOB /* wrong-tenant on top */, B_MECHANIC],
          ),
        ).rejects.toMatchObject({ code: "42501" });
      },
    );
  });

  it("assigned mechanic CAN start a work log on their job", async () => {
    await withTx(
      { sub: A_MECHANIC, garage_id: GARAGE_A, role: "mechanic" },
      async (c) => {
        const r = await c.query(
          `insert into work_logs (garage_id, job_id, staff_id, task_type, started_at)
           values ($1, $2, $3, 'diagnosis', now()) returning id`,
          [GARAGE_A, A_JOB, A_MECHANIC],
        );
        expect(r.rowCount).toBe(1);
      },
    );
  });
});
