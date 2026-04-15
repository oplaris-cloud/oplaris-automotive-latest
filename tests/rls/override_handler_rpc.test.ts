/**
 * P53 — override_job_handler RPC tests.
 *
 * Covers manager-only role gate, multi-tenant isolation, target-role
 * validation, running-timer auto-stop, open-pass-back close-out, and the
 * audit_log write. Mirrors the shape of passback_rpcs.test.ts so the
 * RLS harness stays consistent across P51/P53.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asSuperuser, pool, withTx } from "./db";
import {
  A_JOB,
  A_MANAGER,
  A_MECHANIC,
  A_TESTER,
  A_CUSTOMER,
  A_VEHICLE,
  B_JOB,
  B_MANAGER,
  GARAGE_A,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

beforeAll(setupFixtures);
afterAll(async () => {
  await tearDownFixtures();
  await pool.end();
});

// Most cases start from the "mechanic is currently on the job" state so
// the override has something to flip + a non-empty assignees list to
// remove from. Tests that need a different starting state set it up
// themselves inside the test body.
beforeEach(async () => {
  await asSuperuser(async (c) => {
    await c.query(
      `update jobs set "current_role" = 'mechanic'::private.staff_role,
                       service = 'mot',
                       status = 'in_diagnosis'
         where id in ($1, $2)`,
      [A_JOB, B_JOB],
    );
    await c.query(`delete from job_passbacks where job_id in ($1, $2)`, [
      A_JOB,
      B_JOB,
    ]);
    await c.query(`delete from work_logs where job_id in ($1, $2)`, [
      A_JOB,
      B_JOB,
    ]);
    await c.query(
      `delete from audit_log where action = 'job_handler_override'
         and target_id in ($1, $2)`,
      [A_JOB, B_JOB],
    );
    // Mechanic A is on the job (seeded by fixtures) — make sure tests
    // that need them assigned start from a clean baseline.
    await c.query(
      `insert into job_assignments (job_id, staff_id, garage_id)
         values ($1, $2, $3) on conflict do nothing`,
      [A_JOB, A_MECHANIC, GARAGE_A],
    );
  });
});

const tester = { sub: A_TESTER, garage_id: GARAGE_A, role: "mot_tester" as const };
const mechanic = {
  sub: A_MECHANIC,
  garage_id: GARAGE_A,
  role: "mechanic" as const,
};
const manager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const crossManager = {
  sub: B_MANAGER,
  garage_id: "00000000-0000-0000-0000-00000000b001",
  role: "manager" as const,
};

describe("override_job_handler — role gate", () => {
  it("non-manager (mot_tester) caller is rejected with 42501", async () => {
    await withTx(tester, async (c) => {
      await expect(
        c.query(
          `select public.override_job_handler(
             $1::uuid, 'mot_tester'::private.staff_role, '{}'::uuid[], null::uuid, null::text)`,
          [A_JOB],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("non-manager (mechanic) caller is rejected with 42501", async () => {
    await withTx(mechanic, async (c) => {
      await expect(
        c.query(
          `select public.override_job_handler(
             $1::uuid, 'mot_tester'::private.staff_role, '{}'::uuid[], null::uuid, null::text)`,
          [A_JOB],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("override_job_handler — multi-tenant", () => {
  it("manager in garage A overriding a job in garage B is rejected with 42501", async () => {
    await withTx(manager, async (c) => {
      await expect(
        c.query(
          `select public.override_job_handler(
             $1::uuid, 'mot_tester'::private.staff_role, '{}'::uuid[], null::uuid, null::text)`,
          [B_JOB],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("cross-tenant manager cannot touch garage A's job either", async () => {
    await withTx(crossManager, async (c) => {
      await expect(
        c.query(
          `select public.override_job_handler(
             $1::uuid, 'mot_tester'::private.staff_role, '{}'::uuid[], null::uuid, null::text)`,
          [A_JOB],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("override_job_handler — target-role validation", () => {
  it("p_assign_staff_id must hold the target role, else raises P0001", async () => {
    // Anna is mechanic-only in the fixture. Trying to flip to mot_tester
    // AND assign Anna must fail because she doesn't hold mot_tester.
    await withTx(manager, async (c) => {
      await expect(
        c.query(
          `select public.override_job_handler(
             $1::uuid, 'mot_tester'::private.staff_role, '{}'::uuid[], $2::uuid, null::text)`,
          [A_JOB, A_MECHANIC],
        ),
      ).rejects.toMatchObject({ code: "P0001" });
    });
  });

  it("p_assign_staff_id with a matching role succeeds (flip + assign)", async () => {
    // Adam is mot_tester. Flip role to mot_tester + assign Adam; expect
    // current_role to flip, an assignment row to exist, and a
    // job_passbacks + audit_log entry written.
    await withTx(manager, async (c) => {
      const r = await c.query(
        `select public.override_job_handler(
           $1::uuid, 'mot_tester'::private.staff_role, $2::uuid[], $3::uuid, 'tester cover'::text) as id`,
        [A_JOB, [A_MECHANIC], A_TESTER],
      );
      expect(r.rows[0]?.id).toBeTruthy();

      const job = await c.query(
        `select "current_role"::text as cr from jobs where id = $1`,
        [A_JOB],
      );
      expect(job.rows[0]?.cr).toBe("mot_tester");

      const assign = await c.query(
        `select 1 from job_assignments where job_id = $1 and staff_id = $2`,
        [A_JOB, A_TESTER],
      );
      expect(assign.rowCount).toBe(1);

      const removed = await c.query(
        `select 1 from job_assignments where job_id = $1 and staff_id = $2`,
        [A_JOB, A_MECHANIC],
      );
      expect(removed.rowCount).toBe(0);

      const event = await c.query(
        `select from_role::text as f, to_role::text as t, note
           from job_passbacks where job_id = $1`,
        [A_JOB],
      );
      expect(event.rows[0]).toMatchObject({
        f: "mechanic",
        t: "mot_tester",
        note: "tester cover",
      });

      const log = await c.query(
        `select action, actor_staff_id, target_id,
                meta->>'from_role' as from_role,
                meta->>'to_role' as to_role,
                meta->>'note' as note
           from audit_log
          where action = 'job_handler_override' and target_id = $1`,
        [A_JOB],
      );
      expect(log.rows[0]).toMatchObject({
        action: "job_handler_override",
        actor_staff_id: A_MANAGER,
        target_id: A_JOB,
        from_role: "mechanic",
        to_role: "mot_tester",
        note: "tester cover",
      });
    });
  });
});

describe("override_job_handler — running-timer auto-stop", () => {
  it("auto-stops any open work_logs row for a removed staff", async () => {
    // Seed a running work_log for Anna on job A.
    await asSuperuser(async (c) => {
      await c.query(
        `insert into work_logs (job_id, staff_id, garage_id, task_type, started_at)
           values ($1, $2, $3, 'diagnosis', now() - interval '30 minutes')`,
        [A_JOB, A_MECHANIC, GARAGE_A],
      );
    });

    await withTx(manager, async (c) => {
      await c.query(
        `select public.override_job_handler(
           $1::uuid, 'mot_tester'::private.staff_role, $2::uuid[], null::uuid, null::text)`,
        [A_JOB, [A_MECHANIC]],
      );

      const logs = await c.query(
        `select ended_at from work_logs
           where job_id = $1 and staff_id = $2`,
        [A_JOB, A_MECHANIC],
      );
      // Both (a) inside the same tx — the update is visible.
      expect(logs.rows[0]?.ended_at).toBeTruthy();
    });
  });
});

describe("override_job_handler — pass-back close-out", () => {
  it("stamps returned_at on any open job_passbacks row for the job", async () => {
    // Seed an open pass-back — pretend a tester passed to mechanic
    // earlier and the mechanic never returned it.
    await asSuperuser(async (c) => {
      await c.query(
        `insert into job_passbacks
           (garage_id, job_id, from_role, to_role, from_staff_id, items, note)
         values ($1, $2,
                 'mot_tester'::private.staff_role,
                 'mechanic'::private.staff_role,
                 $3, '[]'::jsonb, 'earlier handoff')`,
        [GARAGE_A, A_JOB, A_TESTER],
      );
    });

    await withTx(manager, async (c) => {
      await c.query(
        `select public.override_job_handler(
           $1::uuid, 'mot_tester'::private.staff_role, '{}'::uuid[], null::uuid, null::text)`,
        [A_JOB],
      );

      const old = await c.query(
        `select returned_at from job_passbacks
           where job_id = $1 and note = 'earlier handoff'`,
        [A_JOB],
      );
      expect(old.rows[0]?.returned_at).toBeTruthy();

      // And a fresh override event was appended.
      const fresh = await c.query(
        `select from_role::text as f, to_role::text as t
           from job_passbacks
           where job_id = $1 and note is null
           order by created_at desc limit 1`,
        [A_JOB],
      );
      expect(fresh.rows[0]).toMatchObject({ f: "mechanic", t: "mot_tester" });
    });
  });
});

describe("override_job_handler — same-role override", () => {
  it("skips the job_passbacks insert when role doesn't change but still audits", async () => {
    // Override to the current role (mechanic → mechanic). This is what
    // happens when a manager opens the palette to reassign a person
    // without flipping roles. The CHECK constraint
    // job_passbacks_roles_differ would reject a same-role event row, so
    // the RPC short-circuits and returns null — but the audit_log row
    // still lands.
    await withTx(manager, async (c) => {
      const r = await c.query(
        `select public.override_job_handler(
           $1::uuid, 'mechanic'::private.staff_role, '{}'::uuid[], null::uuid, null::text) as id`,
        [A_JOB],
      );
      expect(r.rows[0]?.id).toBeNull();

      const events = await c.query(
        `select count(*)::int as n from job_passbacks where job_id = $1`,
        [A_JOB],
      );
      expect(events.rows[0]?.n).toBe(0);

      const log = await c.query(
        `select meta->>'role_change' as role_change
           from audit_log
          where action = 'job_handler_override' and target_id = $1`,
        [A_JOB],
      );
      expect(log.rows[0]?.role_change).toBe("false");
    });
  });
});

// Keep lint quiet about unused fixture imports.
void A_CUSTOMER;
void A_VEHICLE;
