/**
 * B6.1 — super-admin impersonation cookie sign/verify.
 *
 * The cookie is the SECOND defence line — first is the JWT claim, the
 * cookie + verified header tell PostgREST which garage to scope to.
 * If signing/verification breaks, an attacker who steals the JWT
 * (which they shouldn't be able to, but defence in depth) could be
 * able to impersonate any garage by hand-crafting the cookie value.
 *
 * We pin down:
 *   - a freshly-set cookie round-trips through verification
 *   - tampered payload (different garage_id) is rejected
 *   - tampered signature is rejected
 *   - expired cookie is rejected
 *   - a totally-malformed value short-circuits to null
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIG = { ...process.env };

// In-memory cookie store — patched into next/headers via vi.mock.
const store = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      store.has(name) ? { name, value: store.get(name)! } : undefined,
    set: (name: string, value: string) => {
      store.set(name, value);
    },
    delete: (name: string) => {
      store.delete(name);
    },
  }),
}));

beforeEach(() => {
  store.clear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.SUPABASE_JWT_SECRET = "jwt-secret-32-chars-x";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.invalid";
  process.env.NEXT_PUBLIC_STATUS_URL = "https://app.example.invalid/status";
  process.env.APPROVAL_HMAC_SECRET = "approval-hmac";
  process.env.STATUS_PHONE_PEPPER = "pepper";
  process.env.KIOSK_PAIRING_SECRET = "kiosk-secret";
  process.env.SUPER_ADMIN_COOKIE_SECRET = "test-super-secret-min-32-chars-here";
  (process.env as Record<string, string>).NODE_ENV = "test";
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIG };
  vi.resetModules();
});

const GARAGE_A = "00000000-0000-0000-0000-0000000d0d1e";
const GARAGE_B = "00000000-0000-0000-0000-00000000b001";

describe("super-admin impersonation cookie", () => {
  it("set + read round-trips and yields the same garage_id", async () => {
    const {
      setImpersonationCookie,
      readImpersonationCookie,
    } = await import("@/lib/auth/super-admin-cookie");

    await setImpersonationCookie(GARAGE_A);
    const got = await readImpersonationCookie();
    expect(got?.garageId).toBe(GARAGE_A);
    expect(got?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("returns null when no cookie is set", async () => {
    const { readImpersonationCookie } = await import(
      "@/lib/auth/super-admin-cookie"
    );
    expect(await readImpersonationCookie()).toBeNull();
  });

  it("rejects a tampered garage_id (HMAC mismatch)", async () => {
    const {
      setImpersonationCookie,
      readImpersonationCookie,
    } = await import("@/lib/auth/super-admin-cookie");

    await setImpersonationCookie(GARAGE_A);
    // Mutate the stored cookie to point at garage B without re-signing
    const v = store.get("oplaris_impersonate")!;
    const parts = v.split(".");
    store.set(
      "oplaris_impersonate",
      `${GARAGE_B}.${parts[1]}.${parts[2]}`,
    );

    expect(await readImpersonationCookie()).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const {
      setImpersonationCookie,
      readImpersonationCookie,
    } = await import("@/lib/auth/super-admin-cookie");

    await setImpersonationCookie(GARAGE_A);
    const v = store.get("oplaris_impersonate")!;
    const parts = v.split(".");
    // Replace signature with garbage
    store.set(
      "oplaris_impersonate",
      `${parts[0]}.${parts[1]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
    );

    expect(await readImpersonationCookie()).toBeNull();
  });

  it("rejects an expired cookie", async () => {
    const { readImpersonationCookie } = await import(
      "@/lib/auth/super-admin-cookie"
    );
    // Hand-craft a cookie with expiry in the past, signed correctly.
    const { createHmac } = await import("node:crypto");
    const expiresAt = Math.floor(Date.now() / 1000) - 60;
    const payload = `${GARAGE_A}|${expiresAt}`;
    const sig = createHmac("sha256", "test-super-secret-min-32-chars-here")
      .update(payload)
      .digest("base64url");
    store.set("oplaris_impersonate", `${GARAGE_A}.${expiresAt}.${sig}`);

    expect(await readImpersonationCookie()).toBeNull();
  });

  it("rejects a malformed value (wrong number of parts)", async () => {
    const { readImpersonationCookie } = await import(
      "@/lib/auth/super-admin-cookie"
    );
    store.set("oplaris_impersonate", "not-a-cookie-value");
    expect(await readImpersonationCookie()).toBeNull();
  });

  it("clear deletes the cookie", async () => {
    const {
      setImpersonationCookie,
      clearImpersonationCookie,
      readImpersonationCookie,
    } = await import("@/lib/auth/super-admin-cookie");

    await setImpersonationCookie(GARAGE_A);
    await clearImpersonationCookie();
    expect(await readImpersonationCookie()).toBeNull();
  });
});
