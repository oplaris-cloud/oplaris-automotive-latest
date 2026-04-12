"use server";

import { revalidatePath } from "next/cache";

import { requireManagerOrTester } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normaliseRegistration } from "@/lib/validation/registration";
import {
  createVehicleSchema,
  updateVehicleSchema,
  type CreateVehicleInput,
  type UpdateVehicleInput,
} from "@/lib/validation/schemas";

import type { ActionResult } from "../actions";

// ------------------------------------------------------------------
// Create
// ------------------------------------------------------------------

export async function createVehicle(
  input: CreateVehicleInput,
): Promise<ActionResult> {
  const session = await requireManagerOrTester();
  const parsed = createVehicleSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key) fieldErrors[String(key)] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  const registration = normaliseRegistration(parsed.data.registration);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      garage_id: session.garageId,
      customer_id: parsed.data.customerId,
      registration,
      make: parsed.data.make || null,
      model: parsed.data.model || null,
      year: parsed.data.year ?? null,
      vin: parsed.data.vin || null,
      colour: parsed.data.colour || null,
      mileage: parsed.data.mileage ?? null,
      notes: parsed.data.notes || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        fieldErrors: {
          registration: "A vehicle with this registration already exists",
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

export async function updateVehicle(
  input: UpdateVehicleInput,
): Promise<ActionResult> {
  await requireManagerOrTester();
  const parsed = updateVehicleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed" };
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.registration !== undefined)
    updates.registration = normaliseRegistration(parsed.data.registration);
  if (parsed.data.make !== undefined) updates.make = parsed.data.make || null;
  if (parsed.data.model !== undefined) updates.model = parsed.data.model || null;
  if (parsed.data.year !== undefined) updates.year = parsed.data.year ?? null;
  if (parsed.data.vin !== undefined) updates.vin = parsed.data.vin || null;
  if (parsed.data.colour !== undefined) updates.colour = parsed.data.colour || null;
  if (parsed.data.mileage !== undefined) updates.mileage = parsed.data.mileage ?? null;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes || null;

  if (Object.keys(updates).length === 0) {
    return { ok: true, id: parsed.data.id };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("vehicles")
    .update(updates)
    .eq("id", parsed.data.id);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        fieldErrors: {
          registration: "A vehicle with this registration already exists",
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

export async function softDeleteVehicle(
  vehicleId: string,
): Promise<ActionResult> {
  await requireManagerOrTester();

  if (!vehicleId || !/^[0-9a-f-]{36}$/.test(vehicleId)) {
    return { ok: false, error: "Invalid vehicle ID" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("vehicles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", vehicleId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/vehicles");
  revalidatePath("/app/customers");
  return { ok: true };
}
