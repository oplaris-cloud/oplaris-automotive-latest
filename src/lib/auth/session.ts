import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Staff session shape — derived from the JWT claims populated by the
 * `public.custom_access_token_hook` function in 005_auth_hook.sql.
 *
 * Everything here is server-trusted: the JWT was signed by Supabase Auth
 * and the claims were written by a `security definer` Postgres function
 * that only `supabase_auth_admin` can call. No client path exists to
 * forge any of these values.
 */
export type StaffRole = "manager" | "mot_tester" | "mechanic";

export interface StaffSession {
  userId: string;
  email: string;
  garageId: string;
  role: StaffRole;
}

/**
 * Read the current staff session from the Supabase auth cookies. Returns
 * `null` if not logged in, or if the session is active but has no staff
 * row (e.g. a user whose staff entry was soft-deleted).
 *
 * We use `getUser()` rather than `getSession()` because `getUser()` hits
 * GoTrue and re-validates the JWT — the cookie alone is not enough to
 * trust, and `getSession()` does not re-verify.
 */
export async function getStaffSession(): Promise<StaffSession | null> {
  const supabase = await createSupabaseServerClient();

  // getUser() hits GoTrue and re-validates the JWT — but returns the
  // DB-side user object, which does NOT include the auth-hook's
  // garage_id/role additions. Those live only in the JWT claims.
  // So we use getUser() for validation + identity, then decode the
  // JWT from getSession() for the hook-injected claims.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return null;

  // Decode the JWT payload to read hook-injected claims
  const [, payloadB64] = session.access_token.split(".");
  if (!payloadB64) return null;

  let claims: { app_metadata?: { garage_id?: string; role?: string } };
  try {
    claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const garageId = claims.app_metadata?.garage_id;
  const role = claims.app_metadata?.role as StaffRole | undefined;
  if (!garageId || !role) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    garageId,
    role,
  };
}

/**
 * Require any staff session. Redirects to `/login` if unauthenticated.
 * Use at the top of Server Components or Server Actions that must only
 * run for logged-in staff.
 */
export async function requireStaffSession(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Require one of the listed roles. Redirects unauthenticated users to
 * `/login` and role-mismatched users to `/403`.
 *
 * This is the single enforcement point for role-based authorisation in
 * Server Actions. Do not duplicate these checks in client code — the
 * client cannot be trusted.
 */
export async function requireRole(
  allowed: readonly StaffRole[],
): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (!allowed.includes(session.role)) redirect("/403");
  return session;
}

export const requireManager = () => requireRole(["manager"]);
export const requireManagerOrTester = () => requireRole(["manager", "mot_tester"]);
