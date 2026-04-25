"use server";

import { revalidatePath } from "next/cache";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalisePhone, PhoneParseError } from "@/lib/validation/phone";
import {
  createCustomerSchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from "@/lib/validation/schemas";

export interface ActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

// ------------------------------------------------------------------
// Create
// ------------------------------------------------------------------

export async function createCustomer(
  input: CreateCustomerInput,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key) fieldErrors[String(key)] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  let phone: string;
  try {
    phone = normalisePhone(parsed.data.phone);
  } catch (e) {
    if (e instanceof PhoneParseError) {
      return { ok: false, fieldErrors: { phone: "Invalid UK phone number" } };
    }
    throw e;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      garage_id: session.garageId,
      full_name: parsed.data.fullName,
      phone,
      email: parsed.data.email || null,
      address_line1: parsed.data.addressLine1 || null,
      address_line2: parsed.data.addressLine2 || null,
      postcode: parsed.data.postcode || null,
      notes: parsed.data.notes || null,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation (deferred phone constraint)
    if (error.code === "23505") {
      return {
        ok: false,
        fieldErrors: {
          phone: "A customer with this phone number already exists",
        },
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/app/customers");
  return { ok: true, id: data.id };
}

// ------------------------------------------------------------------
// Update
// ------------------------------------------------------------------

export async function updateCustomer(
  input: UpdateCustomerInput,
): Promise<ActionResult> {
  await requireManager();
  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed" };
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.fullName !== undefined) updates.full_name = parsed.data.fullName;
  if (parsed.data.phone !== undefined) {
    try {
      updates.phone = normalisePhone(parsed.data.phone);
    } catch (e) {
      if (e instanceof PhoneParseError) {
        return { ok: false, fieldErrors: { phone: "Invalid UK phone number" } };
      }
      throw e;
    }
  }
  if (parsed.data.email !== undefined) updates.email = parsed.data.email || null;
  if (parsed.data.addressLine1 !== undefined)
    updates.address_line1 = parsed.data.addressLine1 || null;
  if (parsed.data.addressLine2 !== undefined)
    updates.address_line2 = parsed.data.addressLine2 || null;
  if (parsed.data.postcode !== undefined)
    updates.postcode = parsed.data.postcode || null;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes || null;

  if (Object.keys(updates).length === 0) {
    return { ok: true, id: parsed.data.id };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("customers")
    .update(updates)
    .eq("id", parsed.data.id);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        fieldErrors: {
          phone: "A customer with this phone number already exists",
        },
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/app/customers");
  return { ok: true, id: parsed.data.id };
}

// ------------------------------------------------------------------
// Soft-delete
// ------------------------------------------------------------------

export async function softDeleteCustomer(
  customerId: string,
): Promise<ActionResult> {
  await requireManager();

  if (!customerId || !/^[0-9a-f-]{36}$/.test(customerId)) {
    return { ok: false, error: "Invalid customer ID" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", customerId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/customers");
  return { ok: true };
}
