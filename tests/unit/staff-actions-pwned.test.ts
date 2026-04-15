/**
 * B8 (M1 Go-Live Blocker) — assert that the only staff-creation path
 * (the sole password-set path in this app today) calls
 * `assertPasswordNotPwned` BEFORE handing the password to GoTrue.
 *
 * Direct enforcement of CLAUDE.md architecture rule #10
 * (NIST SP 800-63B §5.1.1.2). If a future password-set path is added,
 * mirror this test for that path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — must be declared before importing the module under
// test so vi can rewrite the imports.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  requireManager: vi.fn().mockResolvedValue({
    userId: "00000000-0000-0000-0000-000000000001",
    email: "manager@example.com",
    garageId: "00000000-0000-0000-0000-0000000000aa",
    roles: ["manager"],
  }),
}));

vi.mock("@/lib/security/pwned-passwords", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/security/pwned-passwords")
  >("@/lib/security/pwned-passwords");
  return {
    ...actual,
    assertPasswordNotPwned: vi.fn().mockResolvedValue(undefined),
  };
});

const adminCreateUser = vi.fn();
const staffInsert = vi.fn();
const rpc = vi.fn();
const adminClient = {
  auth: { admin: { createUser: adminCreateUser } },
  from: vi.fn(() => ({ insert: staffInsert })),
  rpc,
};
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => adminClient),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { addStaffMember } from "@/app/(app)/app/settings/staff/actions";
import {
  assertPasswordNotPwned,
  PwnedPasswordsError,
} from "@/lib/security/pwned-passwords";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const validInput = {
  email: "new-tech@example.com",
  password: "correct-horse-battery-staple",
  fullName: "New Tech",
  phone: "",
  roles: ["mechanic"] as ("manager" | "mot_tester" | "mechanic")[],
};

beforeEach(() => {
  vi.mocked(assertPasswordNotPwned).mockReset().mockResolvedValue(undefined);
  vi.mocked(createSupabaseAdminClient).mockClear();
  adminCreateUser.mockReset().mockResolvedValue({
    data: { user: { id: "00000000-0000-0000-0000-0000000000bb" } },
    error: null,
  });
  staffInsert.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset().mockResolvedValue({ error: null });
});

describe("addStaffMember — pwned-passwords gate (B8)", () => {
  it("calls assertPasswordNotPwned with the candidate password before creating the auth user", async () => {
    const result = await addStaffMember(validInput);

    expect(result.ok).toBe(true);
    expect(assertPasswordNotPwned).toHaveBeenCalledTimes(1);
    expect(assertPasswordNotPwned).toHaveBeenCalledWith(validInput.password);

    // Order matters: HIBP check must happen before GoTrue createUser
    const pwnedOrder = vi.mocked(assertPasswordNotPwned).mock.invocationCallOrder[0]!;
    const createOrder = adminCreateUser.mock.invocationCallOrder[0]!;
    expect(pwnedOrder).toBeLessThan(createOrder);
  });

  it("rejects the request and skips auth user creation when HIBP says pwned", async () => {
    vi.mocked(assertPasswordNotPwned).mockRejectedValueOnce(
      new PwnedPasswordsError("pwned"),
    );

    const result = await addStaffMember(validInput);

    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        password:
          "This password has appeared in a known data breach. Please choose a different one.",
      },
    });
    expect(adminCreateUser).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns a generic safe-to-retry error and skips user creation when HIBP errors out (fail-closed)", async () => {
    vi.mocked(assertPasswordNotPwned).mockRejectedValueOnce(
      new Error("network timeout"),
    );

    const result = await addStaffMember(validInput);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/verify password safety/i);
    expect(adminCreateUser).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("does NOT call HIBP when zod validation fails (cheap reject first)", async () => {
    const result = await addStaffMember({ ...validInput, password: "short" });

    expect(result.ok).toBe(false);
    expect(assertPasswordNotPwned).not.toHaveBeenCalled();
    expect(adminCreateUser).not.toHaveBeenCalled();
  });
});
