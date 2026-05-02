/**
 * B5.2 — Vehicle-scoped Job History search respects RLS.
 *
 * The runtime fans out to job_charges + job_parts ILIKE queries with a
 * vehicle-scoped jobIds list. The test proves:
 *   - jobs with `vehicle_id = $A_VEHICLE` are only visible to A's manager
 *   - job_charges / job_parts inserted on B's job are never returned to
 *     A's manager even with an `IN (B_JOB)` predicate
 *   - the `bookings.service` filter never pulls in another tenant's row
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { asSuperuser, pool, withTx } from "./db";
import {
  A_JOB,
  A_MANAGER,
  A_MECHANIC,
  A_VEHICLE,
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

beforeEach(async () => {
  await asSuperuser(async (c) => {
    // Seed one job_charges + one job_parts on each garage's job so we
    // can verify RLS scoping. A_MECHANIC is a valid `added_by` for A.
    await c.query(
      `delete from job_parts where description like 'B5.2-%'`,
    );
    await c.query(
      `delete from job_charges where description like 'B5.2-%'`,
    );
    await c.query(
      `insert into job_charges (garage_id, job_id, charge_type, description,
                                quantity, unit_price_pence)
       values ($1, $2, 'labour', 'B5.2-brake-pads-A', 1, 12000)`,
      [GARAGE_A, A_JOB],
    );
    await c.query(
      `insert into job_charges (garage_id, job_id, charge_type, description,
                                quantity, unit_price_pence)
       values ($1, $2, 'labour', 'B5.2-brake-pads-B', 1, 12000)`,
      [GARAGE_B, B_JOB],
    );
    await c.query(
      `insert into job_parts (garage_id, job_id, added_by, description,
                              supplier, unit_price_pence, quantity,
                              purchased_at, payment_method)
       values ($1, $2, $3, 'B5.2-disc-A', 'ecp', 5000, 1, now(), 'cash')`,
      [GARAGE_A, A_JOB, A_MECHANIC],
    );
  });
});

describe("B5.2 search_vehicle_jobs — RLS tenant isolation", () => {
  it("vehicle scope is implicit; A manager sees only A's vehicle", async () => {
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `select id from jobs where vehicle_id = $1 and deleted_at is null`,
        [A_VEHICLE],
      );
      expect(rows.map((r) => r.id)).toContain(A_JOB);
    });
  });

  it("A manager passing B_VEHICLE in vehicle_id sees zero rows", async () => {
    // The page route protects against this (params.id is the route),
    // but the SQL must also refuse a malicious crafted query.
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `select id from jobs where vehicle_id = $1 and deleted_at is null`,
        [B_VEHICLE],
      );
      expect(rows).toEqual([]);
    });
  });

  it("job_charges ILIKE 'brake' returns only own-tenant rows", async () => {
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ description: string }>(
        `select description from job_charges
          where description ilike '%brake%' and description like 'B5.2-%'`,
      );
      expect(rows.map((r) => r.description)).toEqual(["B5.2-brake-pads-A"]);
    });
    await withTx(bManager, async (c) => {
      const { rows } = await c.query<{ description: string }>(
        `select description from job_charges
          where description ilike '%brake%' and description like 'B5.2-%'`,
      );
      expect(rows.map((r) => r.description)).toEqual(["B5.2-brake-pads-B"]);
    });
  });

  it("job_charges IN (B_JOB) from A manager returns zero rows", async () => {
    // Even if A manager knows B's job_id, the RLS GET predicate filters.
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `select id from job_charges where job_id = $1`,
        [B_JOB],
      );
      expect(rows).toEqual([]);
    });
  });

  it("job_parts respects RLS the same way", async () => {
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ description: string }>(
        `select description from job_parts where description like 'B5.2-%'`,
      );
      expect(rows.map((r) => r.description)).toEqual(["B5.2-disc-A"]);
    });
  });

  it("bookings.service filter respects RLS — A doesn't see B's bookings", async () => {
    // Seed a booking on each side so we can compare. The fixtures
    // don't include bookings by default, so we add them here in
    // superuser to keep the fixture file tidy.
    await asSuperuser(async (c) => {
      await c.query(
        `insert into bookings (garage_id, source, service, customer_name,
                               customer_phone, registration, job_id, ip)
         values ($1, 'manager', 'mot', 'Carla Customer',
                 '+447700900001', 'AB12CDE', $2, '127.0.0.1'::inet)
         on conflict do nothing`,
        [GARAGE_A, A_JOB],
      );
      await c.query(
        `insert into bookings (garage_id, source, service, customer_name,
                               customer_phone, registration, job_id, ip)
         values ($1, 'manager', 'electrical', 'Carl Customer',
                 '+447700900002', 'BC34DEF', $2, '127.0.0.1'::inet)
         on conflict do nothing`,
        [GARAGE_B, B_JOB],
      );
    });

    try {
      await withTx(aManager, async (c) => {
        const { rows } = await c.query<{ service: string }>(
          `select service::text from bookings
            where service::text in ('mot', 'electrical', 'maintenance')
              and registration in ('AB12CDE','BC34DEF')`,
        );
        expect(rows.map((r) => r.service)).toEqual(["mot"]);
      });
    } finally {
      await asSuperuser(async (c) => {
        await c.query(
          `delete from bookings where job_id in ($1, $2)`,
          [A_JOB, B_JOB],
        );
      });
    }
  });
});
