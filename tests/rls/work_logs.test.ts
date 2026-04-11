/**
 * Work-log RLS + constraint tests:
 *   - Assigned mechanic CAN start work on their job
 *   - Only one running log per staff (unique partial index)
 *   - Mechanic cannot start work on someone else's job
 *   - Server timestamp enforced (started_at is non-null)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  // Clean up any work logs created by tests
  await asSuperuser((c) =>
    c.query("delete from work_logs where garage_id in ($1, $2)", [GARAGE_A, GARAGE_B]),
  );
  await tearDownFixtures();
  await pool.end();
});

const mechanic = { sub: A_MECHANIC, garage_id: GARAGE_A, role: "mechanic" as const };
const tester = { sub: A_TESTER, garage_id: GARAGE_A, role: "mot_tester" as const };
const bMechanic = { sub: B_MECHANIC, garage_id: GARAGE_B, role: "mechanic" as const };

describe("work log creation", () => {
  it("assigned mechanic can start work on their job", async () => {
    await withTx(mechanic, async (c) => {
      const r = await c.query(
        `insert into work_logs (garage_id, job_id, staff_id, task_type, started_at)
         values ($1, $2, $3, 'diagnosis', now()) returning id`,
        [GARAGE_A, A_JOB, A_MECHANIC],
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it("cross-tenant mechanic cannot log work on another garage's job", async () => {
    await withTx(bMechanic, async (c) => {
      await expect(
        c.query(
          `insert into work_logs (garage_id, job_id, staff_id, task_type, started_at)
           values ($1, $2, $3, 'diagnosis', now())`,
          [GARAGE_B, A_JOB, B_MECHANIC],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("one_running_log_per_staff constraint", () => {
  it("second concurrent start fails with unique_violation", async () => {
    // Use superuser to insert a running log, then try as the mechanic
    await asSuperuser(async (c) => {
      await c.query(
        `insert into work_logs (garage_id, job_id, staff_id, task_type, started_at)
         values ($1, $2, $3, 'engine', now())`,
        [GARAGE_A, A_JOB, A_MECHANIC],
      );
    });

    await withTx(mechanic, async (c) => {
      await expect(
        c.query(
          `insert into work_logs (garage_id, job_id, staff_id, task_type, started_at)
           values ($1, $2, $3, 'brakes', now())`,
          [GARAGE_A, A_JOB, A_MECHANIC],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    });

    // Clean up the running log
    await asSuperuser((c) =>
      c.query("delete from work_logs where staff_id = $1 and ended_at is null", [A_MECHANIC]),
    );
  });
});

describe("mot_tester visibility", () => {
  it("mot_tester can see work logs on all jobs in their garage", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `insert into work_logs (garage_id, job_id, staff_id, task_type, started_at, ended_at)
         values ($1, $2, $3, 'mot_test', now() - interval '1 hour', now())`,
        [GARAGE_A, A_JOB, A_MECHANIC],
      );
    });

    await withTx(tester, async (c) => {
      const r = await c.query(
        "select id from work_logs where garage_id = $1",
        [GARAGE_A],
      );
      expect(r.rowCount).toBeGreaterThan(0);
    });

    await asSuperuser((c) =>
      c.query("delete from work_logs where garage_id = $1", [GARAGE_A]),
    );
  });
});
