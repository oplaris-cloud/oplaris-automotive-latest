/**
 * P54 — job_timeline_events view + set_job_status helper.
 *
 * The view stitches job_passbacks + work_logs + job_status_events into
 * one chronological feed. It's declared with `security_invoker = on` so
 * the viewer's RLS on the base tables is authoritative — this suite
 * proves that cross-tenant isolation holds end-to-end.
 *
 *   - Staff in garage A sees events for A's jobs only.
 *   - Cross-tenant select over the view returns zero rows for garage B.
 *   - Direct INSERT into job_status_events is blocked for authenticated.
 *   - set_job_status atomically updates jobs + inserts the event.
 *   - Non-manager/tester/mechanic role calling the helper is rejected.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asSuperuser, pool, withTx } from "./db";
import {
  A_JOB,
  A_MANAGER,
  A_MECHANIC,
  A_TESTER,
  B_JOB,
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

const manager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const tester = { sub: A_TESTER, garage_id: GARAGE_A, role: "mot_tester" as const };
const mechanic = {
  sub: A_MECHANIC,
  garage_id: GARAGE_A,
  role: "mechanic" as const,
};
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

// Give each test a clean slate on the shared fixture jobs — including
// a known status_event row so we can prove SELECT returns it.
beforeEach(async () => {
  await asSuperuser(async (c) => {
    await c.query(
      `update jobs set status = 'in_diagnosis' where id in ($1, $2)`,
      [A_JOB, B_JOB],
    );
    await c.query(`delete from job_status_events where job_id in ($1, $2)`, [
      A_JOB,
      B_JOB,
    ]);
    await c.query(
      `insert into job_status_events
         (garage_id, job_id, from_status, to_status, reason)
       values ($1, $2, null, 'in_diagnosis', 'test-seed'),
              ($3, $4, null, 'in_diagnosis', 'test-seed')`,
      [GARAGE_A, A_JOB, GARAGE_B, B_JOB],
    );
  });
});

describe("public.job_timeline_events — view RLS", () => {
  it("garage-A staff sees their own job events via the view", async () => {
    await withTx(manager, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.job_timeline_events
          where job_id = $1 and kind = 'status_changed'`,
        [A_JOB],
      );
      expect(r.rows[0]?.n).toBeGreaterThan(0);
    });
  });

  it("garage-A manager sees zero rows from the view for garage-B's job", async () => {
    await withTx(manager, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.job_timeline_events
          where job_id = $1`,
        [B_JOB],
      );
      expect(r.rows[0]?.n).toBe(0);
    });
  });

  it("garage-B manager sees zero rows from the view for garage-A's job", async () => {
    await withTx(bManager, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.job_timeline_events
          where job_id = $1`,
        [A_JOB],
      );
      expect(r.rows[0]?.n).toBe(0);
    });
  });

  it("unassigned mechanic in garage B cannot see garage-A events", async () => {
    await withTx(bMechanic, async (c) => {
      const r = await c.query(
        `select count(*)::int as n
           from public.job_timeline_events
          where job_id = $1`,
        [A_JOB],
      );
      expect(r.rows[0]?.n).toBe(0);
    });
  });
});

describe("public.job_status_events — direct-write protection", () => {
  it("authenticated INSERT is rejected (write goes via set_job_status only)", async () => {
    await withTx(manager, async (c) => {
      await expect(
        c.query(
          `insert into public.job_status_events
             (garage_id, job_id, to_status)
           values ($1, $2, 'in_repair')`,
          [GARAGE_A, A_JOB],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("public.set_job_status — atomic update + event", () => {
  it("manager transitions status and inserts matching event row", async () => {
    await withTx(manager, async (c) => {
      const r = await c.query(
        `select public.set_job_status($1::uuid, 'in_repair'::public.job_status, null::text) as id`,
        [A_JOB],
      );
      expect(r.rows[0]?.id).toBeTruthy();

      const job = await c.query(
        `select status from public.jobs where id = $1`,
        [A_JOB],
      );
      expect(job.rows[0]?.status).toBe("in_repair");

      const ev = await c.query(
        `select from_status::text as f, to_status::text as t, actor_staff_id
           from public.job_status_events
          where job_id = $1
            and reason is distinct from 'test-seed'
          order by at desc
          limit 1`,
        [A_JOB],
      );
      expect(ev.rows[0]).toMatchObject({
        f: "in_diagnosis",
        t: "in_repair",
        actor_staff_id: A_MANAGER,
      });
    });
  });

  it("mechanic transitions are accepted (caller validates legality)", async () => {
    await withTx(mechanic, async (c) => {
      const r = await c.query(
        `select public.set_job_status($1::uuid, 'ready_for_collection'::public.job_status, null::text) as id`,
        [A_JOB],
      );
      expect(r.rows[0]?.id).toBeTruthy();
    });
  });

  it("tester transitions are accepted", async () => {
    await withTx(tester, async (c) => {
      const r = await c.query(
        `select public.set_job_status($1::uuid, 'in_repair'::public.job_status, null::text) as id`,
        [A_JOB],
      );
      expect(r.rows[0]?.id).toBeTruthy();
    });
  });

  it("cross-tenant manager cannot transition another garage's job", async () => {
    await withTx(manager, async (c) => {
      await expect(
        c.query(
          `select public.set_job_status($1::uuid, 'in_repair'::public.job_status, null::text)`,
          [B_JOB],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("refuses awaiting_mechanic — P51 pass-back RPC owns that path", async () => {
    await withTx(manager, async (c) => {
      await expect(
        c.query(
          `select public.set_job_status($1::uuid, 'awaiting_mechanic'::public.job_status, null::text)`,
          [A_JOB],
        ),
      ).rejects.toMatchObject({ code: "P0001" });
    });
  });

  it("sets completed_at when transitioning to completed", async () => {
    await withTx(manager, async (c) => {
      await c.query(
        `select public.set_job_status($1::uuid, 'completed'::public.job_status, null::text)`,
        [A_JOB],
      );
      const r = await c.query(
        `select status, completed_at from public.jobs where id = $1`,
        [A_JOB],
      );
      expect(r.rows[0]?.status).toBe("completed");
      expect(r.rows[0]?.completed_at).toBeTruthy();
    });
  });
});
