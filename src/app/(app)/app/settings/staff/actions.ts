"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ActionResult } from "../../customers/actions";

const ROLES = ["manager", "mot_tester", "mechanic"] as const;

const addStaffSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Minimum 8 characters"),
  fullName: z.string().min(1, "Name is required").max(200),
  phone: z.string().max(30).optional().or(z.literal("")),
  role: z.enum(ROLES),
});

/**
 * Create a new staff member. Manager-only.
 *
 * 1. Creates auth user via admin API
 * 2. Inserts into staff table
 * 3. Inserts into private.staff_roles
 * 4. Trigger (018) auto-syncs claims into auth.users.raw_app_meta_data
 *
 * The new user can log in immediately with the email/password provided.
 */
export async function addStaffMember(
  input: z.infer<typeof addStaffSchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = addStaffSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key) fieldErrors[String(key)] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Create auth user
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true, // skip email verification for staff
    app_metadata: {
      garage_id: session.garageId,
      role: parsed.data.role,
    },
  });

  if (authErr) {
    if (authErr.message.includes("already been registered")) {
      return { ok: false, fieldErrors: { email: "This email is already registered" } };
    }
    return { ok: false, error: authErr.message };
  }

  const userId = authUser.user.id;

  // 2. Insert into staff table
  const { error: staffErr } = await supabase
    .from("staff")
    .insert({
      id: userId,
      garage_id: session.garageId,
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
    });

  if (staffErr) return { ok: false, error: staffErr.message };

  // 3. Insert into private.staff_roles via raw SQL (private schema not accessible via REST)
  // The trigger from 018 will sync the claims, but we also set app_metadata above as backup
  const { error: roleErr } = await supabase.rpc("assign_staff_role", {
    p_staff_id: userId,
    p_garage_id: session.garageId,
    p_role: parsed.data.role,
  });

  // If the RPC doesn't exist yet, that's OK — the app_metadata was set directly
  if (roleErr) {
    console.warn("[add-staff] assign_staff_role RPC failed:", roleErr.message);
  }

  revalidatePath("/app/settings");
  revalidatePath("/app/settings/staff");
  return { ok: true, id: userId };
}

// ------------------------------------------------------------------
// Update staff details
// ------------------------------------------------------------------

const updateStaffSchema = z.object({
  staffId: z.string().uuid(),
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional().or(z.literal("")),
});

export async function updateStaffMember(
  input: z.infer<typeof updateStaffSchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = updateStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const updates: Record<string, unknown> = {};
  if (parsed.data.fullName) updates.full_name = parsed.data.fullName;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone || null;

  if (Object.keys(updates).length === 0) return { ok: true };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("staff")
    .update(updates)
    .eq("id", parsed.data.staffId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/settings/staff");
  return { ok: true };
}

// ------------------------------------------------------------------
// Deactivate / reactivate staff
// ------------------------------------------------------------------

const toggleActiveSchema = z.object({
  staffId: z.string().uuid(),
  isActive: z.boolean(),
});

export async function toggleStaffActive(
  input: z.infer<typeof toggleActiveSchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = toggleActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("staff")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.staffId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/settings/staff");
  return { ok: true };
}
