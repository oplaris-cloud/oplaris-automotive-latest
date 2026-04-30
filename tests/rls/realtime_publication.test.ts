/**
 * P50 — DB-side security audit for the realtime publication.
 *
 * Direct enforcement of acceptance criteria:
 *   * S1 — supabase_realtime publication contains ONLY coverage-matrix
 *          tables; audit_log / approval_tokens / private.* / rate_limits
 *          / mot_history_cache must not appear.
 *   * S2 — every coverage-matrix table has rowsecurity=true with no
 *          SELECT policy `USING (true)` or `USING (auth.uid() IS NOT NULL)`.
 *   * S3 — every UPDATE policy on those tables has a non-null
 *          WITH CHECK clause (catches rule #3 "missing WITH CHECK").
 *   * (P50.S6 cross-tenant: covered separately in
 *     `realtime_isolation.test.ts` — exercised with forged JWT.)
 *
 * The tests speak straight to local Postgres; no Supabase JS client.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asSuperuser, pool } from "./db";
import { setupFixtures, tearDownFixtures } from "./fixtures";

beforeAll(setupFixtures);
afterAll(async () => {
  await tearDownFixtures();
  await pool.end();
});

const COVERAGE_TABLES = [
  "approval_requests",
  "bays",
  "bookings",
  // Added by migration 060 (P3.3) so manager pages refresh when a
  // tech submits a completion checklist; the JobActivity timeline +
  // audit log surfaces both update without a manual reload.
  "job_completion_checks",
  "customers",
  "invoices",
  "job_assignments",
  "job_charges",
  "job_parts",
  "job_passbacks",
  // Added by migration 036 (P54) so the unified Job Activity feed
  // refreshes on status transitions without manual polling.
  "job_status_events",
  "jobs",
  // Added by migration 047 so the Messages page (/app/messages) sees
  // Twilio status flips (queued → sent → delivered / failed) land live.
  "sms_outbox",
  "staff",
  "stock_items",
  "stock_movements",
  "vehicles",
  "warranties",
  "work_logs",
] as const;

const FORBIDDEN_TABLES = [
  "audit_log",
  "approval_tokens",
  "rate_limits",
  "mot_history_cache",
  "garages",
  "stock_locations",
] as const;

describe("P50.S1 — supabase_realtime publication membership", () => {
  it("contains every coverage-matrix table", async () => {
    await asSuperuser(async (c) => {
      const r = await c.query<{ tablename: string }>(
        `select tablename from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public'`,
      );
      const got = new Set(r.rows.map((row) => row.tablename));
      for (const t of COVERAGE_TABLES) {
        expect(got.has(t), `missing ${t} from publication`).toBe(true);
      }
    });
  });

  it("contains NO non-coverage table — audit/private/cache stay out", async () => {
    await asSuperuser(async (c) => {
      const r = await c.query<{ schemaname: string; tablename: string }>(
        `select schemaname, tablename from pg_publication_tables
          where pubname = 'supabase_realtime'`,
      );
      const allowed = new Set<string>(COVERAGE_TABLES);
      for (const row of r.rows) {
        if (row.schemaname !== "public") {
          throw new Error(
            `non-public table in publication: ${row.schemaname}.${row.tablename}`,
          );
        }
        expect(allowed.has(row.tablename), `unexpected publication member: ${row.tablename}`).toBe(true);
      }
      // Belt-and-braces: explicitly forbid each named offender.
      for (const banned of FORBIDDEN_TABLES) {
        expect(r.rows.some((row) => row.tablename === banned)).toBe(false);
      }
    });
  });
});

describe("P50.S2 — RLS posture on coverage-matrix tables", () => {
  it("every coverage table has rowsecurity = true", async () => {
    await asSuperuser(async (c) => {
      const r = await c.query<{ tablename: string; rowsecurity: boolean }>(
        `select tablename, rowsecurity from pg_tables
          where schemaname = 'public' and tablename = any($1::text[])`,
        [[...COVERAGE_TABLES]],
      );
      for (const row of r.rows) {
        expect(row.rowsecurity, `${row.tablename} RLS off`).toBe(true);
      }
      // every coverage table should appear in pg_tables
      expect(r.rows.length).toBe(COVERAGE_TABLES.length);
    });
  });

  it("no SELECT policy uses USING (true) or USING (auth.uid() IS NOT NULL)", async () => {
    await asSuperuser(async (c) => {
      const r = await c.query<{
        polname: string;
        table_name: string;
        using_clause: string;
      }>(
        `select polname,
                polrelid::regclass::text as table_name,
                pg_get_expr(polqual, polrelid) as using_clause
           from pg_policy
          where polcmd = 'r'
            and polrelid::regclass::text = any($1::text[])
            and (
              pg_get_expr(polqual, polrelid) ilike 'true'
              or pg_get_expr(polqual, polrelid) ilike '%auth.uid() is not null%'
            )`,
        [COVERAGE_TABLES.map((t) => `public.${t}`)],
      );
      expect(r.rows).toEqual([]);
    });
  });
});

describe("P50.S3 — every UPDATE policy on coverage tables has WITH CHECK", () => {
  it("zero UPDATE policies have a NULL with_check", async () => {
    await asSuperuser(async (c) => {
      const r = await c.query<{
        polname: string;
        table_name: string;
      }>(
        `select polname, polrelid::regclass::text as table_name
           from pg_policy
          where polcmd = 'w'
            and pg_get_expr(polwithcheck, polrelid) is null
            and polrelid::regclass::text = any($1::text[])`,
        [COVERAGE_TABLES.map((t) => `public.${t}`)],
      );
      expect(r.rows).toEqual([]);
    });
  });
});

describe("P50 — REPLICA IDENTITY FULL on every coverage table", () => {
  it("relreplident = 'f' for each", async () => {
    await asSuperuser(async (c) => {
      const r = await c.query<{ relname: string; relreplident: string }>(
        `select relname, relreplident::text as relreplident
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and relname = any($1::text[])`,
        [[...COVERAGE_TABLES]],
      );
      for (const row of r.rows) {
        expect(row.relreplident, `${row.relname} replica identity != full`).toBe("f");
      }
    });
  });
});
