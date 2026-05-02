/**
 * B5.4 — Spotlight (Cmd+K) cross-tenant isolation.
 *
 * The spotlight fans out one query per entity in parallel against the
 * caller's user-session client. Every entity ought to be RLS-scoped
 * by garage_id, so a Garage-A manager searching for a term that
 * matches a row in BOTH garages must only ever see A's row.
 *
 * One test per entity (5 total) — same shape as B5.3, but exercising
 * the spotlight's own predicate composition rather than the per-page
 * predicates. If RLS regresses on any single entity table, this is
 * the first place it surfaces.
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
    await c.query(`delete from public.sms_outbox where phone like 'B5.4-%'`);
    await c.query(
      `delete from public.stock_items where description like 'B5.4-%'`,
    );
  });
});

describe("B5.4 spotlight — RLS tenant isolation per entity", () => {
  it("jobs entity: A's spotlight never returns B's job by job_number", async () => {
    // Both fixtures use the 'TEST-?-001' job_number shape; spotlight's
    // jobs ILIKE %TEST% would match both, RLS scopes to caller.
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ job_number: string }>(
        `select job_number from public.jobs
          where deleted_at is null
            and (description ilike '%TEST%' or job_number ilike '%TEST%')
          order by created_at desc limit 5`,
      );
      expect(rows.map((r) => r.job_number)).toEqual(["TEST-A-001"]);
    });
    await withTx(bManager, async (c) => {
      const { rows } = await c.query<{ job_number: string }>(
        `select job_number from public.jobs
          where deleted_at is null and job_number ilike '%TEST%'
          order by created_at desc limit 5`,
      );
      expect(rows.map((r) => r.job_number)).toEqual(["TEST-B-001"]);
    });
  });

  it("customers entity: A spotlighting 'Carl' stays inside garage A", async () => {
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ id: string; full_name: string }>(
        `select id, full_name from public.customers
          where deleted_at is null
            and (full_name ilike '%Carl%' or email ilike '%Carl%' or phone ilike '%Carl%')
          order by full_name asc limit 5`,
      );
      expect(rows.map((r) => r.full_name)).toEqual(["Carla Customer"]);
      expect(rows.map((r) => r.id)).toEqual([A_CUSTOMER]);
    });
  });

  it("vehicles entity: A spotlighting 'AB12' or 'BC34' only sees A's reg", async () => {
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ registration: string }>(
        `select registration from public.vehicles
          where deleted_at is null
            and (registration ilike '%AB12%' or registration ilike '%BC34%')
          order by created_at desc limit 5`,
      );
      expect(rows.map((r) => r.registration)).toEqual(["AB12CDE"]);
    });
  });

  it("messages entity: A's spotlight only ever returns A's outbox rows", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `insert into public.sms_outbox
           (garage_id, vehicle_id, customer_id, job_id, phone, message_body,
            message_type, status)
         values
           ($1, $2, $3, $4, 'B5.4-+447700900001', 'Brake pads ready',
            'invoice_sent', 'delivered')`,
        [GARAGE_A, A_VEHICLE, A_CUSTOMER, A_JOB],
      );
      await c.query(
        `insert into public.sms_outbox
           (garage_id, vehicle_id, customer_id, job_id, phone, message_body,
            message_type, status)
         values
           ($1, $2, $3, $4, 'B5.4-+447700900002', 'Brake pads ready',
            'invoice_sent', 'delivered')`,
        [GARAGE_B, B_VEHICLE, B_CUSTOMER, B_JOB],
      );
    });
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ phone: string }>(
        `select phone from public.sms_outbox
          where phone like 'B5.4-%'
            and message_body ilike '%Brake%'
          order by created_at desc limit 3`,
      );
      expect(rows.map((r) => r.phone)).toEqual(["B5.4-+447700900001"]);
    });
  });

  it("stock entity: A spotlighting 'B5.4-pad' only sees A's stock items", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `insert into public.stock_items (garage_id, sku, description, location)
         values
           ($1, 'B5.4-SKU-A', 'B5.4-padset-front', 'Bay 1'),
           ($2, 'B5.4-SKU-B', 'B5.4-padset-front', 'Bay 2')`,
        [GARAGE_A, GARAGE_B],
      );
    });
    await withTx(aManager, async (c) => {
      const { rows } = await c.query<{ sku: string }>(
        `select sku from public.stock_items
          where description like 'B5.4-%'
            and (description ilike '%pad%' or sku ilike '%pad%' or location ilike '%pad%')
          order by description asc limit 3`,
      );
      expect(rows.map((r) => r.sku)).toEqual(["B5.4-SKU-A"]);
    });
    await withTx(bManager, async (c) => {
      const { rows } = await c.query<{ sku: string }>(
        `select sku from public.stock_items
          where description like 'B5.4-%' and description ilike '%pad%'
          order by description asc limit 3`,
      );
      expect(rows.map((r) => r.sku)).toEqual(["B5.4-SKU-B"]);
    });
  });
});
