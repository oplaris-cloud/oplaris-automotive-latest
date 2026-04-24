/**
 * invoices RLS — UPDATE WITH CHECK (migration 051) +
 *                INSERT WITH CHECK job-tenant guard (migration 052).
 *
 * Pre-051 state: `invoices_update` had NULL WITH CHECK — same Rule #3
 * violation as `job_charges_update`. The invoice-lifecycle state
 * flips (markAsInvoiced / markAsPaid / revertToQuoted /
 * revertToInvoiced, from migrations 045 + 046) all go through this
 * policy; without WITH CHECK there was no post-UPDATE tenancy check.
 * Migration 051 closes it by mirroring the INSERT predicate +
 * enforcing `jobs.garage_id = invoices.garage_id`.
 *
 * Migration 052 adds the matching INSERT-side guard: pre-052 the
 * INSERT WITH CHECK enforced the staff-subquery garage-wall but not
 * the `job_id` → `jobs.garage_id` consistency. A B-manager could
 * INSERT `(garage_id=B, job_id=<garage-A job>)` and silently pollute
 * their own tenant's invoice table with rows pointing at another
 * tenant's jobs. 052 closes it.
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

describe("invoices INSERT WITH CHECK (migration 052)", () => {
  it("same-tenant manager CAN insert an invoice against an own-garage job (regression guard)", async () => {
    await withTx(aManager, async (c) => {
      const r = await c.query(SEED_INVOICE_SQL, [GARAGE_A, A_JOB, "TEST-INV-A-0100"]);
      expect(r.rowCount).toBe(1);
    });
  });

  it("cross-tenant INSERT rejected — B manager cannot mint an invoice whose job_id is in A", async () => {
    // Pre-052: WITH CHECK only verified `garage_id = staff.garage_id`. A
    // B-manager passing `(garage_id=B, job_id=A_JOB)` satisfied that and
    // INSERT succeeded — polluting B's invoices with a row whose `job_id`
    // dangles into A's tenancy. Post-052 the EXISTS check catches it.
    await withTx(bManager, async (c) => {
      await expect(
        c.query(SEED_INVOICE_SQL, [GARAGE_B, A_JOB, "TEST-INV-B-XTNT"]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("dangling job_id INSERT rejected — non-existent job UUID fails the EXISTS clause", async () => {
    const fakeJobId = "00000000-0000-0000-0000-000000000fff";
    await withTx(aManager, async (c) => {
      await expect(
        c.query(SEED_INVOICE_SQL, [GARAGE_A, fakeJobId, "TEST-INV-A-DANG"]),
      ).rejects.toMatchObject({ code: expect.stringMatching(/42501|23503/) });
    });
  });
});

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
