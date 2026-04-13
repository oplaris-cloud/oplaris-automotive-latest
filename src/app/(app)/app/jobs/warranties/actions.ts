"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ActionResult } from "../../customers/actions";

// ------------------------------------------------------------------
// Schemas
// ------------------------------------------------------------------

const createStockWarrantySchema = z.object({
  stockItemId: z.string().uuid(),
  supplier: z.string().min(1).max(200),
  purchaseDate: z.string().date(),
  expiryDate: z.string().date(),
  invoiceReference: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

const updateWarrantySchema = z.object({
  warrantyId: z.string().uuid(),
  supplier: z.string().min(1).max(200).optional(),
  purchaseDate: z.string().date().optional(),
  expiryDate: z.string().date().optional(),
  invoiceReference: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

const claimWarrantySchema = z.object({
  warrantyId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

const resolveClaimSchema = z.object({
  warrantyId: z.string().uuid(),
  resolution: z.string().min(1).max(500),
  status: z.enum(["resolved", "rejected"]),
});

// ------------------------------------------------------------------
// Create a stock warranty (supplier warranty on a purchased stock item)
// ------------------------------------------------------------------

export async function createStockWarranty(
  input: z.infer<typeof createStockWarrantySchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = createStockWarrantySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  if (parsed.data.expiryDate <= parsed.data.purchaseDate) {
    return { ok: false, error: "Expiry must be after purchase date" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("warranties")
    .insert({
      garage_id: session.garageId,
      stock_item_id: parsed.data.stockItemId,
      supplier: parsed.data.supplier,
      purchase_date: parsed.data.purchaseDate,
      expiry_date: parsed.data.expiryDate,
      invoice_reference: parsed.data.invoiceReference ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/warranties");
  revalidatePath("/app/stock");
  return { ok: true, id: data.id };
}

// ------------------------------------------------------------------
// Update a warranty
// ------------------------------------------------------------------

export async function updateWarranty(
  input: z.infer<typeof updateWarrantySchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = updateWarrantySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const updates: Record<string, unknown> = {};
  if (parsed.data.supplier) updates.supplier = parsed.data.supplier;
  if (parsed.data.purchaseDate) updates.purchase_date = parsed.data.purchaseDate;
  if (parsed.data.expiryDate) updates.expiry_date = parsed.data.expiryDate;
  if (parsed.data.invoiceReference !== undefined) updates.invoice_reference = parsed.data.invoiceReference || null;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes || null;

  if (Object.keys(updates).length === 0) return { ok: true };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("warranties")
    .update(updates)
    .eq("id", parsed.data.warrantyId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/warranties");
  return { ok: true };
}

// ------------------------------------------------------------------
// Delete a warranty
// ------------------------------------------------------------------

export async function deleteWarranty(warrantyId: string): Promise<ActionResult> {
  await requireManager();
  if (!warrantyId || !/^[0-9a-f-]{36}$/.test(warrantyId)) {
    return { ok: false, error: "Invalid ID" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("warranties")
    .delete()
    .eq("id", warrantyId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/warranties");
  return { ok: true };
}

// ------------------------------------------------------------------
// Claim a warranty (going back to supplier for a faulty part)
// ------------------------------------------------------------------

export async function claimWarranty(
  input: z.infer<typeof claimWarrantySchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = claimWarrantySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("warranties")
    .update({
      claim_status: "claimed",
      claim_reason: parsed.data.reason,
      claim_date: new Date().toISOString(),
    })
    .eq("id", parsed.data.warrantyId)
    .eq("claim_status", "none");

  if (error) return { ok: false, error: error.message };

  const { error: auditErr } = await supabase.rpc("write_audit_log", {
    p_action: "claim_warranty",
    p_target_table: "warranties",
    p_target_id: parsed.data.warrantyId,
    p_meta: { reason: parsed.data.reason },
  });
  if (auditErr) {
    console.error("[claim_warranty] audit log write failed:", auditErr.message);
  }

  revalidatePath("/app/warranties");
  return { ok: true };
}

// ------------------------------------------------------------------
// Resolve or reject a warranty claim
// ------------------------------------------------------------------

export async function resolveWarrantyClaim(
  input: z.infer<typeof resolveClaimSchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = resolveClaimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("warranties")
    .update({
      claim_status: parsed.data.status,
      claim_resolution: parsed.data.resolution,
    })
    .eq("id", parsed.data.warrantyId)
    .eq("claim_status", "claimed");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/warranties");
  return { ok: true };
}
