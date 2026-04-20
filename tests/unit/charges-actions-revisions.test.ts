/**
 * Migration 045 — tiered invoice editing.
 *
 * Covers the five behaviours Hossein approved:
 *   1. addCharge on a `draft` invoice: no revision bump, no recalc trigger
 *   2. addCharge on a `quoted` invoice: bumps revision + recalculates totals
 *   3. addCharge on an `invoiced` invoice: returns error, doesn't touch DB
 *   4. revertToQuoted flips `invoiced → quoted` and nulls invoiced_at
 *   5. resendQuote fires SMS without touching `quote_status`
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  requireManager: vi.fn().mockResolvedValue({
    userId: "00000000-0000-0000-0000-000000000001",
    email: "manager@example.com",
    garageId: "00000000-0000-0000-0000-0000000000aa",
    roles: ["manager"],
  }),
}));

// Migration 047 — actions now go through queueSms; mock the queue
// boundary so tests stay focused on action behaviour, not the
// outbox plumbing (which has its own tests).
vi.mock("@/lib/sms/queue", () => ({
  queueSms: vi.fn().mockResolvedValue({
    outboxId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    twilioSid: "SM_test",
    status: "sent",
  }),
}));

vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    NEXT_PUBLIC_APP_URL: "http://test.local",
  }),
}));

// ------------------------------------------------------------------
// Supabase mock — chainable query builder that records every call so
// each test can inspect what was attempted (and block some ops, if
// the test needs to assert "this action refused to touch the DB").
// ------------------------------------------------------------------

type QueryStage = "select" | "insert" | "update" | "delete" | "eq" | "in";

interface MockState {
  invoice: {
    quote_status: string;
    revision: number;
    invoice_number?: string;
    total_pence?: number;
  } | null;
  job?: {
    job_number: string;
    customers?: { phone: string } | null;
    vehicles?: { registration: string } | null;
    invoices?: unknown;
  };
  charge?: { job_id: string };
  inserted: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  deleted: boolean;
  calls: { table: string; stage: QueryStage; args: unknown }[];
}

function makeClient(state: MockState) {
  function record(table: string, stage: QueryStage, args?: unknown) {
    state.calls.push({ table, stage, args });
  }

  function chain(table: string) {
    // Track which column the current chain is operating on so updates
    // to different rows don't collide with each other.
    const builder: Record<string, unknown> = {};
    builder.select = (..._args: unknown[]) => {
      record(table, "select", _args);
      return builder;
    };
    builder.insert = (payload: Record<string, unknown>) => {
      record(table, "insert", payload);
      state.inserted.push({ table, ...payload });
      if (table === "invoices" && !state.invoice) {
        state.invoice = {
          quote_status: "draft",
          revision: 1,
          invoice_number: payload.invoice_number as string,
        };
      }
      return builder;
    };
    builder.update = (payload: Record<string, unknown>) => {
      record(table, "update", payload);
      state.updated.push({ table, ...payload });
      if (table === "invoices" && state.invoice) {
        Object.assign(state.invoice, payload);
      }
      return builder;
    };
    builder.delete = () => {
      record(table, "delete");
      state.deleted = true;
      return builder;
    };
    builder.eq = (col: string, val: unknown) => {
      record(table, "eq", { col, val });
      return builder;
    };
    builder.in = (col: string, val: unknown) => {
      record(table, "in", { col, val });
      return builder;
    };
    builder.order = () => builder;
    builder.limit = () => builder;

    // Terminal resolvers — resolve differently depending on table
    builder.maybeSingle = async () => {
      if (table === "invoices") return { data: state.invoice, error: null };
      if (table === "jobs") return { data: state.job, error: null };
      if (table === "job_charges") return { data: state.charge, error: null };
      return { data: null, error: null };
    };
    builder.single = async () => {
      if (table === "invoices") return { data: state.invoice, error: null };
      if (table === "jobs") return { data: state.job, error: null };
      if (table === "job_charges")
        return {
          data: { id: "33333333-3333-4333-8333-333333333333" },
          error: null,
        };
      return { data: null, error: null };
    };

    // When the caller `.then()`s the builder directly (rare, but
    // Supabase-js allows it), resolve as a no-op.
    (builder as unknown as PromiseLike<unknown>).then = ((
      onFulfilled?: ((value: unknown) => unknown) | null,
    ) =>
      Promise.resolve({ data: null, error: null }).then(
        onFulfilled,
      )) as PromiseLike<unknown>["then"];

    return builder;
  }

  return {
    from: (table: string) => chain(table),
  };
}

let state: MockState;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => makeClient(state)),
}));

import {
  addCharge,
  revertToQuoted,
  resendQuote,
  markAsPaid,
  revertToInvoiced,
} from "@/app/(app)/app/jobs/charges/actions";
import { queueSms } from "@/lib/sms/queue";

beforeEach(() => {
  state = {
    invoice: null,
    inserted: [],
    updated: [],
    deleted: false,
    calls: [],
  };
  vi.clearAllMocks();
});

// Zod's `.uuid()` enforces RFC-4122 version + variant bits, so the
// canonical "all-ones" test UUIDs don't match. These are version-4
// variant-1 UUIDs that pass zod's regex.
const JOB = "11111111-1111-4111-8111-111111111111";
const CHARGE = "22222222-2222-4222-8222-222222222222";

const validCharge = {
  jobId: JOB,
  chargeType: "part" as const,
  description: "Brake pads",
  quantity: 1,
  unitPricePence: 5000,
};

describe("migration 045 — tiered invoice editing", () => {
  it("addCharge on draft invoice does not bump revision", async () => {
    state.invoice = { quote_status: "draft", revision: 1 };
    const result = await addCharge(validCharge);
    expect(result.ok).toBe(true);

    // No update to `invoices.revision` should have happened.
    const invoiceUpdates = state.calls.filter(
      (c) => c.table === "invoices" && c.stage === "update",
    );
    expect(invoiceUpdates).toHaveLength(0);
  });

  it("addCharge on quoted invoice bumps revision", async () => {
    state.invoice = {
      quote_status: "quoted",
      revision: 3,
      invoice_number: "Q-1",
      total_pence: 5000,
    };
    const result = await addCharge(validCharge);
    expect(result.ok).toBe(true);

    // At least one update on `invoices` must carry a `revision` key —
    // the rest are the totals recalc.
    const revisionUpdate = state.updated.find(
      (u) => u.table === "invoices" && "revision" in u,
    );
    expect(revisionUpdate).toBeDefined();
    expect((revisionUpdate as { revision: number }).revision).toBe(4);
  });

  it("addCharge on invoiced invoice refuses the write", async () => {
    state.invoice = { quote_status: "invoiced", revision: 2 };
    const result = await addCharge(validCharge);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/locked/i);

    // No charge row should have been inserted.
    const chargeInserts = state.inserted.filter(
      (i) => i.table === "job_charges",
    );
    expect(chargeInserts).toHaveLength(0);
  });

  it("revertToQuoted flips invoiced → quoted and clears invoiced_at", async () => {
    state.invoice = {
      quote_status: "invoiced",
      revision: 2,
      invoice_number: "INV-1",
    };
    const result = await revertToQuoted(JOB);
    expect(result.ok).toBe(true);

    // The update payload must contain both the new quote_status AND
    // `invoiced_at: null` — preserving invoice_number + revision.
    const revertUpdate = state.updated.find(
      (u) =>
        u.table === "invoices" && (u as { quote_status?: string }).quote_status === "quoted",
    ) as { quote_status: string; invoiced_at: string | null } | undefined;
    expect(revertUpdate).toBeDefined();
    expect(revertUpdate!.invoiced_at).toBeNull();
  });

  it("resendQuote fires SMS without changing quote_status", async () => {
    state.invoice = {
      quote_status: "quoted",
      revision: 2,
      invoice_number: "Q-DUD-1",
      total_pence: 18050,
    };
    state.job = {
      job_number: "DUD-1",
      customers: { phone: "+447911123456" },
      vehicles: { registration: "AB12CDE" },
      invoices: {
        invoice_number: "Q-DUD-1",
        total_pence: 18050,
        quote_status: "quoted",
        revision: 2,
      },
    };

    const result = await resendQuote(JOB);
    expect(result.ok).toBe(true);
    expect(queueSms).toHaveBeenCalledTimes(1);
    // Copy should reflect the "updated" revision path.
    const firstCall = vi.mocked(queueSms).mock.calls[0];
    expect(firstCall).toBeDefined();
    const payload = firstCall![0];
    expect(payload.messageBody).toMatch(/updated/i);
    expect(payload.messageBody).toMatch(/rev 2/);
    expect(payload.messageType).toBe("quote_updated");

    // No `quote_status` update — resend must be state-neutral.
    const statusUpdates = state.updated.filter(
      (u) => "quote_status" in u,
    );
    expect(statusUpdates).toHaveLength(0);
  });
});

// Suppress unused-var lint from the mocked CHARGE id — tests above
// don't all reference it, but it documents the "charge edit refused"
// case we'll add once updateCharge tests land.
void CHARGE;

// ------------------------------------------------------------------
// Migration 046 — payment state machine
// ------------------------------------------------------------------

describe("migration 046 — payment state machine", () => {
  it("markAsPaid flips invoiced → paid and stamps method", async () => {
    state.invoice = {
      quote_status: "invoiced",
      revision: 1,
      invoice_number: "INV-1",
      total_pence: 12000,
    };
    const result = await markAsPaid({ jobId: JOB, paymentMethod: "cash" });
    expect(result.ok).toBe(true);

    const paymentUpdate = state.updated.find(
      (u) =>
        u.table === "invoices" &&
        (u as { quote_status?: string }).quote_status === "paid",
    ) as
      | { quote_status: string; paid_at: string; payment_method: string }
      | undefined;
    expect(paymentUpdate).toBeDefined();
    expect(paymentUpdate!.payment_method).toBe("cash");
    expect(paymentUpdate!.paid_at).toBeTruthy();
  });

  it("addCharge on paid invoice refuses with a clear error", async () => {
    state.invoice = {
      quote_status: "paid",
      revision: 1,
    };
    const result = await addCharge(validCharge);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/payment already recorded/i);
  });

  it("revertToInvoiced clears paid_at + payment_method", async () => {
    state.invoice = {
      quote_status: "paid",
      revision: 1,
      invoice_number: "INV-1",
    };
    const result = await revertToInvoiced(JOB);
    expect(result.ok).toBe(true);

    const revertUpdate = state.updated.find(
      (u) =>
        u.table === "invoices" &&
        (u as { quote_status?: string }).quote_status === "invoiced",
    ) as
      | {
          quote_status: string;
          paid_at: string | null;
          payment_method: string | null;
        }
      | undefined;
    expect(revertUpdate).toBeDefined();
    expect(revertUpdate!.paid_at).toBeNull();
    expect(revertUpdate!.payment_method).toBeNull();
  });
});
