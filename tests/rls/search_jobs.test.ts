/**
 * B5.1 — Tenant isolation on the multi-step jobs search.
 *
 * `searchJobs` (src/lib/search/jobs.ts) does three RLS-scoped queries
 * in turn — customers ILIKE → vehicles ILIKE → jobs IN (ids). If ANY
 * one of those steps leaked across tenants, a Garage-A manager could
 * see Garage-B jobs by searching for a B customer's name.
 *
 * Both garages are seeded with similar-shaped names ("Carla Customer"
 * in A, "Carl Customer" in B). The bare query "Carl" matches both
 * via ILIKE, so the only thing keeping them separate is RLS. We
 * impersonate each garage's manager in turn and assert they see
 * exclusively their own row.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool, withTx } from "./db";
import {
  A_CUSTOMER,
  A_JOB,
  A_MANAGER,
  A_VEHICLE,
  B_CUSTOMER,
  B_JOB,
  B_MANAGER,
  B_VEHICLE,
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

describe("B5.1 search_jobs — RLS tenant isolation", () => {
  it("step 1 (customers ILIKE) is scoped to caller's garage", async () => {
    // Both fixtures contain "Carl%" — A has "Carla Customer", B has "Carl Customer".
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `select id from customers
          where deleted_at is null
            and (full_name ilike $1 or email ilike $1 or phone ilike $1)`,
        ["Carl%"],
      );
      expect(rows.map((r) => r.id)).toEqual([A_CUSTOMER]);
    });

    await withTx(bManager, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `select id from customers
          where deleted_at is null
            and (full_name ilike $1 or email ilike $1 or phone ilike $1)`,
        ["Carl%"],
      );
      expect(rows.map((r) => r.id)).toEqual([B_CUSTOMER]);
    });
  });

  it("step 2 (vehicles ILIKE 'AB1' OR 'BC3') stays in caller's garage", async () => {
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ id: string; registration: string }>(
        `select id, registration from vehicles
          where registration ilike $1 or registration ilike $2`,
        ["AB1%", "BC3%"],
      );
      // A only sees AB12CDE, never BC34DEF
      expect(rows.map((r) => r.registration)).toEqual(["AB12CDE"]);
      expect(rows.map((r) => r.id)).toEqual([A_VEHICLE]);
    });
  });

  it("step 3 (jobs IN (cross-tenant ids)) returns only own-tenant jobs", async () => {
    // Even if a malicious caller knew B's customer_id and embedded it in
    // the IN list, RLS on jobs must still scope to garage_id.
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `select id from jobs
          where deleted_at is null
            and customer_id in ($1, $2)`,
        [A_CUSTOMER, B_CUSTOMER],
      );
      expect(rows.map((r) => r.id)).toEqual([A_JOB]);
    });
  });

  it("end-to-end: A manager searching 'Carl' never sees B's job", async () => {
    // This is the realistic shape of searchJobs: two scoped sub-queries
    // feeding the IDs into the final jobs query. Each step is RLS-clean,
    // and the join across them stays clean too.
    await withTx(aManager, async (c) => {
      const { rows: customers } = await c.query<{ id: string }>(
        `select id from customers where deleted_at is null and full_name ilike $1`,
        ["%Carl%"],
      );
      const customerIds = customers.map((r) => r.id);
      expect(customerIds).toEqual([A_CUSTOMER]);

      const { rows: vehicles } = await c.query<{ id: string }>(
        `select id from vehicles where make ilike $1`,
        ["%Ford%"],
      );
      const vehicleIds = vehicles.map((r) => r.id);
      expect(vehicleIds).toEqual([A_VEHICLE]);

      const { rows: jobs } = await c.query<{ id: string }>(
        `select id from jobs
          where deleted_at is null
            and (customer_id = any($1::uuid[]) or vehicle_id = any($2::uuid[]))`,
        [customerIds, vehicleIds],
      );
      expect(jobs.map((r) => r.id)).toEqual([A_JOB]);
    });
  });

  it("date-range filter never crosses garages even with no other predicate", async () => {
    // Sanity: a wide created_at window still gets scoped to own garage.
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ id: string; garage_id: string }>(
        `select id, garage_id from jobs
          where deleted_at is null
            and created_at >= now() - interval '7 days'`,
      );
      // We don't assert exact contents (the seed has many jobs in A) —
      // only that no row of garage B leaked through.
      expect(rows.every((r) => r.garage_id === GARAGE_A)).toBe(true);
      expect(rows.find((r) => r.id === B_JOB)).toBeUndefined();
    });
  });
});
