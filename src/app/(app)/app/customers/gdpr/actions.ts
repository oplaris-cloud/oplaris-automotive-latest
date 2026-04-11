"use server";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin"; // used by restoreCustomer

/**
 * Export all data for a customer (GDPR subject access request).
 *
 * Uses the SECURITY DEFINER `private.customer_data_export` function
 * which aggregates across all tables. Called via the service-role
 * client because the function is in the private schema.
 *
 * Returns the JSON as a string for download.
 */
export async function exportCustomerData(
  customerId: string,
): Promise<{ json: string } | { error: string }> {
  await requireManager();

  if (!customerId || !/^[0-9a-f-]{36}$/.test(customerId)) {
    return { error: "Invalid customer ID" };
  }

  // Verify the customer belongs to this garage (via RLS)
  const supabase = await createSupabaseServerClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .single();

  if (!customer) return { error: "Customer not found" };

  // Call the public wrapper (SECURITY DEFINER, manager-only role check inside)
  const { data, error } = await supabase.rpc("customer_data_export", {
    p_customer_id: customerId,
  });

  if (error) return { error: error.message };

  // Audit log
  await supabase.rpc("write_audit_log", {
    p_action: "export_customer",
    p_target_table: "customers",
    p_target_id: customerId,
  });

  return { json: JSON.stringify(data, null, 2) };
}

/**
 * Get paginated audit log entries (manager-only, read-only).
 */
export async function getAuditLog(
  opts: { page?: number; perPage?: number } = {},
) {
  await requireManager();
  const page = opts.page ?? 1;
  const perPage = Math.min(opts.perPage ?? 50, 100);
  const offset = (page - 1) * perPage;

  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("audit_log")
    .select("id, action, target_table, target_id, meta, created_at, staff:staff!actor_staff_id ( full_name )", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  return {
    entries: data ?? [],
    total: count ?? 0,
    page,
    perPage,
    error: error?.message,
  };
}

/**
 * Soft-delete with 30-day recovery. Records the action in the audit log.
 * The customer reappears in the "recently deleted" view for 30 days,
 * after which the nightly `hard_delete_soft_deleted` cron purges them.
 */
export async function softDeleteWithAudit(customerId: string) {
  await requireManager();

  if (!customerId || !/^[0-9a-f-]{36}$/.test(customerId)) {
    return { error: "Invalid customer ID" };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", customerId);

  if (error) return { error: error.message };

  await supabase.rpc("write_audit_log", {
    p_action: "soft_delete_customer",
    p_target_table: "customers",
    p_target_id: customerId,
  });

  return { ok: true };
}

/**
 * Restore a soft-deleted customer within the 30-day window.
 */
export async function restoreCustomer(customerId: string) {
  const session = await requireManager();

  if (!customerId || !/^[0-9a-f-]{36}$/.test(customerId)) {
    return { error: "Invalid customer ID" };
  }

  // Admin client because RLS select policy filters out deleted_at != null.
  // Scoped to the manager's garage to prevent cross-tenant restore.
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("customers")
    .update({ deleted_at: null })
    .eq("id", customerId)
    .eq("garage_id", session.garageId);

  if (error) return { error: error.message };

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("write_audit_log", {
    p_action: "restore_customer",
    p_target_table: "customers",
    p_target_id: customerId,
  });

  return { ok: true };
}
