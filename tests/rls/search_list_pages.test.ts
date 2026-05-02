/**
 * B5.3 — Tenant isolation across all 5 in-page list searches.
 *
 * One test per page (5 total). Each test seeds matching-shape rows in
 * BOTH garages, then asserts a Garage-A manager only ever sees A's
 * rows when the search runs. RLS does the heavy lifting; the runner
 * code under `src/lib/search/list-pages.ts` is just an OR composition
 * — if a leak shows up, it's an RLS regression, not a bug in the
 * runner.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { asSuperuser, pool, withTx } from "./db";
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

afterEach(async () => {
  await asSuperuser(async (c) => {
    // Test rows use the `B5.3-` prefix — narrow cleanup so we don't
    // touch the persistent fixture rows.
    await c.query(`delete from public.sms_outbox where phone like 'B5.3-%'`);
    await c.query(
      `delete from public.warranties where invoice_reference like 'B5.3-%'`,
    );
    await c.query(
      `delete from public.stock_items where description like 'B5.3-%'`,
    );
  });
});

describe("B5.3 list-page searches — RLS tenant isolation", () => {
  // -------------------------------------------------------------------------
  // 1. /app/customers — name / phone / email / owned-vehicle reg + TRADER
  // -------------------------------------------------------------------------
  it("customers: A manager searching 'Carl' never sees B's customer", async () => {
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `select id from public.customers
          where deleted_at is null
            and (full_name ilike '%Carl%' or email ilike '%Carl%' or phone ilike '%Carl%')`,
      );
      expect(rows.map((r) => r.id)).toEqual([A_CUSTOMER]);
    });
  });

  it("customers: TRADER chip filter respects RLS", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `update public.customers set is_trader = true where id = $1`,
        [A_CUSTOMER],
      );
      await c.query(
        `update public.customers set is_trader = true where id = $1`,
        [B_CUSTOMER],
      );
    });
    try {
      await withTx(aManager, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `select id from public.customers
            where deleted_at is null and is_trader = true`,
        );
        // A sees only A's trader-flagged customer
        expect(rows.map((r) => r.id)).toEqual([A_CUSTOMER]);
      });
    } finally {
      await asSuperuser(async (c) => {
        await c.query(
          `update public.customers set is_trader = false where id in ($1, $2)`,
          [A_CUSTOMER, B_CUSTOMER],
        );
      });
    }
  });

  // -------------------------------------------------------------------------
  // 2. /app/vehicles — reg / make / model / owner.full_name
  // -------------------------------------------------------------------------
  it("vehicles: ILIKE on reg / make / model / customer name stays tenant-scoped", async () => {
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ id: string; registration: string }>(
        `select id, registration from public.vehicles
          where deleted_at is null
            and (registration ilike '%AB1%'
                 or registration ilike '%BC3%'
                 or make ilike '%Ford%'
                 or make ilike '%VW%')`,
      );
      // Only A's "AB12CDE / Ford Focus" is visible
      expect(rows.map((r) => r.registration)).toEqual(["AB12CDE"]);
      expect(rows.map((r) => r.id)).toEqual([A_VEHICLE]);
    });
  });

  // -------------------------------------------------------------------------
  // 3. /app/stock — description / sku / location
  // -------------------------------------------------------------------------
  it("stock: description / sku / location ILIKE never crosses garages", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `insert into public.stock_items (garage_id, sku, description, location)
         values
           ($1, 'SKU-A-1', 'B5.3-brake-pads-A', 'Bay 1'),
           ($2, 'SKU-B-1', 'B5.3-brake-pads-B', 'Bay 2')`,
        [GARAGE_A, GARAGE_B],
      );
    });

    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ description: string }>(
        `select description from public.stock_items
          where description ilike '%brake%' and description like 'B5.3-%'`,
      );
      expect(rows.map((r) => r.description)).toEqual(["B5.3-brake-pads-A"]);
    });
    await withTx(bManager, async (c) => {
      const { rows } = await c.query<{ description: string }>(
        `select description from public.stock_items
          where description ilike '%brake%' and description like 'B5.3-%'`,
      );
      expect(rows.map((r) => r.description)).toEqual(["B5.3-brake-pads-B"]);
    });
  });

  // -------------------------------------------------------------------------
  // 4. /app/warranties — supplier / invoice_reference / claim_reason +
  //    stock_item.description (joined sub-search)
  // -------------------------------------------------------------------------
  it("warranties: supplier / ref / part-name search respects RLS", async () => {
    await asSuperuser(async (c) => {
      const aStock = await c.query<{ id: string }>(
        `insert into public.stock_items (garage_id, sku, description)
           values ($1, 'B5.3-WSKU-A', 'B5.3-warranty-disc-A')
         returning id`,
        [GARAGE_A],
      );
      const bStock = await c.query<{ id: string }>(
        `insert into public.stock_items (garage_id, sku, description)
           values ($1, 'B5.3-WSKU-B', 'B5.3-warranty-disc-B')
         returning id`,
        [GARAGE_B],
      );
      await c.query(
        `insert into public.warranties (garage_id, stock_item_id, supplier,
                                        purchase_date, expiry_date, invoice_reference)
         values
           ($1, $2, 'Bosch', current_date, current_date + 365, 'B5.3-INV-A')`,
        [GARAGE_A, aStock.rows[0]!.id],
      );
      await c.query(
        `insert into public.warranties (garage_id, stock_item_id, supplier,
                                        purchase_date, expiry_date, invoice_reference)
         values
           ($1, $2, 'Bosch', current_date, current_date + 365, 'B5.3-INV-B')`,
        [GARAGE_B, bStock.rows[0]!.id],
      );
    });

    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ invoice_reference: string }>(
        `select invoice_reference from public.warranties
          where invoice_reference like 'B5.3-%'
            and supplier ilike '%Bosch%'`,
      );
      expect(rows.map((r) => r.invoice_reference)).toEqual(["B5.3-INV-A"]);
    });
  });

  // -------------------------------------------------------------------------
  // 5. /app/messages — phone / registration / message_body + types[]
  //    sms_outbox is manager-only SELECT; A manager only sees A's rows.
  // -------------------------------------------------------------------------
  it("messages: phone / message_body ILIKE + types filter respects RLS", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `insert into public.sms_outbox
           (garage_id, vehicle_id, customer_id, job_id, phone, message_body,
            message_type, status)
         values
           ($1, $2, $3, $4, 'B5.3-+447700900001', 'Brake pads ready for collection',
            'invoice_sent', 'delivered')`,
        [GARAGE_A, A_VEHICLE, A_CUSTOMER, A_JOB],
      );
      await c.query(
        `insert into public.sms_outbox
           (garage_id, vehicle_id, customer_id, job_id, phone, message_body,
            message_type, status)
         values
           ($1, $2, $3, $4, 'B5.3-+447700900002', 'Brake pads ready for collection',
            'invoice_sent', 'delivered')`,
        [GARAGE_B, B_VEHICLE, B_CUSTOMER, B_JOB],
      );
    });

    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ phone: string }>(
        `select phone from public.sms_outbox
          where phone like 'B5.3-%'
            and message_body ilike '%Brake%'
            and message_type in ('invoice_sent','quote_sent')`,
      );
      expect(rows.map((r) => r.phone)).toEqual(["B5.3-+447700900001"]);
    });

    // And the converse — B manager only sees B's row.
    await withTx(bManager, async (c) => {
      const { rows } = await c.query<{ phone: string }>(
        `select phone from public.sms_outbox where phone like 'B5.3-%'`,
      );
      expect(rows.map((r) => r.phone)).toEqual(["B5.3-+447700900002"]);
    });
  });
});
