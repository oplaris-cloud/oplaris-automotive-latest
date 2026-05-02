"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  setImpersonationCookie,
  clearImpersonationCookie,
} from "@/lib/auth/super-admin-cookie";

/**
 * B6.1 — Enter a tenant garage as a super_admin.
 *
 * Two-step:
 *   1. Call `public.super_admin_enter_garage(garageId)` — server-side
 *      validation + audit_log entry.
 *   2. Set the signed `oplaris_impersonate` cookie so subsequent
 *      requests carry `X-Oplaris-Impersonate: <garage_id>`.
 *
 * The redirect to `/admin/garages/<id>` is the landing-with-banner
 * surface where the super_admin can read scoped data.
 */
export async function enterGarage(garageId: string): Promise<void> {
  await requireSuperAdmin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("super_admin_enter_garage", {
    p_garage_id: garageId,
  });
  if (error) {
    throw new Error(`Failed to enter garage: ${error.message}`);
  }

  await setImpersonationCookie(garageId);
  revalidatePath("/admin", "layout");
  redirect(`/admin/garages/${garageId}`);
}

export async function exitImpersonation(): Promise<void> {
  await requireSuperAdmin();
  await clearImpersonationCookie();
  revalidatePath("/admin", "layout");
  redirect("/admin");
}
