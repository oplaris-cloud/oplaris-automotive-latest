"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager, requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ActionResult } from "../../customers/actions";

const createStockItemSchema = z.object({
  sku: z.string().max(50).optional().or(z.literal("")),
  description: z.string().min(1).max(500),
  quantityOnHand: z.coerce.number().int().min(0).default(0),
  reorderPoint: z.coerce.number().int().min(0).optional(),
  unitCostPence: z.coerce.number().int().min(0).optional(),
  location: z.string().max(100).optional().or(z.literal("")),
});

const updateStockItemSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().max(50).optional().or(z.literal("")),
  description: z.string().min(1).max(500).optional(),
  reorderPoint: z.coerce.number().int().min(0).optional(),
  unitCostPence: z.coerce.number().int().min(0).optional(),
  location: z.string().max(100).optional().or(z.literal("")),
});

const stockMovementSchema = z.object({
  stockItemId: z.string().uuid(),
  delta: z.coerce.number().int(), // negative = used, positive = restock
  jobId: z.string().uuid().optional(),
  reason: z.string().max(500).optional().or(z.literal("")),
});

// ------------------------------------------------------------------
// CRUD
// ------------------------------------------------------------------

export async function createStockItem(
  input: z.infer<typeof createStockItemSchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = createStockItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_items")
    .insert({
      garage_id: session.garageId,
      sku: parsed.data.sku || null,
      description: parsed.data.description,
      quantity_on_hand: parsed.data.quantityOnHand,
      reorder_point: parsed.data.reorderPoint ?? null,
      unit_cost_pence: parsed.data.unitCostPence ?? null,
      location: parsed.data.location || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A stock item with this SKU already exists" };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/app/settings/stock");
  return { ok: true, id: data.id };
}

export async function updateStockItem(
  input: z.infer<typeof updateStockItemSchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = updateStockItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const updates: Record<string, unknown> = {};
  if (parsed.data.sku !== undefined) updates.sku = parsed.data.sku || null;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.reorderPoint !== undefined) updates.reorder_point = parsed.data.reorderPoint;
  if (parsed.data.unitCostPence !== undefined) updates.unit_cost_pence = parsed.data.unitCostPence;
  if (parsed.data.location !== undefined) updates.location = parsed.data.location || null;

  if (Object.keys(updates).length === 0) return { ok: true, id: parsed.data.id };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("stock_items")
    .update(updates)
    .eq("id", parsed.data.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/settings/stock");
  return { ok: true, id: parsed.data.id };
}

// ------------------------------------------------------------------
// Stock movements (append-only)
// ------------------------------------------------------------------

export async function recordStockMovement(
  input: z.infer<typeof stockMovementSchema>,
): Promise<ActionResult> {
  await requireStaffSession();
  const parsed = stockMovementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  if (parsed.data.delta === 0) return { ok: false, error: "Delta cannot be zero" };

  const supabase = await createSupabaseServerClient();

  // One atomic RPC: inserts the movement row and updates
  // `stock_items.quantity_on_hand` in a single transaction, protected by
  // the `stock_items_quantity_non_negative` CHECK constraint. Fixes the
  // read-then-write race the pre-deploy audit flagged.
  const { error } = await supabase.rpc("apply_stock_movement", {
    p_stock_item_id: parsed.data.stockItemId,
    p_delta: parsed.data.delta,
    p_job_id: parsed.data.jobId ?? null,
    p_reason: parsed.data.reason || null,
  });

  if (error) {
    if (error.code === "23514") {
      return {
        ok: false,
        error: "This movement would take stock below zero. Check the quantity.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/app/settings/stock");
  return { ok: true };
}

// ------------------------------------------------------------------
// Stock locations
// ------------------------------------------------------------------

export async function getStockLocations(): Promise<{ id: string; name: string }[]> {
  await requireStaffSession();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("stock_locations")
    .select("id, name")
    .order("name");
  return data ?? [];
}

export async function createStockLocation(name: string): Promise<ActionResult> {
  const session = await requireManager();
  if (!name.trim()) return { ok: false, error: "Name is required" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_locations")
    .insert({ garage_id: session.garageId, name: name.trim() })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Location already exists" };
    return { ok: false, error: error.message };
  }

  revalidatePath("/app/stock");
  return { ok: true, id: data.id };
}

// ------------------------------------------------------------------
// Dashboard query: items below reorder point
// ------------------------------------------------------------------

export async function getLowStockItems() {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("stock_items")
    .select("id, sku, description, quantity_on_hand, reorder_point, location")
    .not("reorder_point", "is", null)
    .order("quantity_on_hand", { ascending: true });

  if (error) return { items: [], error: error.message };

  // Filter client-side (Supabase doesn't support column-to-column comparison in filters)
  const low = (data ?? []).filter(
    (item) => item.reorder_point != null && item.quantity_on_hand <= item.reorder_point,
  );

  return { items: low };
}
