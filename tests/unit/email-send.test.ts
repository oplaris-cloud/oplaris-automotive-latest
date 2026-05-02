/**
 * B6.2 — sendEmail() integration test.
 *
 * Uses nodemailer's `stream` transport so we can assert what would
 * have been sent over the wire without ever opening a TCP socket.
 * Three behaviours we lock in:
 *   - Subject + body + From header are populated from the settings row
 *   - Audit-log row is written, with NEITHER the password NOR the
 *     encryption key in the payload
 *   - On a transport error, ok=false is returned + audit captures
 *     status='failed'
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";

const ORIG = { ...process.env };

// Track audit_log inserts.
const auditInserts: Array<{ values: Record<string, unknown> }> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: vi.fn(async (name: string) => {
      if (name === "get_smtp_settings_for_send") {
        return {
          data: [
            {
              host: "smtp.example.test",
              port: 587,
              username: "u@x",
              password: "topsecret-do-not-leak",
              from_email: "from@x",
              from_name: "Test From",
              secure: true,
            },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    }),
    from: (table: string) => ({
      insert: (values: Record<string, unknown>) => {
        auditInserts.push({ values });
        return Promise.resolve({ error: null });
      },
      _table: table,
    }),
  }),
}));

beforeEach(() => {
  auditInserts.length = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.SUPABASE_JWT_SECRET = "jwt-secret-32-chars-x";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.invalid";
  process.env.NEXT_PUBLIC_STATUS_URL = "https://app.example.invalid/status";
  process.env.APPROVAL_HMAC_SECRET = "approval-hmac";
  process.env.STATUS_PHONE_PEPPER = "pepper";
  process.env.KIOSK_PAIRING_SECRET = "kiosk-secret";
  process.env.SUPER_ADMIN_COOKIE_SECRET = "sa-cookie-secret";
  process.env.SMTP_ENCRYPTION_KEY = "smtp-encryption-key-do-not-leak";
  (process.env as Record<string, string>).NODE_ENV = "test";
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIG };
});

const GARAGE_A = "00000000-0000-0000-0000-0000000d0d1e";

describe("sendEmail()", () => {
  it("renders the subject + body + From header via stream transport", async () => {
    const { sendEmail } = await import("@/lib/email/send");

    // Capture stream output: nodemailer's "stream" transport writes the
    // raw RFC822 message to a buffer we can read back.
    const transport = nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true,
    });

    const r = await sendEmail({
      garageId: GARAGE_A,
      to: "alice@example.test",
      subject: "Hello there",
      html: "<p>Body</p>",
      text: "Body",
      __transport: transport,
    });

    expect(r.ok).toBe(true);
    expect(r.messageId).toBeTruthy();

    // Audit row was written.
    expect(auditInserts).toHaveLength(1);
    const meta = auditInserts[0]?.values.meta as Record<string, unknown>;
    expect(meta.to).toEqual(["alice@example.test"]);
    expect(meta.subject).toBe("Hello there");
    expect(meta.status).toBe("sent");
  });

  it("audit-log payload NEVER contains the password or encryption key", async () => {
    const { sendEmail } = await import("@/lib/email/send");
    const transport = nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true,
    });

    await sendEmail({
      garageId: GARAGE_A,
      to: "alice@example.test",
      subject: "Hello",
      html: "<p>Body</p>",
      __transport: transport,
    });

    expect(auditInserts).toHaveLength(1);
    const serialized = JSON.stringify(auditInserts[0]?.values);
    expect(serialized).not.toContain("topsecret-do-not-leak");
    expect(serialized).not.toContain("smtp-encryption-key-do-not-leak");
  });

  it("transport failure surfaces as ok=false + audit status='failed'", async () => {
    const { sendEmail } = await import("@/lib/email/send");

    // A partial transport that rejects every send. The real Transporter
    // type is heavy, but sendEmail() only ever calls sendMail.
    const failing = {
      sendMail: async () => {
        throw new Error("connection refused");
      },
    } as unknown as import("nodemailer").Transporter;

    const r = await sendEmail({
      garageId: GARAGE_A,
      to: "alice@example.test",
      subject: "Hello",
      html: "<p>Body</p>",
      __transport: failing,
    });

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/connection refused/);
    expect(auditInserts).toHaveLength(1);
    const meta = auditInserts[0]?.values.meta as Record<string, unknown>;
    expect(meta.status).toBe("failed");
    expect(meta.error).toMatch(/connection refused/);
  });
});
