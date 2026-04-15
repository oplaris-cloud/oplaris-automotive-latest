"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import {
  assertPasswordNotPwned,
  PwnedPasswordsError,
} from "@/lib/security/pwned-passwords";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ActionResult } from "../../customers/actions";

const ROLES = ["manager", "mot_tester", "mechanic"] as const;

const addStaffSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Minimum 8 characters"),
  fullName: z.string().min(1, "Name is required").max(200),
  phone: z.string().max(30).optional().or(z.literal("")),
  roles: z.array(z.enum(ROLES)).min(1, "At least one role is required"),
});

/**
 * Create a new staff member. Manager-only.
 *
 * 1. Creates auth user via admin API
 * 2. Inserts into staff table with roles array
 * 3. Inserts into private.staff_roles (one row per role)
 * 4. Trigger (018/025) auto-syncs claims into auth.users.raw_app_meta_data
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

  try {
    await assertPasswordNotPwned(parsed.data.password);
  } catch (err) {
    if (err instanceof PwnedPasswordsError) {
      return {
        ok: false,
        fieldErrors: {
          password:
            "This password has appeared in a known data breach. Please choose a different one.",
        },
      };
    }
    console.error("[add-staff] pwned-passwords check failed:", err);
    return {
      ok: false,
      error:
        "Unable to verify password safety right now. Please try again in a moment.",
    };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Create auth user with roles array in app_metadata
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: {
      garage_id: session.garageId,
      roles: parsed.data.roles,
      role: parsed.data.roles[0], // backward compat
    },
  });

  if (authErr) {
    if (authErr.message.includes("already been registered")) {
      return { ok: false, fieldErrors: { email: "This email is already registered" } };
    }
    return { ok: false, error: authErr.message };
  }

  const userId = authUser.user.id;

  // 2. Insert into staff table with roles array
  const { error: staffErr } = await supabase
    .from("staff")
    .insert({
      id: userId,
      garage_id: session.garageId,
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      roles: parsed.data.roles,
    });

  if (staffErr) return { ok: false, error: staffErr.message };

  // 3. Insert into private.staff_roles (one row per role) via admin SQL
  for (const role of parsed.data.roles) {
    const { error: roleErr } = await supabase.rpc("assign_staff_role", {
      p_staff_id: userId,
      p_garage_id: session.garageId,
      p_role: role,
    });
    if (roleErr) {
      console.warn("[add-staff] assign_staff_role RPC failed for", role, ":", roleErr.message);
    }
  }

  revalidatePath("/app/settings");
  revalidatePath("/app/settings/staff");
  return { ok: true, id: userId };
}

// ------------------------------------------------------------------
// Update staff details (including roles)
// ------------------------------------------------------------------

const updateStaffSchema = z.object({
  staffId: z.string().uuid(),
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional().or(z.literal("")),
  roles: z.array(z.enum(ROLES)).min(1, "At least one role is required").optional(),
});

export async function updateStaffMember(
  input: z.infer<typeof updateStaffSchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = updateStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const adminSupabase = createSupabaseAdminClient();

  // Update basic fields on staff table
  const updates: Record<string, unknown> = {};
  if (parsed.data.fullName) updates.full_name = parsed.data.fullName;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone || null;
  if (parsed.data.roles) updates.roles = parsed.data.roles;

  if (Object.keys(updates).length > 0) {
    // Use admin client since staff table INSERT/UPDATE is revoked for authenticated
    const { error } = await adminSupabase
      .from("staff")
      .update(updates)
      .eq("id", parsed.data.staffId);

    if (error) return { ok: false, error: error.message };
  }

  // If roles changed, also update private.staff_roles + auth.users.raw_app_meta_data
  if (parsed.data.roles) {
    // Delete existing roles and re-insert
    const { error: delErr } = await adminSupabase.rpc("replace_staff_roles", {
      p_staff_id: parsed.data.staffId,
      p_garage_id: session.garageId,
      p_roles: parsed.data.roles,
    });

    if (delErr) {
      console.warn("[update-staff] replace_staff_roles RPC failed:", delErr.message);
      // Fallback: update auth directly
    }

    // Update auth user app_metadata
    await adminSupabase.auth.admin.updateUserById(parsed.data.staffId, {
      app_metadata: {
        garage_id: session.garageId,
        roles: parsed.data.roles,
        role: parsed.data.roles[0],
      },
    });
  }

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
