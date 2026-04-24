/**
 * approval_requests RLS — INSERT WITH CHECK job-tenant guard
 * (migration 052).
 *
 * approval_requests is the table that backs the customer-approval SMS
 * flow. The INSERT path mints a token row whose `job_id` is later
 * resolved by the public route handler (under SECURITY DEFINER) to
 * decide which job the approving customer is responding to.
 *
 * Pre-052 state: WITH CHECK was
 *     garage_id = private.current_garage()
 *     and requested_by = auth.uid()
 * That validates the row's claimed `garage_id` matches the session,
 * but does NOT verify that `job_id` belongs to a job in that same
 * garage. A staff member in garage B could mint an approval token
 * with `(garage_id=B, job_id=<garage-A job>)` — the row sits inside
 * B's tenancy, but when the customer clicks the SMS link the public
 * route handler (SECURITY DEFINER, bypasses RLS) resolves the
 * `job_id` and serves another tenant's data.
 *
 * 052 mirrors 050's shape with a third predicate:
 *     EXISTS jobs WHERE id = approval_requests.job_id
 *                  AND garage_id = approval_requests.garage_id
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { pool, withTx, asSuperuser } from "./db";
import {
  A_CUSTOMER,
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
    c.query("delete from approval_requests where garage_id in ($1, $2)", [GARAGE_A, GARAGE_B]),
  );
  await tearDownFixtures();
  await pool.end();
});

afterEach(async () => {
  await asSuperuser((c) =>
    c.query("delete from approval_requests where garage_id in ($1, $2)", [GARAGE_A, GARAGE_B]),
  );
});

const aManager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };
const bManager = { sub: B_MANAGER, garage_id: GARAGE_B, role: "manager" as const };

// approval_requests has a couple of NOT NULLs we have to fill: token_hash,
// expires_at, customer_id, description, amount_pence. The shape mirrors the
// one issued by `src/lib/approvals/issue.ts`.
function insertApproval(
  garageId: string,
  jobId: string,
  customerId: string,
  requestedBy: string,
  tokenHashSuffix: string,
): { sql: string; params: string[] } {
  return {
    sql: `insert into approval_requests
       (garage_id, job_id, requested_by, customer_id,
        description, amount_pence, token_hash, expires_at)
     values
       ($1, $2, $3, $4,
        'Replacement clutch', 12000,
        $5, now() + interval '24 hours')
     returning id`,
    params: [garageId, jobId, requestedBy, customerId, `test-token-${tokenHashSuffix}`],
  };
}

describe("approval_requests INSERT WITH CHECK (migration 052)", () => {
  it("same-tenant manager CAN mint an approval against an own-garage job (regression guard)", async () => {
    await withTx(aManager, async (c) => {
      const { sql, params } = insertApproval(
        GARAGE_A,
        A_JOB,
        A_CUSTOMER,
        A_MANAGER,
        "a-ok",
      );
      const r = await c.query(sql, params);
      expect(r.rowCount).toBe(1);
    });
  });

  it("cross-tenant INSERT rejected — B manager cannot mint an approval whose job_id is in A", async () => {
    // Pre-052 the only checks were garage-wall + requested_by. Setting
    // `(garage_id=B, job_id=A_JOB, requested_by=B_MANAGER)` satisfied
    // both — token was minted inside B's tenancy but pointed at A's
    // job. Post-052: EXISTS check rejects.
    await withTx(bManager, async (c) => {
      const { sql, params } = insertApproval(
        GARAGE_B,
        A_JOB,
        A_CUSTOMER, // customer_id FK still points at A — needed because B has no overlap
        B_MANAGER,
        "b-xtnt",
      );
      await expect(c.query(sql, params)).rejects.toMatchObject({
        code: expect.stringMatching(/42501|23503/),
      });
    });
  });

  it("requested_by mismatch rejected — manager cannot mint an approval claiming someone else issued it", async () => {
    // Defence-in-depth regression: the existing `requested_by = auth.uid()`
    // predicate must keep firing. Migration 052 must not relax it.
    await withTx(aManager, async (c) => {
      const { sql, params } = insertApproval(
        GARAGE_A,
        A_JOB,
        A_CUSTOMER,
        // forge requested_by: claim B_MANAGER issued it
        "00000000-0000-0000-0000-0000000b0001",
        "forge",
      );
      await expect(c.query(sql, params)).rejects.toMatchObject({
        code: "42501",
      });
    });
  });
});
