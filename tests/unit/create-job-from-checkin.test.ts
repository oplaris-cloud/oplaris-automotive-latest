/**
 * P46 — `createJobFromCheckIn` server action.
 * Asserts the manager-only path, the converted-check-in refusal (P46.6),
 * the technician-role check (P46.2 + P46.7), and the happy path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireManager = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireManager: () => requireManager(),
  requireRole: vi.fn().mockResolvedValue({
    userId: "00000000-0000-0000-0000-000000000001",
    email: "m@example.com",
    garageId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa00",
    roles: ["manager"],
  }),
}));

const fromMock = vi.fn();
const rpcMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: fromMock,
    rpc: rpcMock,
  })),
}));

import { createJobFromCheckIn } from "@/app/(app)/app/bookings/actions";

const GARAGE = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa00";
const BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TECH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const JOB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  requireManager.mockReset().mockResolvedValue({
    userId: "00000000-0000-0000-0000-000000000001",
    email: "m@example.com",
    garageId: GARAGE,
    roles: ["manager"],
  });
});

// Minimal chainable builder — only the methods our action uses.
function bookingChain(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        is: () => ({
          is: () => ({
            single: () => Promise.resolve(result),
          }),
        }),
      }),
    }),
  };
}

function staffChain(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}

function customerLookupChain(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: () => Promise.resolve(result),
          }),
        }),
      }),
    }),
  };
}

function vehicleLookupChain(result: { data: unknown; error: unknown }) {
  return customerLookupChain(result);
}

function updateJobChain() {
  return {
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  };
}

function insertAssignmentChain(error: unknown) {
  return {
    insert: () => Promise.resolve({ error }),
  };
}

describe("createJobFromCheckIn — P46", () => {
  it("rejects target booking that's already converted (P46.6)", async () => {
    fromMock.mockReturnValueOnce(
      bookingChain({ data: null, error: { message: "no rows" } }),
    );
    const r = await createJobFromCheckIn({
      bookingId: BOOKING,
      technicianId: TECH,
    });
    expect(r).toEqual({
      ok: false,
      error: "Check-in not found or already converted",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects technician who is not a mechanic or mot_tester (P46.2 / P46.7)", async () => {
    fromMock
      .mockReturnValueOnce(
        bookingChain({
          data: {
            id: BOOKING,
            customer_name: "Carla",
            customer_phone: "+447700900001",
            customer_email: null,
            registration: "AB12CDE",
            make: "Ford",
            model: "Focus",
            service: "mot",
            source: "manager",
            notes: null,
            preferred_date: null,
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        staffChain({
          data: { id: TECH, is_active: true, roles: ["manager"] },
          error: null,
        }),
      );
    const r = await createJobFromCheckIn({
      bookingId: BOOKING,
      technicianId: TECH,
    });
    expect(r).toEqual({
      ok: false,
      error: "Selected staff member is not a technician",
    });
  });

  it("rejects inactive technician", async () => {
    fromMock
      .mockReturnValueOnce(
        bookingChain({
          data: {
            id: BOOKING,
            customer_name: "Carla",
            customer_phone: "+447700900001",
            customer_email: null,
            registration: "AB12CDE",
            make: null,
            model: null,
            service: "mot",
            source: "manager",
            notes: null,
            preferred_date: null,
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        staffChain({
          data: { id: TECH, is_active: false, roles: ["mechanic"] },
          error: null,
        }),
      );
    const r = await createJobFromCheckIn({
      bookingId: BOOKING,
      technicianId: TECH,
    });
    expect(r).toEqual({
      ok: false,
      error: "Technician not found or inactive",
    });
  });

  it("happy path: creates job + assigns mechanic + returns id", async () => {
    fromMock
      .mockReturnValueOnce(
        bookingChain({
          data: {
            id: BOOKING,
            customer_name: "Carla",
            customer_phone: "+447700900001",
            customer_email: null,
            registration: "AB12CDE",
            make: "Ford",
            model: "Focus",
            service: "mot",
            source: "manager",
            notes: null,
            preferred_date: null,
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        staffChain({
          data: { id: TECH, is_active: true, roles: ["mechanic"] },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        customerLookupChain({
          data: { id: "11111111-1111-4111-8111-111111111111" },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        vehicleLookupChain({
          data: { id: "22222222-2222-4222-8222-222222222222" },
          error: null,
        }),
      )
      .mockReturnValueOnce(updateJobChain())
      .mockReturnValueOnce(updateJobChain())
      .mockReturnValueOnce(insertAssignmentChain(null));

    rpcMock.mockResolvedValueOnce({ data: JOB, error: null });

    const r = await createJobFromCheckIn({
      bookingId: BOOKING,
      technicianId: TECH,
    });

    expect(r).toEqual({ ok: true, id: JOB });
    expect(rpcMock).toHaveBeenCalledWith(
      "create_job",
      expect.objectContaining({
        p_customer_id: "11111111-1111-4111-8111-111111111111",
        p_vehicle_id: "22222222-2222-4222-8222-222222222222",
        p_bay_id: null,
      }),
    );
  });

  // -------------------------------------------------------------
  // P2.4 — optional bayId
  // -------------------------------------------------------------

  const BAY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  function bayLookupChain(result: { data: unknown; error: unknown }) {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(result),
          }),
        }),
      }),
    };
  }

  it("rejects bayId that doesn't belong to this garage (P2.4)", async () => {
    fromMock
      .mockReturnValueOnce(
        bookingChain({
          data: {
            id: BOOKING,
            customer_name: "Dee",
            customer_phone: "+447700900002",
            customer_email: null,
            registration: "AB12CDE",
            make: null,
            model: null,
            service: "mot",
            source: "manager",
            notes: null,
            preferred_date: null,
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        staffChain({
          data: { id: TECH, is_active: true, roles: ["mechanic"] },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        customerLookupChain({
          data: { id: "11111111-1111-4111-8111-111111111111" },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        vehicleLookupChain({
          data: { id: "22222222-2222-4222-8222-222222222222" },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        bayLookupChain({ data: null, error: null }),
      );

    const r = await createJobFromCheckIn({
      bookingId: BOOKING,
      technicianId: TECH,
      bayId: BAY,
    });
    expect(r).toEqual({
      ok: false,
      error: "Selected bay not found in this garage",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("happy path with bayId: writes audit_log RPC + passes p_bay_id (P2.4)", async () => {
    fromMock
      .mockReturnValueOnce(
        bookingChain({
          data: {
            id: BOOKING,
            customer_name: "Eve",
            customer_phone: "+447700900003",
            customer_email: null,
            registration: "AB12CDE",
            make: null,
            model: null,
            service: "mot",
            source: "manager",
            notes: null,
            preferred_date: null,
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        staffChain({
          data: { id: TECH, is_active: true, roles: ["mechanic"] },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        customerLookupChain({
          data: { id: "11111111-1111-4111-8111-111111111111" },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        vehicleLookupChain({
          data: { id: "22222222-2222-4222-8222-222222222222" },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        bayLookupChain({
          data: { id: BAY, name: "Bay 1" },
          error: null,
        }),
      )
      .mockReturnValueOnce(updateJobChain()) // jobs.status update
      .mockReturnValueOnce(updateJobChain()) // bookings.job_id update
      .mockReturnValueOnce(insertAssignmentChain(null));

    rpcMock
      .mockResolvedValueOnce({ data: JOB, error: null }) // create_job
      .mockResolvedValueOnce({ data: null, error: null }); // write_audit_log

    const r = await createJobFromCheckIn({
      bookingId: BOOKING,
      technicianId: TECH,
      bayId: BAY,
    });

    expect(r).toEqual({ ok: true, id: JOB });
    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      "create_job",
      expect.objectContaining({ p_bay_id: BAY }),
    );
    expect(rpcMock).toHaveBeenNthCalledWith(
      2,
      "write_audit_log",
      expect.objectContaining({
        p_action: "bay_assigned",
        p_target_table: "jobs",
        p_target_id: JOB,
        p_meta: expect.objectContaining({
          from_bay_id: null,
          to_bay_id: BAY,
          to_bay_name: "Bay 1",
        }),
      }),
    );
  });
});
