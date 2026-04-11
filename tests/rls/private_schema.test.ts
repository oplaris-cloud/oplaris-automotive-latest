/**
 * The `private` schema must NEVER be reachable from the `authenticated` or
 * `anon` roles. Roles, status codes, rate-limit counters and the
 * job-number sequence all live there. If any of these queries succeed,
 * vibe-security audit fails immediately.
 */
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { A_MANAGER, GARAGE_A } from "./fixtures";

afterAll(async () => {
  await pool.end();
});

const aManager = { sub: A_MANAGER, garage_id: GARAGE_A, role: "manager" as const };

describe("private schema lockdown", () => {
  it("authenticated cannot SELECT from private.staff_roles", async () => {
    await withTx(aManager, async (c) => {
      await expect(c.query("select * from private.staff_roles")).rejects.toMatchObject({
        code: "42501",
      });
    });
  });

  it("authenticated cannot SELECT from private.status_codes", async () => {
    await withTx(aManager, async (c) => {
      await expect(c.query("select * from private.status_codes")).rejects.toMatchObject({
        code: "42501",
      });
    });
  });

  it("authenticated cannot SELECT from private.rate_limits", async () => {
    await withTx(aManager, async (c) => {
      await expect(c.query("select * from private.rate_limits")).rejects.toMatchObject({
        code: "42501",
      });
    });
  });

  it("authenticated cannot CALL private.next_job_number()", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query("select private.next_job_number($1)", [GARAGE_A]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("authenticated cannot CALL private.purge_customer()", async () => {
    await withTx(aManager, async (c) => {
      await expect(
        c.query("select private.purge_customer($1)", [
          "00000000-0000-0000-0000-000000000000",
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("anon role cannot reach private at all", async () => {
    await withTx(null, async (c) => {
      await expect(c.query("select * from private.staff_roles")).rejects.toMatchObject({
        code: "42501",
      });
    });
  });
});
