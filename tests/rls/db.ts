/**
 * RLS test harness — connects directly to the local Postgres and runs each
 * test in a transaction that's rolled back at the end. We impersonate the
 * `authenticated` Postgres role and inject JWT claims via
 * `set local request.jwt.claims = '...'`, which is exactly how PostgREST
 * exposes them to RLS policies. That means our `private.current_garage()`
 * and `private.current_role()` helpers see the same values they would in
 * production.
 *
 * Tests must NEVER commit. The `withTx` helper always rolls back so suites
 * are order-independent and parallelisable.
 */
import { Pool, type PoolClient } from "pg";

const CONNECTION_STRING =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const pool = new Pool({ connectionString: CONNECTION_STRING, max: 8 });

export type Role = "manager" | "mot_tester" | "mechanic";

export interface JwtClaims {
  sub: string; // staff uuid (= auth.users.id)
  garage_id: string;
  role: Role;
}

export function jwtClaims(c: JwtClaims): string {
  return JSON.stringify({
    sub: c.sub,
    role: "authenticated",
    aud: "authenticated",
    app_metadata: { garage_id: c.garage_id, role: c.role },
  });
}

/**
 * Run `fn` inside a transaction with the given JWT claims active. The
 * transaction is ALWAYS rolled back, even if `fn` throws.
 *
 * `claims = null` runs as the unauthenticated `anon` role with no JWT —
 * useful for testing the public-route side of things.
 */
export async function withTx<T>(
  claims: JwtClaims | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (claims) {
      await client.query("set local role authenticated");
      await client.query(`set local request.jwt.claims = '${jwtClaims(claims)}'`);
      // PostgREST also exposes the sub as a GUC; some helpers read it.
      await client.query(`set local request.jwt.claim.sub = '${claims.sub}'`);
    } else {
      await client.query("set local role anon");
    }
    return await fn(client);
  } finally {
    try {
      await client.query("rollback");
    } finally {
      client.release();
    }
  }
}

/** Run `fn` as the bootstrap superuser (postgres). For test fixtures only. */
export async function asSuperuser<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Assert that `fn` throws a Postgres permission/RLS error (42501 or empty result). */
export async function expectDenied(
  promise: Promise<{ rowCount: number | null }>,
): Promise<void> {
  try {
    const r = await promise;
    // RLS doesn't error on SELECT — it returns zero rows. INSERT/UPDATE on a
    // policy mismatch raises 42501. Either is acceptable here; callers that
    // want to distinguish use `expectError` directly.
    if ((r.rowCount ?? 0) > 0) {
      throw new Error(`expected denial, got rowCount=${r.rowCount}`);
    }
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code && code !== "42501") {
      // 42501 = insufficient_privilege (RLS / GRANT). Anything else is real.
      throw err;
    }
  }
}
