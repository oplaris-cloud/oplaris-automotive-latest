/**
 * P53 — `overrideJobHandler` server action.
 *
 * The RPC itself is covered in `tests/rls/override_handler_rpc.test.ts`.
 * This suite only exercises the thin server-action wrapper: it must
 * validate input shape, reject anything unauthenticated/forbidden
 * before hitting the DB, and revalidate the right paths on success.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireManagerMock, rpcMock } = vi.hoisted(() => ({
  requireManagerMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  requireManager: requireManagerMock,
  requireRole: vi.fn(),
  requireStaffSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(() => ({ rpc: rpcMock })),
}));

import { overrideJobHandler } from "@/app/(app)/app/jobs/passback/actions";

const validInput = {
  jobId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  targetRole: "mot_tester" as const,
  removeStaffIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
  assignStaffId: null,
  note: null,
};

describe("overrideJobHandler server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireManagerMock.mockResolvedValue({
      userId: "00000000-0000-0000-0000-000000000001",
      email: "manager@example.com",
      garageId: "00000000-0000-0000-0000-0000000000ac",
      roles: ["manager"],
    });
  });

  it("rejects invalid input without calling the RPC", async () => {
    const result = await overrideJobHandler({
      ...validInput,
      jobId: "not-a-uuid",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(result).toEqual({ ok: false, error: "Validation failed" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown target role before hitting the RPC", async () => {
    const result = await overrideJobHandler({
      ...validInput,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targetRole: "customer" as any,
    });
    expect(result).toEqual({ ok: false, error: "Validation failed" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects notes over 500 chars", async () => {
    const result = await overrideJobHandler({
      ...validInput,
      note: "x".repeat(501),
    });
    expect(result).toEqual({ ok: false, error: "Validation failed" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("passes zod-validated args through to the RPC and returns the passback id", async () => {
    rpcMock.mockResolvedValueOnce({
      data: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      error: null,
    });

    const result = await overrideJobHandler({
      ...validInput,
      note: "  trim me  ",
    });

    expect(rpcMock).toHaveBeenCalledWith("override_job_handler", {
      p_job_id: validInput.jobId,
      p_target_role: "mot_tester",
      p_remove_staff_ids: validInput.removeStaffIds,
      p_assign_staff_id: null,
      p_note: "trim me",
    });
    expect(result).toEqual({
      ok: true,
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });
  });

  it("surfaces the RPC error code as the action error", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });

    const result = await overrideJobHandler(validInput);
    expect(result).toEqual({ ok: false, error: "permission denied" });
  });

  it("uses the jobId as the returned id when the RPC returns null (same-role override)", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const result = await overrideJobHandler(validInput);
    expect(result).toEqual({ ok: true, id: validInput.jobId });
  });
});
