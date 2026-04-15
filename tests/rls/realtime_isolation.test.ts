/**
 * P50.S6 — cross-tenant subscriber isolation, exercised against the
 * underlying SELECT policies that govern realtime payload delivery.
 *
 * We can't drive a Supabase Realtime WS from the test harness (it's a
 * separate Erlang process the local stack would have to spin up), but
 * the postgres_changes feed re-applies the table's SELECT RLS to every
 * payload row before delivery. So if a forged JWT for garage A returns
 * zero rows from a `SELECT ...` against garage B's data via the same
 * JWT claims realtime would use, the WS would also deliver zero frames.
 *
 * That means: a SELECT-rls-isolation test under each role IS the
 * realtime isolation test. We assert it explicitly here so the
 * acceptance criterion has a CI-runnable signal.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool, withTx } from "./db";
import {
  A_JOB,
  A_MECHANIC,
  B_JOB,
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

const aMechanic = {
  sub: A_MECHANIC,
  garage_id: GARAGE_A,
  role: "mechanic" as const,
};

describe("P50.S6 — realtime payload isolation = SELECT RLS isolation", () => {
  it("a mechanic in garage A reading jobs sees only their own garage", async () => {
    await withTx(aMechanic, async (c) => {
      const r = await c.query<{ id: string }>(
        `select id from public.jobs where id = any($1::uuid[])`,
        [[A_JOB, B_JOB]],
      );
      const ids = new Set(r.rows.map((row) => row.id));
      expect(ids.has(A_JOB)).toBe(true); // own garage visible
      expect(ids.has(B_JOB)).toBe(false); // other garage filtered out
    });
  });

  it("forged client-side filter does not bypass RLS", async () => {
    // Even if a hostile client sends `filter=garage_id=eq.<B>`, the
    // postgres_changes feed re-applies SELECT RLS. Reproduce that by
    // running the equivalent query with garage_id pinned to garage B
    // under garage-A claims — must return zero rows.
    await withTx(aMechanic, async (c) => {
      const r = await c.query(
        `select id from public.jobs where garage_id = $1::uuid`,
        [GARAGE_B],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  it("bookings are isolated the same way (sidebar badge / Today queue)", async () => {
    await withTx(aMechanic, async (c) => {
      const r = await c.query(
        `select count(*)::int as n from public.bookings where garage_id = $1::uuid`,
        [GARAGE_B],
      );
      expect(r.rows[0]?.n).toBe(0);
    });
  });

  it("work_logs leak nothing cross-tenant either", async () => {
    await withTx(aMechanic, async (c) => {
      const r = await c.query(
        `select count(*)::int as n from public.work_logs where garage_id = $1::uuid`,
        [GARAGE_B],
      );
      expect(r.rows[0]?.n).toBe(0);
    });
  });
});
