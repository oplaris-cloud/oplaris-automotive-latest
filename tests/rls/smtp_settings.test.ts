/**
 * B6.2 — SMTP settings access control.
 *
 * The table lives in `private`, so `authenticated` cannot reach it
 * over PostgREST. The helpers gate every mutation/read on
 * `private.is_super_admin()`, and `get_smtp_settings_for_send` is
 * service_role-only (anon JWTs cannot decrypt the password even if
 * they discover the function name).
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { asSuperuser, pool, withTx } from "./db";
import {
  A_MANAGER,
  GARAGE_A,
  setupFixtures,
  tearDownFixtures,
} from "./fixtures";

const SA_USER = "00000000-0000-0000-0000-00000005ad02";

beforeAll(async () => {
  await setupFixtures();
  await asSuperuser(async (c) => {
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email,
                               encrypted_password, email_confirmed_at,
                               created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', 'sa-smtp@oplaris.test', '', now(), now(), now())
       on conflict (id) do nothing`,
      [SA_USER],
    );
    await c.query(
      `insert into private.platform_admins (user_id) values ($1)
       on conflict (user_id) do update set revoked_at = null`,
      [SA_USER],
    );
  });
});

afterAll(async () => {
  await asSuperuser(async (c) => {
    await c.query(
      `delete from private.smtp_settings where garage_id = $1`,
      [GARAGE_A],
    );
    await c.query(
      `delete from private.platform_admins where user_id = $1`,
      [SA_USER],
    );
    await c.query(`delete from auth.users where id = $1`, [SA_USER]);
  });
  await tearDownFixtures();
  await pool.end();
});

beforeEach(async () => {
  await asSuperuser(async (c) => {
    await c.query(
      `delete from private.smtp_settings where garage_id = $1`,
      [GARAGE_A],
    );
  });
});

const aManager = {
  sub: A_MANAGER,
  garage_id: GARAGE_A,
  role: "manager" as const,
};

function saClaims(): string {
  return JSON.stringify({
    sub: SA_USER,
    role: "authenticated",
    aud: "authenticated",
    app_metadata: {
      garage_id: null,
      roles: [],
      is_super_admin: true,
    },
  });
}

describe("B6.2 smtp_settings — access control", () => {
  it("manager cannot SELECT private.smtp_settings (private schema unreachable)", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query("select 1 from private.smtp_settings limit 1"),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("manager cannot upsert via the helper (42501)", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query(
          `select public.upsert_smtp_settings($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            GARAGE_A,
            "smtp.example.com",
            587,
            "user@x",
            "secret",
            "from@x",
            "From X",
            true,
            "encryption-key",
          ],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("super_admin upsert + meta-read round-trips without exposing password", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(`set local request.jwt.claims = '${saClaims()}'`);

      await client.query(
        `select public.upsert_smtp_settings($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          GARAGE_A,
          "smtp.example.com",
          587,
          "user@x",
          "super-secret-password",
          "from@x",
          "From X",
          true,
          "encryption-key-32",
        ],
      );

      const meta = await client.query(
        `select * from public.get_smtp_settings_meta($1)`,
        [GARAGE_A],
      );
      expect(meta.rows[0]?.host).toBe("smtp.example.com");
      expect(meta.rows[0]?.port).toBe(587);
      expect(meta.rows[0]?.username).toBe("user@x");
      // Critical — meta NEVER exposes password / password_encrypted.
      expect(Object.keys(meta.rows[0] as object)).not.toContain("password");
      expect(Object.keys(meta.rows[0] as object)).not.toContain(
        "password_encrypted",
      );
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });

  it("get_smtp_settings_for_send refuses authenticated callers (service_role only)", async () => {
    // Seed a row first.
    await asSuperuser(async (c) => {
      await c.query(
        `insert into private.smtp_settings
           (garage_id, host, port, username, password_encrypted,
            from_email, from_name, secure)
         values ($1, 'smtp.example.com', 587, 'user@x',
                 extensions.pgp_sym_encrypt('topsecret','encryption-key-32'),
                 'from@x', 'From X', true)`,
        [GARAGE_A],
      );
    });
    await withTx(aManager, async (c) => {
      await expect(
        c.query(
          `select * from public.get_smtp_settings_for_send($1, 'encryption-key-32')`,
          [GARAGE_A],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("get_smtp_settings_for_send under service_role decrypts to the original password", async () => {
    await asSuperuser(async (c) => {
      await c.query(
        `insert into private.smtp_settings
           (garage_id, host, port, username, password_encrypted,
            from_email, from_name, secure)
         values ($1, 'smtp.example.com', 587, 'user@x',
                 extensions.pgp_sym_encrypt('round-trip-please','encryption-key-32'),
                 'from@x', 'From X', true)
         on conflict (garage_id) do update set
           password_encrypted = extensions.pgp_sym_encrypt('round-trip-please','encryption-key-32')`,
        [GARAGE_A],
      );
    });
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role service_role");
      const r = await client.query<{ password: string }>(
        `select password from public.get_smtp_settings_for_send($1, 'encryption-key-32')`,
        [GARAGE_A],
      );
      expect(r.rows[0]?.password).toBe("round-trip-please");
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });

  it("upsert with port 0 is rejected at the CHECK constraint", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(`set local request.jwt.claims = '${saClaims()}'`);
      await expect(
        client.query(
          `select public.upsert_smtp_settings($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            GARAGE_A,
            "smtp.example.com",
            0,
            "u",
            "p",
            "f@x",
            "F",
            true,
            "k",
          ],
        ),
      ).rejects.toMatchObject({ code: "22023" });
    } finally {
      try {
        await client.query("rollback");
      } finally {
        client.release();
      }
    }
  });
});
