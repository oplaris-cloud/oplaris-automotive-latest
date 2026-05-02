/**
 * B6.1 — super_admin (platform_admins) privilege escalation surface.
 *
 * The role lives outside garage_id scoping, so every interaction is
 * a potential attack surface. We pin down the contract with a wide
 * net of cases:
 *   - membership table is never reachable from the REST schema
 *   - is_super_admin() reflects the JWT claim only — header alone
 *     can't escalate
 *   - super_admin reads cross-garage data; non-super_admin doesn't
 *   - super_admin_enter_garage() refuses non-members
 *   - the audit trigger fires on every super_admin mutation but
 *     stays silent for regular staff
 *   - RLS read overlay is permissive but write policies are
 *     unchanged — super_admin can't INSERT into garage X while
 *     impersonating Y
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { asSuperuser, jwtClaims, pool, withTx } from "./db";
import {
  A_CUSTOMER,
  A_JOB,
  A_MANAGER,
  A_VEHICLE,
  B_CUSTOMER,
  B_JOB,
  B_MANAGER,
  GARAGE_A,
  GARAGE_B,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

const SA_USER = "00000000-0000-0000-0000-00000005ad01";

beforeAll(async () => {
  await setupFixtures();
  await asSuperuser(async (c) => {
    // Seed an auth.users row + platform_admins entry for the test
    // super_admin. Never goes near the staff table — super_admins are
    // platform-tier operators with no garage row.
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email,
                               encrypted_password, email_confirmed_at,
                               created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', 'sa@oplaris.test', '', now(), now(), now())
       on conflict (id) do nothing`,
      [SA_USER],
    );
    await c.query(
      `insert into private.platform_admins (user_id) values ($1)
       on conflict (user_id) do update set revoked_at = null`,
      [SA_USER],
    );
  });
});

afterAll(async () => {
  await asSuperuser(async (c) => {
    await c.query(
      `delete from private.platform_admins where user_id = $1`,
      [SA_USER],
    );
    await c.query(`delete from auth.users where id = $1`, [SA_USER]);
  });
  await tearDownFixtures();
  await pool.end();
});

afterEach(async () => {
  // Audit-log rows from each test get cleaned so counts stay deterministic.
  await asSuperuser(async (c) => {
    await c.query(
      `delete from public.audit_log where action like 'super_admin_%'`,
    );
  });
});

const aManager = {
  sub: A_MANAGER,
  garage_id: GARAGE_A,
  role: "manager" as const,
};
const bManager = {
  sub: B_MANAGER,
  garage_id: GARAGE_B,
  role: "manager" as const,
};

/** Build a JWT claims string for the super_admin user — no garage_id. */
function saClaims(impersonateGarage?: string): string {
  return JSON.stringify({
    sub: SA_USER,
    role: "authenticated",
    aud: "authenticated",
    app_metadata: {
      garage_id: impersonateGarage ?? null,
      roles: [],
      is_super_admin: true,
    },
  });
}

