/**
 * P52.2 — server-side guard in `updateJobStatus` rejects the deprecated
 * `awaiting_mechanic` target with the spec-mandated error message. Belt
 * and braces: even if a stale UI somehow POSTs the old transition, the
 * server refuses and points the caller at the P51 dialog instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  requireManagerOrTester: vi.fn().mockResolvedValue({
    userId: "00000000-0000-0000-0000-000000000001",
    email: "manager@example.com",
    garageId: "00000000-0000-0000-0000-0000000000aa",
    roles: ["manager"],
  }),
  requireManager: vi.fn().mockResolvedValue({
    userId: "00000000-0000-0000-0000-000000000001",
    email: "manager@example.com",
    garageId: "00000000-0000-0000-0000-0000000000aa",
    roles: ["manager"],
  }),
  requireStaffSession: vi.fn().mockResolvedValue({
    userId: "00000000-0000-0000-0000-000000000001",
    email: "manager@example.com",
    garageId: "00000000-0000-0000-0000-0000000000aa",
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

import { updateJobStatus } from "@/app/(app)/app/jobs/actions";

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe("updateJobStatus — P52 awaiting_mechanic guard", () => {
  it("rejects target status='awaiting_mechanic' with the spec error and never touches the database", async () => {
    const result = await updateJobStatus({
      jobId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      status: "awaiting_mechanic",
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Use Pass to Mechanic dialog — status transitions no longer flip to awaiting_mechanic (P51).",
    });
    // The guard fires before any DB read or write.
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("still allows other valid transitions — P54 routes through set_job_status", async () => {
    // checked_in → in_diagnosis is in STATUS_TRANSITIONS. After P54 the
    // status flip happens inside the SECURITY DEFINER helper, so we
    // assert the RPC call shape rather than the raw UPDATE builder.
    fromMock.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { status: "checked_in" }, error: null }),
        }),
      }),
    });
    rpcMock.mockResolvedValue({
      data: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      error: null,
    });

    const result = await updateJobStatus({
      jobId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      status: "in_diagnosis",
    });

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("set_job_status", {
      p_job_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      p_new_status: "in_diagnosis",
      p_reason: null,
    });
  });
});
