/**
 * P3.1 — RLS guarantees behind the manager-only /app/staff live-status
 * board. The page issues two parallel SELECTs (staff + work_logs) for
 * the current garage; both must respect tenant isolation, and the
 * SELECT pattern itself must continue to work for a same-garage
 * manager (regression guard against an over-tightened policy).
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
    c.query("delete from work_logs where garage_id in ($1, $2)", [
      GARAGE_A,
      GARAGE_B,
    ]),
  );
  await tearDownFixtures();
  await pool.end();
});

const aManager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const bManager = { sub: B_MANAGER, garage_id: GARAGE_B, role: "manager" as const };

describe("/app/staff visibility", () => {
  it("manager sees their own garage's staff joined to running work_logs", async () => {
    // Seed a running work_log for mechanic A so the live-status query
    // has something to join.
    await asSuperuser(async (c) => {
      await c.query(
        `insert into work_logs (garage_id, job_id, staff_id, task_type, started_at)
         values ($1, $2, $3, 'engine', now())`,
        [GARAGE_A, A_JOB, A_MECHANIC],
      );
    });

    try {
      await withTx(aManager, async (c) => {
        // Mirrors getStaffWithLiveStatus(): pull active staff + the
        // running-log shape the page joins on.
        const staff = await c.query(
          "select id, garage_id from staff where garage_id = $1 and is_active = true",
          [GARAGE_A],
        );
        expect(staff.rowCount).toBeGreaterThan(0);
        expect(staff.rows.every((r) => r.garage_id === GARAGE_A)).toBe(true);

        const logs = await c.query(
          `select id, staff_id, garage_id from work_logs
            where garage_id = $1 and ended_at is null`,
          [GARAGE_A],
        );
        expect(logs.rowCount).toBe(1);
        expect(logs.rows[0].staff_id).toBe(A_MECHANIC);
      });
    } finally {
      await asSuperuser((c) =>
        c.query("delete from work_logs where staff_id = $1", [A_MECHANIC]),
      );
    }
  });

  it("cross-garage manager sees zero rows from the other garage's staff + work_logs", async () => {
    // Re-seed the running log so we can prove garage B's manager can't
    // see it.
    await asSuperuser(async (c) => {
      await c.query(
        `insert into work_logs (garage_id, job_id, staff_id, task_type, started_at)
         values ($1, $2, $3, 'engine', now())`,
        [GARAGE_A, A_JOB, A_MECHANIC],
      );
    });

    try {
      await withTx(bManager, async (c) => {
        const staff = await c.query(
          "select id from staff where garage_id = $1",
          [GARAGE_A],
        );
        expect(staff.rowCount).toBe(0);

        const logs = await c.query(
          "select id from work_logs where garage_id = $1",
          [GARAGE_A],
        );
        expect(logs.rowCount).toBe(0);
      });
    } finally {
      await asSuperuser((c) =>
        c.query("delete from work_logs where staff_id = $1", [A_MECHANIC]),
      );
    }
  });
});