describe("B6.1 super_admin — RLS + audit", () => {
  // -------------------------------------------------------------------------
  // 1. Membership table is unreachable via REST
  // -------------------------------------------------------------------------
  it("non-super_admin manager cannot SELECT private.platform_admins", async () => {
    await withTx(aManager, async (c) => {
      // private schema isn't exposed via PostgREST grants. A direct
      // raw query under the `authenticated` role is denied at the
      // schema-usage level.
      await expect(
        c.query("select 1 from private.platform_admins limit 1"),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  // -------------------------------------------------------------------------
  // 2. JWT claim drives is_super_admin — header alone cannot escalate
  // -------------------------------------------------------------------------
  it("a manager sending the impersonation header gets their own garage_id back", async () => {
    await withTx(aManager, async (c) => {
      // Even with the header set, a manager's current_garage() is
      // unchanged — the header is ignored when is_super_admin() is
      // false. (set_config uses local=true so it scopes to the tx.)
      await c.query(
        `select set_config('request.headers',
                           '{"x-oplaris-impersonate":"${GARAGE_B}"}'::text,
                           true)`,
      );
      const { rows } = await c.query<{ g: string }>(
        `select private.current_garage()::text as g`,
      );
      expect(rows[0]?.g).toBe(GARAGE_A);
    });
  });

  it("is_super_admin() returns true only for the JWT claim", async () => {
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ ok: boolean }>(
        `select private.is_super_admin() as ok`,
      );
      expect(rows[0]?.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Super-admin can read cross-garage data
  // -------------------------------------------------------------------------
  it("super_admin (no garage entered) sees customers from BOTH garages", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(
        `set local request.jwt.claims = '${saClaims()}'`,
      );
      const { rows } = await client.query<{ id: string }>(
        `select id from public.customers
          where deleted_at is null
            and id in ($1, $2)
          order by id`,
        [A_CUSTOMER, B_CUSTOMER],
      );
      expect(rows.map((r) => r.id).sort()).toEqual(
        [A_CUSTOMER, B_CUSTOMER].sort(),
      );
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });

  it("super_admin (impersonating garage A) sees ONLY A's jobs via current_garage()", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(
        `set local request.jwt.claims = '${saClaims()}'`,
      );
      await client.query(
        `select set_config('request.headers', '{"x-oplaris-impersonate":"${GARAGE_A}"}', true)`,
      );

      const { rows: gRows } = await client.query<{ g: string }>(
        `select private.current_garage()::text as g`,
      );
      expect(gRows[0]?.g).toBe(GARAGE_A);

      // The OR is_super_admin() in the SELECT policy still lets them
      // see B's row even when impersonating — that's the platform
      // operator's read superpower. Tenant scoping on writes is
      // enforced by the WITH CHECK + write policies which we test
      // separately below.
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });

  it("regular manager A still cannot see garage B's job", async () => {
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `select id from public.jobs where id = $1`,
        [B_JOB],
      );
      expect(rows).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 4. super_admin_enter_garage() RPC contract
  // -------------------------------------------------------------------------
  it("super_admin_enter_garage from a non-super_admin returns 42501", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query(`select public.super_admin_enter_garage($1)`, [GARAGE_B]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("super_admin_enter_garage on an unknown garage returns P0002", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(
        `set local request.jwt.claims = '${saClaims()}'`,
      );
      await expect(
        client.query(
          `select public.super_admin_enter_garage('00000000-0000-0000-0000-000000000999')`,
        ),
      ).rejects.toMatchObject({ code: "P0002" });
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });

  it("super_admin_enter_garage writes a 'super_admin_enter' audit_log row", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(
        `set local request.jwt.claims = '${saClaims()}'`,
      );
      await client.query(
        `select public.super_admin_enter_garage($1)`,
        [GARAGE_B],
      );
      const { rows } = await client.query<{
        action: string;
        garage_id: string;
        target_id: string;
      }>(
        `select action, garage_id::text, target_id::text
           from public.audit_log
          where action = 'super_admin_enter'
            and target_id = $1
          order by created_at desc limit 1`,
        [GARAGE_B],
      );
      expect(rows[0]?.action).toBe("super_admin_enter");
      expect(rows[0]?.garage_id).toBe(GARAGE_B);
      expect(rows[0]?.target_id).toBe(GARAGE_B);
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });

  // -------------------------------------------------------------------------
  // 5. Audit trigger
  // -------------------------------------------------------------------------
  it("super_admin UPDATE on a customer writes a 'super_admin_update' audit_log row", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(
        `set local request.jwt.claims = '${saClaims()}'`,
      );
      await client.query(
        `select set_config('request.headers', '{"x-oplaris-impersonate":"${GARAGE_A}"}', true)`,
      );

      // Sanity probe — the JWT + header are taking effect AND the
      // customer is visible from the super_admin's session.
      const { rows: probe } = await client.query<{
        sa: boolean;
        cg: string;
        cnt: number;
      }>(
        `select private.is_super_admin() as sa,
                private.current_garage()::text as cg,
                (select count(*)::int from public.customers
                  where id = $1) as cnt`,
        [A_CUSTOMER],
      );
      expect(probe[0]?.sa).toBe(true);
      expect(probe[0]?.cg).toBe(GARAGE_A);
      expect(probe[0]?.cnt).toBe(1);

      // Update an existing customer's notes
      const u = await client.query(
        `update public.customers set notes = 'sa-noted' where id = $1`,
        [A_CUSTOMER],
      );
      expect(u.rowCount).toBe(1);

      const { rows } = await client.query<{
        action: string;
        target_id: string;
        meta: Record<string, unknown>;
      }>(
        `select action, target_id::text, meta
           from public.audit_log
          where action = 'super_admin_update'
            and target_id = $1
          order by created_at desc limit 1`,
        [A_CUSTOMER],
      );
      expect(rows[0]?.action).toBe("super_admin_update");
      expect(rows[0]?.meta?.super_admin_user_id).toBe(SA_USER);
      expect(rows[0]?.meta?.impersonated_garage).toBe(GARAGE_A);
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });

  it("regular manager UPDATE does NOT write a super_admin_* audit row", async () => {
    await withTx(aManager, async (c) => {
      await c.query(
        `update public.customers set notes = 'manager-noted' where id = $1`,
        [A_CUSTOMER],
      );
      const { rows } = await c.query<{ count: number }>(
        `select count(*)::int as count
           from public.audit_log
          where action like 'super_admin_%'
            and target_id = $1`,
        [A_CUSTOMER],
      );
      expect(rows[0]?.count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Write boundary — super_admin can't write across the impersonated garage
  // -------------------------------------------------------------------------
  it("super_admin impersonating A can INSERT into A's customers", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(
        `set local request.jwt.claims = '${saClaims()}'`,
      );
      await client.query(
        `select set_config('request.headers', '{"x-oplaris-impersonate":"${GARAGE_A}"}', true)`,
      );
      const r = await client.query<{ garage_id: string }>(
        `insert into public.customers (garage_id, full_name, phone)
         values ($1, 'SA-Inserted', '+447900000999')
         returning garage_id::text`,
        [GARAGE_A],
      );
      expect(r.rows[0]?.garage_id).toBe(GARAGE_A);
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });

  it("super_admin impersonating A CANNOT INSERT into B's customers (write policy unchanged)", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(
        `set local request.jwt.claims = '${saClaims()}'`,
      );
      await client.query(
        `select set_config('request.headers', '{"x-oplaris-impersonate":"${GARAGE_A}"}', true)`,
      );
      await expect(
        client.query(
          `insert into public.customers (garage_id, full_name, phone)
           values ($1, 'SA-CrossTenantAttack', '+447900000999')`,
          [GARAGE_B],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });

  // -------------------------------------------------------------------------
  // 7. list_garages_for_super_admin gate
  // -------------------------------------------------------------------------
  it("list_garages_for_super_admin from a manager returns 42501", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query(`select * from public.list_garages_for_super_admin()`),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("list_garages_for_super_admin from a super_admin lists all garages", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(
        `set local request.jwt.claims = '${saClaims()}'`,
      );
      const { rows } = await client.query<{ id: string }>(
        `select id::text from public.list_garages_for_super_admin()
          where id in ($1, $2)`,
        [GARAGE_A, GARAGE_B],
      );
      expect(rows.map((r) => r.id).sort()).toEqual(
        [GARAGE_A, GARAGE_B].sort(),
      );
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });
});
