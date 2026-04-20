/**
 * Job-specific RLS + RPC tests:
 *   - `create_job` RPC generates correct job number and respects garage_id
 *   - Mechanics cannot call `create_job` (INSERT policy is manager-only)
 *   - Status transitions blocked by state machine (tested in unit tests)
 *   - Bay board query uses indexes (manual EXPLAIN, not automated here)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import {
  A_CUSTOMER,
  A_JOB,
  A_MANAGER,
  A_MECHANIC,
  A_TESTER,
  A_VEHICLE,
  GARAGE_A,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

beforeAll(setupFixtures);
afterAll(async () => {
  await tearDownFixtures();
  await pool.end();
});

const manager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const tester = { sub: A_TESTER, garage_id: GARAGE_A, role: "mot_tester" as const };
const mechanic = { sub: A_MECHANIC, garage_id: GARAGE_A, role: "mechanic" as const };

describe("create_job RPC", () => {
  it("manager can create a job via RPC", async () => {
    await withTx(manager, async (c) => {
      const r = await c.query(
        `select public.create_job($1, $2, 'test job', 'manager', null, null) as job_id`,
        [A_CUSTOMER, A_VEHICLE],
      );
      expect(r.rows[0]?.job_id).toBeTruthy();

      // Verify the job was created with a correct job number
      const job = await c.query("select job_number, garage_id, status from jobs where id = $1", [
        r.rows[0].job_id,
      ]);
      expect(job.rows[0]?.garage_id).toBe(GARAGE_A);
      // Migration 029 retired the 'draft' / 'booked' statuses; a freshly
      // created job now starts in 'checked_in'. This assertion was not
      // updated at the time.
      expect(job.rows[0]?.status).toBe("checked_in");
      expect(job.rows[0]?.job_number).toMatch(/^DUD-\d{4}-\d{5}$/);
    });
  });

  it("mechanic cannot create a job (no INSERT policy)", async () => {
    await withTx(mechanic, async (c) => {
      await expect(
        c.query(
          `select public.create_job($1, $2, 'evil job', 'manager', null, null)`,
          [A_CUSTOMER, A_VEHICLE],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("job status updates", () => {
  it("mot_tester can update status on a visible job", async () => {
    await withTx(tester, async (c) => {
      // A_JOB is 'in_repair' from fixtures
      const r = await c.query(
        "update jobs set status = 'awaiting_parts' where id = $1 returning status",
        [A_JOB],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0]?.status).toBe("awaiting_parts");
    });
  });

  it("mechanic can update status on their assigned job", async () => {
    await withTx(mechanic, async (c) => {
      // A_MECHANIC is assigned to A_JOB
      const r = await c.query(
        "update jobs set status = 'awaiting_parts' where id = $1 returning status",
        [A_JOB],
      );
      expect(r.rowCount).toBe(1);
    });
  });
});

describe("bay assignment", () => {
  it("manager can assign a bay to a job", async () => {
    await withTx(manager, async (c) => {
      const bays = await c.query(
        "select id from bays where garage_id = $1 limit 1",
        [GARAGE_A],
      );
      const bayId = bays.rows[0]?.id;
      expect(bayId).toBeTruthy();

      const r = await c.query(
        "update jobs set bay_id = $1 where id = $2 returning bay_id",
        [bayId, A_JOB],
      );
      expect(r.rows[0]?.bay_id).toBe(bayId);
    });
  });
});
