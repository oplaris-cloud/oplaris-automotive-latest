"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sign-out Server Action — bound to the top-bar form so the response
 * is processed by the React Server Components runtime, which clears
 * the prior route's RSC cache before the redirect lands.
 *
 * The /logout route handler stays in place for any non-form caller
 * (kept as a defensive entrypoint), but the user-facing dropdown form
 * uses this action so cookie clearing + cache invalidation + navigation
 * all happen in one round-trip without relying on a browser-level form
 * submit (which the Radix dropdown portal can interfere with).
 */
export async function signOutAction(): Promise<never> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Session already gone — still bounce to /login.
  }
  // Bust every cached RSC payload so a stale /app render doesn't
  // briefly flash before the redirect resolves.
  revalidatePath("/", "layout");
  redirect("/login");
}
