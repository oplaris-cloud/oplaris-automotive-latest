/**
 * Cross-tenant isolation: a Garage A user must NEVER see, insert, update,
 * or delete anything that belongs to Garage B. Run as a matrix across the
 * domain tables that all share the standard tenant policy template.
 *
 * If any of these fail, multi-tenant safety is broken — block the build.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import {
  A_CUSTOMER,
  A_JOB,
  A_MANAGER,
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

const aManager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const bManager = { sub: B_MANAGER, garage_id: GARAGE_B, role: "manager" as const };

describe("cross-tenant SELECT is invisible", () => {
  it("Garage A manager sees only Garage A customers", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query("select id, garage_id from customers");
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.every((row) => row.garage_id === GARAGE_A)).toBe(true);
      expect(r.rows.find((row) => row.id === B_CUSTOMER)).toBeUndefined();
    });
  });

  it("Garage A manager sees only Garage A vehicles", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query("select id from vehicles where id = $1", [B_VEHICLE]);
      expect(r.rowCount).toBe(0);
    });
  });

  it("Garage A manager sees only Garage A jobs", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query("select id from jobs where id = $1", [B_JOB]);
      expect(r.rowCount).toBe(0);
    });
  });

  it("Garage B manager cannot see Garage A's customer", async () => {
    await withTx(bManager, async (c) => {
      const r = await c.query("select id from customers where id = $1", [A_CUSTOMER]);
      expect(r.rowCount).toBe(0);
    });
  });
});

describe("cross-tenant INSERT is rejected", () => {
  it("Garage A manager cannot insert a customer into Garage B", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query(
          `insert into customers (garage_id, full_name, phone)
           values ($1, 'evil', '+447700900099')`,
          [GARAGE_B],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("Garage A manager cannot insert a vehicle into Garage B", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query(
          `insert into vehicles (garage_id, customer_id, registration)
           values ($1, $2, 'XX99XXX')`,
          [GARAGE_B, B_CUSTOMER],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("Garage A manager cannot insert a job into Garage B", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query(
          `insert into jobs (garage_id, job_number, customer_id, vehicle_id)
           values ($1, 'EVIL-001', $2, $3)`,
          [GARAGE_B, B_CUSTOMER, B_VEHICLE],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("cross-tenant UPDATE is invisible (zero rows affected)", () => {
  it("Garage A manager UPDATE on a Garage B customer hits 0 rows", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query(
        "update customers set full_name = 'pwned' where id = $1",
        [B_CUSTOMER],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  it("Garage A manager UPDATE on a Garage B job hits 0 rows", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query(
        "update jobs set status = 'cancelled' where id = $1",
        [B_JOB],
      );
      expect(r.rowCount).toBe(0);
    });
  });
});

describe("garage_id column is locked", () => {
  it("manager cannot move their own job to another garage (column not granted)", async () => {
    await withTx(aManager, async (c) => {
      // garage_id is REVOKEd from authenticated entirely on every domain table.
      await expect(
        c.query("update jobs set garage_id = $1 where id = $2", [GARAGE_B, A_JOB]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("manager cannot rewrite garage_id on a customer they own", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query("update customers set garage_id = $1 where id = $2", [
          GARAGE_B,
          A_CUSTOMER,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});
