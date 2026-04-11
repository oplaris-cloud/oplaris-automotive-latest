/**
 * Auth-hook end-to-end test.
 *
 * Walks the full login flow through supabase-js:
 *   1. Create a real auth user via the service-role admin API
 *   2. Insert the matching staff row + private.staff_roles entry
 *   3. Sign in with email/password
 *   4. Decode the access_token and assert `app_metadata.garage_id` and
 *      `role` match what the hook should have written
 *
 * If this passes we know:
 *   - 005_auth_hook.sql is wired correctly in config.toml
 *   - GoTrue is calling it
 *   - JWT claims populate as expected for every role
 *   - RLS will see the right garage + role on every query
 *
 * If it fails, EVERY authenticated query will silently run without a
 * garage_id and return zero rows. That's why this test is mandatory.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { asSuperuser, pool } from "./db";
import { GARAGE_A } from "./fixtures";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const PASSWORD = "Oplaris-Dev-Password-Test-!";

interface TestUser {
  email: string;
  role: "manager" | "mot_tester" | "mechanic";
  userId?: string;
}

const users: TestUser[] = [
  { email: "hooktest-manager@dudley.test", role: "manager" },
  { email: "hooktest-tester@dudley.test", role: "mot_tester" },
  { email: "hooktest-mechanic@dudley.test", role: "mechanic" },
];

let admin: SupabaseClient;
let anon: SupabaseClient;

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split(".");
  if (!payload) throw new Error("invalid JWT shape");
  const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Clean prior hook-test users (in case of a crashed run)
  const { data: existing } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  for (const u of existing?.users ?? []) {
    if (u.email && users.some((t) => t.email === u.email)) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await asSuperuser((c) =>
    c.query("delete from staff where email like 'hooktest-%@dudley.test'"),
  );

  for (const user of users) {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    user.userId = data.user.id;

    await asSuperuser(async (c) => {
      await c.query(
        `insert into staff (id, garage_id, full_name, email)
         values ($1, $2, $3, $4)`,
        [user.userId, GARAGE_A, `Hook ${user.role}`, user.email],
      );
      await c.query(
        `insert into private.staff_roles (staff_id, garage_id, role)
         values ($1, $2, $3::private.staff_role)`,
        [user.userId, GARAGE_A, user.role],
      );
    });
  }
});

afterAll(async () => {
  for (const user of users) {
    if (user.userId) {
      await admin.auth.admin.deleteUser(user.userId).catch(() => undefined);
    }
  }
  await asSuperuser((c) =>
    c.query("delete from staff where email like 'hooktest-%@dudley.test'"),
  );
  await pool.end();
});

describe("custom_access_token_hook populates JWT claims", () => {
  for (const user of users) {
    it(`writes garage_id + role for ${user.role}`, async () => {
      const { data, error } = await anon.auth.signInWithPassword({
        email: user.email,
        password: PASSWORD,
      });
      expect(error, error?.message).toBeNull();
      expect(data.session).toBeTruthy();
      const token = data.session!.access_token;

      const payload = decodeJwtPayload(token);
      const appMetadata = (payload.app_metadata ?? {}) as Record<string, unknown>;

      expect(appMetadata.garage_id).toBe(GARAGE_A);
      expect(appMetadata.role).toBe(user.role);
      expect(payload.sub).toBe(user.userId);

      // Tidy up the session from this client — the next test runs fresh.
      await anon.auth.signOut();
    });
  }

  it("inactive staff get role=null (deny everything)", async () => {
    const user = users[0]!;
    // Deactivate
    await asSuperuser((c) =>
      c.query("update staff set is_active = false where id = $1", [user.userId]),
    );

    const { data, error } = await anon.auth.signInWithPassword({
      email: user.email,
      password: PASSWORD,
    });
    expect(error, error?.message).toBeNull();
    const payload = decodeJwtPayload(data.session!.access_token);
    const appMetadata = (payload.app_metadata ?? {}) as Record<string, unknown>;
    expect(appMetadata.role).toBeNull();
    expect(appMetadata.garage_id).toBeNull();

    // Reactivate for any follow-up tests
    await asSuperuser((c) =>
      c.query("update staff set is_active = true where id = $1", [user.userId]),
    );
    await anon.auth.signOut();
  });
});

describe("authenticated user cannot rewrite staff.garage_id via PostgREST", () => {
  it("PATCH /staff?id=eq.me with garage_id is rejected", async () => {
    const user = users[0]!;
    // Make sure they're active from the previous test
    await asSuperuser((c) =>
      c.query("update staff set is_active = true where id = $1", [user.userId]),
    );

    const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({
      email: user.email,
      password: PASSWORD,
    });
    expect(signinErr).toBeNull();
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${signin.session!.access_token}` },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: updateErr } = await userClient
      .from("staff")
      .update({ garage_id: "00000000-0000-0000-0000-000000000000" })
      .eq("id", user.userId!);

    // Either 403 (column grant revoked) or RLS denial. Both are acceptable.
    expect(updateErr).not.toBeNull();
    expect(updateErr?.code).toMatch(/^(42501|PGRST\d+)$/);

    await anon.auth.signOut();
  });
});
