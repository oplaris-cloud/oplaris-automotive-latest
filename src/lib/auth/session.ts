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
  /** May be empty for a super_admin who hasn't entered a garage yet. */
  garageId: string;
  roles: StaffRole[];
  /** B6.1 — true when the user is in private.platform_admins. */
  isSuperAdmin: boolean;
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

  let claims: {
    app_metadata?: {
      garage_id?: string;
      role?: string;
      roles?: string[];
      is_super_admin?: boolean;
    };
  };
  try {
    claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const garageId = claims.app_metadata?.garage_id;
  const isSuperAdmin = claims.app_metadata?.is_super_admin === true;

  // Support both new `roles` array and old `role` string (backward compat)
  let roles: StaffRole[];
  if (Array.isArray(claims.app_metadata?.roles) && claims.app_metadata.roles.length > 0) {
    roles = claims.app_metadata.roles as StaffRole[];
  } else if (claims.app_metadata?.role) {
    roles = [claims.app_metadata.role as StaffRole];
  } else {
    roles = [];
  }

  // Super-admins won't have a staff row → no garage_id + no roles.
  // Regular staff still need both.
  if (!isSuperAdmin && (!garageId || roles.length === 0)) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    garageId: garageId ?? "",
    roles,
    isSuperAdmin,
  };
}

/**
 * Require any staff session. Redirects to `/login` if unauthenticated.
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
 * With multi-role support, the user passes if ANY of their roles is in
 * the allowed list.
 */
export async function requireRole(
  allowed: readonly StaffRole[],
): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (!session.roles.some((r) => allowed.includes(r))) redirect("/403");
  return session;
}

export const requireManager = () => requireRole(["manager"]);
export const requireManagerOrTester = () => requireRole(["manager", "mot_tester"]);
export const requireManagerOrMechanic = () => requireRole(["manager", "mechanic"]);

/**
 * B6.1 — gate `/admin/*` routes. A super_admin doesn't need a role
 * assignment. Redirects unauthenticated → /login, non-super_admin → /403.
 */
export async function requireSuperAdmin(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (!session.isSuperAdmin) redirect("/403");
  return session;
}
