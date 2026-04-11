"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Login Server Action.
 *
 * Why minimal:
 *   - Password length + Pwned check happen on *set* (signup, reset) not
 *     on *verify*. At login time we only need to know whether the
 *     supplied credentials are valid.
 *   - We deliberately return the same generic error for unknown-email,
 *     wrong-password and deactivated-account cases to avoid user
 *     enumeration. Supabase already does this for the first two; we
 *     explicitly normalise the deactivated case below.
 *   - Successful login redirects to `?next=` if the proxy stashed one,
 *     otherwise to `/app`. `next` is validated to be a same-origin
 *     absolute path to prevent open-redirect.
 */
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  next: z.string().max(1024).optional(),
});

export interface LoginState {
  error?: string;
}

const GENERIC_ERROR = "Invalid email or password.";

function safeNext(next: string | undefined): string {
  if (!next) return "/app";
  // Must be same-origin path. Reject absolute URLs, protocol-relative
  // (`//evil.com`), and anything that doesn't start with `/app`.
  if (!next.startsWith("/") || next.startsWith("//")) return "/app";
  if (!next.startsWith("/app")) return "/app";
  return next;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.session) {
    return { error: GENERIC_ERROR };
  }

  // The session is now set via cookies (the SSR client wrote them).
  // The auth hook writes garage_id + role into the JWT claims, but the
  // user object from signInWithPassword reflects the DB state (not the
  // hook additions). Decode the JWT to check the claims.
  const [, payload] = data.session.access_token.split(".");
  const claims = JSON.parse(
    Buffer.from(payload!, "base64url").toString("utf8"),
  ) as { app_metadata?: { garage_id?: string; role?: string } };
  const garageId = claims.app_metadata?.garage_id;
  const role = claims.app_metadata?.role;
  if (!garageId || !role) {
    await supabase.auth.signOut();
    return { error: GENERIC_ERROR };
  }

  redirect(safeNext(parsed.data.next));
}
