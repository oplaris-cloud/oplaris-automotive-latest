/**
 * P55 — pause_work_log / resume_work_log / complete_work_log RPC tests.
 *
 * State machine:
 *   - pause: requires ended_at IS NULL + paused_at IS NULL
 *   - resume: requires ended_at IS NULL + paused_at IS NOT NULL
 *   - complete: idempotent; if paused, folds the in-progress pause
 *     into paused_seconds_total before stamping ended_at.
 *
 * Auth: owner-or-manager in the same garage. Cross-tenant + foreign-owner
 * calls raise 42501.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asSuperuser, pool, withTx } from "./db";
import {
  A_JOB,
  A_MANAGER,
  A_MECHANIC,
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

const mechanic = {
  sub: A_MECHANIC,
  garage_id: GARAGE_A,
  role: "mechanic" as const,
};
const manager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
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

// Fresh running work_log on A_JOB for mechanic A each test, plus a
// parallel one owned by the B mechanic on the B garage so cross-
// tenant cases have a real target.
let aLogId!: string;
let bLogId!: string;

beforeEach(async () => {
  await asSuperuser(async (c) => {
    await c.query(`delete from work_logs where job_id in ($1, $2)`, [
      A_JOB,
      "00000000-0000-0000-0000-0000000b0b01",
    ]);
    const a = await c.query(
      `insert into work_logs (garage_id, job_id, staff_id, task_type, started_at)
       values ($1, $2, $3, 'diagnosis', now() - interval '2 minutes')
       returning id`,
      [GARAGE_A, A_JOB, A_MECHANIC],
    );
    aLogId = a.rows[0]!.id;
    const b = await c.query(
      `insert into work_logs (garage_id, job_id, staff_id, task_type, started_at)
       values ($1, $2, $3, 'diagnosis', now() - interval '2 minutes')
       returning id`,
      [GARAGE_B, "00000000-0000-0000-0000-0000000b0b01", B_MECHANIC],
    );
    bLogId = b.rows[0]!.id;
  });
});

describe("pause_work_log", () => {
  it("owner can pause their own running log", async () => {
    await withTx(mechanic, async (c) => {
      await c.query(`select public.pause_work_log($1::uuid)`, [aLogId]);
      const r = await c.query(
        `select paused_at, pause_count from work_logs where id = $1`,
        [aLogId],
      );
      expect(r.rows[0]?.paused_at).toBeTruthy();
      expect(r.rows[0]?.pause_count).toBe(1);
    });
  });

  it("manager can pause another staff's log in the same garage", async () => {
    await withTx(manager, async (c) => {
      await c.query(`select public.pause_work_log($1::uuid)`, [aLogId]);
      const r = await c.query(
        `select paused_at from work_logs where id = $1`,
        [aLogId],
      );
      expect(r.rows[0]?.paused_at).toBeTruthy();
    });
  });

  it("cross-tenant manager is rejected (42501)", async () => {
    await withTx(bManager, async (c) => {
      await expect(
        c.query(`select public.pause_work_log($1::uuid)`, [aLogId]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("cross-tenant mechanic is rejected (42501)", async () => {
    await withTx(bMechanic, async (c) => {
      await expect(
        c.query(`select public.pause_work_log($1::uuid)`, [aLogId]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("double-pause raises P0001", async () => {
    await withTx(mechanic, async (c) => {
      await c.query(`select public.pause_work_log($1::uuid)`, [aLogId]);
      await expect(
        c.query(`select public.pause_work_log($1::uuid)`, [aLogId]),
      ).rejects.toMatchObject({ code: "P0001" });
    });
  });

  it("pausing an already-ended log raises P0001", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `update work_logs set ended_at = now() where id = $1`,
        [aLogId],
      );
    });
    await withTx(mechanic, async (c) => {
      await expect(
        c.query(`select public.pause_work_log($1::uuid)`, [aLogId]),
      ).rejects.toMatchObject({ code: "P0001" });
    });
  });
});

describe("resume_work_log", () => {
  it("resume folds the pause interval into paused_seconds_total", async () => {
    await asSuperuser(async (c) => {
      // Stash a fake pause 5 seconds in the past so the resume
      // contributes a measurable delta (CI clocks can be fuzzy at 1s).
      await c.query(
        `update work_logs
            set paused_at = now() - interval '5 seconds',
                pause_count = 1
          where id = $1`,
        [aLogId],
      );
    });
    await withTx(mechanic, async (c) => {
      await c.query(`select public.resume_work_log($1::uuid)`, [aLogId]);
      const r = await c.query(
        `select paused_at, paused_seconds_total from work_logs where id = $1`,
        [aLogId],
      );
      expect(r.rows[0]?.paused_at).toBeNull();
      expect(r.rows[0]?.paused_seconds_total).toBeGreaterThanOrEqual(4);
    });
  });

  it("resuming a non-paused log raises P0001", async () => {
    await withTx(mechanic, async (c) => {
      await expect(
        c.query(`select public.resume_work_log($1::uuid)`, [aLogId]),
      ).rejects.toMatchObject({ code: "P0001" });
    });
  });

  it("cross-tenant is rejected (42501)", async () => {
    await withTx(bManager, async (c) => {
      await expect(
        c.query(`select public.resume_work_log($1::uuid)`, [aLogId]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("complete_work_log", () => {
  it("idempotent on an already-ended log (no-op, no error)", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `update work_logs set ended_at = now() where id = $1`,
        [aLogId],
      );
    });
    await withTx(mechanic, async (c) => {
      await c.query(`select public.complete_work_log($1::uuid)`, [aLogId]);
      const r = await c.query(
        `select ended_at from work_logs where id = $1`,
        [aLogId],
      );
      expect(r.rows[0]?.ended_at).toBeTruthy();
    });
  });

  it("stamps ended_at and leaves paused_seconds_total at 0 when never paused", async () => {
    await withTx(mechanic, async (c) => {
      await c.query(`select public.complete_work_log($1::uuid)`, [aLogId]);
      const r = await c.query(
        `select ended_at, paused_seconds_total, duration_seconds
           from work_logs where id = $1`,
        [aLogId],
      );
      expect(r.rows[0]?.ended_at).toBeTruthy();
      expect(r.rows[0]?.paused_seconds_total).toBe(0);
      expect(r.rows[0]?.duration_seconds).toBeGreaterThanOrEqual(0);
    });
  });

  it("folds an in-progress pause into totals before closing", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `update work_logs
            set paused_at = now() - interval '5 seconds',
                pause_count = 1
          where id = $1`,
        [aLogId],
      );
    });
    await withTx(mechanic, async (c) => {
      await c.query(`select public.complete_work_log($1::uuid)`, [aLogId]);
      const r = await c.query(
        `select paused_at, paused_seconds_total, ended_at
           from work_logs where id = $1`,
        [aLogId],
      );
      expect(r.rows[0]?.paused_at).toBeNull();
      expect(r.rows[0]?.paused_seconds_total).toBeGreaterThanOrEqual(4);
      expect(r.rows[0]?.ended_at).toBeTruthy();
    });
  });

  it("cross-tenant is rejected (42501)", async () => {
    await withTx(bMechanic, async (c) => {
      await expect(
        c.query(`select public.complete_work_log($1::uuid)`, [aLogId]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("generated duration_seconds column respects pauses", () => {
  it("deducts paused_seconds_total from wall-clock span", async () => {
    // Simulate a 30s session with 12s of pauses. Paused_seconds_total
    // directly. Duration should be 18.
    await asSuperuser(async (c) => {
      await c.query(
        `update work_logs
            set started_at           = now() - interval '30 seconds',
                ended_at             = now(),
                paused_seconds_total = 12,
                pause_count          = 1
          where id = $1`,
        [aLogId],
      );
      const r = await c.query(
        `select duration_seconds from work_logs where id = $1`,
        [aLogId],
      );
      // Allow for CI clock fuzz: wall-span is 30s ± ε; duration is
      // wall-span - 12s, so 17..19s inclusive.
      const d = r.rows[0]?.duration_seconds as number;
      expect(d).toBeGreaterThanOrEqual(17);
      expect(d).toBeLessThanOrEqual(19);
    });
  });
});

// Silence the unused B log in this suite — the other tests read it by
// id, and CI's linter scans this file.
void bLogId;
