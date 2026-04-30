/**
 * P2.1 — RLS contract for `public.short_links` (mig 062).
 *
 * Manager-only read of own garage; service_role-only writes (the table
 * is mutated through src/lib/sms/short-link.ts which uses the admin
 * client). Mechanics + MOT testers + cross-garage managers MUST NOT
 * see any row, and no authenticated role can INSERT/UPDATE/DELETE
 * directly even within their own garage.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asSuperuser, pool, withTx } from "./db";
import {
  A_MANAGER,
  A_MECHANIC,
  A_TESTER,
  B_MANAGER,
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

const aManager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const aMechanic = {
  sub: A_MECHANIC,
  garage_id: GARAGE_A,
  role: "mechanic" as const,
};
const aTester = {
  sub: A_TESTER,
  garage_id: GARAGE_A,
  role: "mot_tester" as const,
};
const bManager = {
  sub: B_MANAGER,
  garage_id: GARAGE_B,
  role: "manager" as const,
};

const A_LINK_ID = "Ax3Ky9";
const B_LINK_ID = "Bz4Lp7";

beforeEach(async () => {
  await asSuperuser(async (c) => {
    await c.query(
      `delete from public.short_links where id = any($1::text[])`,
      [[A_LINK_ID, B_LINK_ID]],
    );
    await c.query(
      `insert into public.short_links
         (id, garage_id, target_url, purpose, expires_at)
       values
         ($1, $2, $3, 'approval', now() + interval '1 hour'),
         ($4, $5, $6, 'approval', now() + interval '1 hour')`,
      [
        A_LINK_ID,
        GARAGE_A,
        "https://example.test/approve/garage-a-token",
        B_LINK_ID,
        GARAGE_B,
        "https://example.test/approve/garage-b-token",
      ],
    );
  });
});

describe("short_links — manager-only read of own garage", () => {
  it("garage-A manager sees their own short_link", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query(
        `select id from public.short_links where id = $1`,
        [A_LINK_ID],
      );
      expect(r.rows).toHaveLength(1);
    });
  });

  it("garage-A mechanic CANNOT see any short_link (manager-only role gate)", async () => {
    await withTx(aMechanic, async (c) => {
      const r = await c.query(
        `select id from public.short_links where id = $1`,
        [A_LINK_ID],
      );
      expect(r.rows).toHaveLength(0);
    });
  });

  it("garage-A MOT tester CANNOT see any short_link", async () => {
    await withTx(aTester, async (c) => {
      const r = await c.query(
        `select id from public.short_links where id = $1`,
        [A_LINK_ID],
      );
      expect(r.rows).toHaveLength(0);
    });
  });

  it("garage-B manager CANNOT see garage-A's short_link (cross-tenant)", async () => {
    await withTx(bManager, async (c) => {
      const r = await c.query(
        `select id from public.short_links where id = $1`,
        [A_LINK_ID],
      );
      expect(r.rows).toHaveLength(0);
    });
  });

  it("garage-B manager DOES see their own short_link", async () => {
    await withTx(bManager, async (c) => {
      const r = await c.query(
        `select id from public.short_links where id = $1`,
        [B_LINK_ID],
      );
      expect(r.rows).toHaveLength(1);
    });
  });
});

describe("short_links — no direct writes from authenticated", () => {
  it("manager cannot INSERT (writes go through service-role helper)", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query(
          `insert into public.short_links
             (id, garage_id, target_url, purpose, expires_at)
           values ('Mx9Nq2', $1, 'https://example.test/x', 'approval',
                   now() + interval '1 hour')`,
          [GARAGE_A],
        ),
      ).rejects.toThrow();
    });
  });

  it("manager cannot UPDATE used_count", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query(
          `update public.short_links set used_count = 999 where id = $1`,
          [A_LINK_ID],
        ),
      ).rejects.toThrow();
    });
  });

  it("manager cannot DELETE rows", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query(`delete from public.short_links where id = $1`, [A_LINK_ID]),
      ).rejects.toThrow();
    });
  });
});
