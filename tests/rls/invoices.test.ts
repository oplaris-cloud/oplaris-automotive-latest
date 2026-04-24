/**
 * invoices RLS — UPDATE WITH CHECK (migration 051).
 *
 * Pre-051 state: `invoices_update` had NULL WITH CHECK — same Rule #3
 * violation as `job_charges_update`. The invoice-lifecycle state
 * flips (markAsInvoiced / markAsPaid / revertToQuoted /
 * revertToInvoiced, from migrations 045 + 046) all go through this
 * policy; without WITH CHECK there was no post-UPDATE tenancy check.
 * Migration 051 closes it by mirroring the INSERT predicate +
 * enforcing `jobs.garage_id = invoices.garage_id`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { pool, withTx, asSuperuser } from "./db";
import {
  A_JOB,
  A_MANAGER,
  GARAGE_A,
  B_MANAGER,
  GARAGE_B,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

beforeAll(setupFixtures);
afterAll(async () => {
  await asSuperuser((c) =>
    c.query("delete from invoices where garage_id in ($1, $2)", [GARAGE_A, GARAGE_B]),
  );
  await tearDownFixtures();
  await pool.end();
});

afterEach(async () => {
  await asSuperuser((c) =>
    c.query("delete from invoices where garage_id in ($1, $2)", [GARAGE_A, GARAGE_B]),
  );
});

const aManager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const bManager = { sub: B_MANAGER, garage_id: GARAGE_B, role: "manager" as const };

const SEED_INVOICE_SQL = `
  insert into invoices (garage_id, job_id, invoice_number)
  values ($1, $2, $3)
  returning id
`;

describe("invoices UPDATE WITH CHECK (migration 051)", () => {
  it("same-tenant manager CAN update own-garage invoice (regression guard)", async () => {
    const seeded = await asSuperuser((c) =>
      c.query(SEED_INVOICE_SQL, [GARAGE_A, A_JOB, "TEST-INV-A-0001"]),
    );
    const invoiceId = seeded.rows[0].id;

    await withTx(aManager, async (c) => {
      const r = await c.query(
        "update invoices set quote_status = 'quoted', subtotal_pence = 5000, total_pence = 6000 where id = $1",
        [invoiceId],
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it("cross-tenant UPDATE rejected — B manager cannot mutate an A-garage invoice", async () => {
    await asSuperuser((c) =>
      c.query(SEED_INVOICE_SQL, [GARAGE_A, A_JOB, "TEST-INV-A-0002"]),
    );

    await withTx(bManager, async (c) => {
      const r = await c.query(
        "update invoices set quote_status = 'paid' where job_id = $1",
        [A_JOB],
      );
      expect(r.rowCount).toBe(0);
    });
  });
});
