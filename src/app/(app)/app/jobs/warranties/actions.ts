"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ActionResult } from "../../customers/actions";

const createWarrantySchema = z.object({
  jobId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  description: z.string().min(1).max(500),
  startsOn: z.string().date(),
  expiresOn: z.string().date(),
  mileageLimit: z.coerce.number().int().min(0).optional(),
  startingMileage: z.coerce.number().int().min(0).optional(),
});

const voidWarrantySchema = z.object({
  warrantyId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export async function createWarranty(
  input: z.infer<typeof createWarrantySchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = createWarrantySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  if (parsed.data.expiresOn <= parsed.data.startsOn) {
    return { ok: false, error: "Expiry must be after start date" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("warranties")
    .insert({
      garage_id: session.garageId,
      job_id: parsed.data.jobId,
      vehicle_id: parsed.data.vehicleId,
      description: parsed.data.description,
      starts_on: parsed.data.startsOn,
      expires_on: parsed.data.expiresOn,
      mileage_limit: parsed.data.mileageLimit ?? null,
      starting_mileage: parsed.data.startingMileage ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/jobs");
  return { ok: true, id: data.id };
}

export async function voidWarranty(
  input: z.infer<typeof voidWarrantySchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = voidWarrantySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();

  // Void the warranty
  const { error } = await supabase
    .from("warranties")
    .update({
      voided_at: new Date().toISOString(),
      voided_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.warrantyId);

  if (error) return { ok: false, error: error.message };

  // Write audit log via service role (audit_log INSERT is locked for authenticated)
  // For now, use the authenticated client — the audit_log table needs an INSERT
  // policy for managers. We'll add it.

  revalidatePath("/app/jobs");
  return { ok: true };
}

/**
 * Get active warranties for a vehicle — used during job creation to
 * surface any existing warranty coverage.
 */
export async function getActiveWarranties(vehicleId: string) {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("warranties")
    .select("id, description, starts_on, expires_on, mileage_limit, starting_mileage")
    .eq("vehicle_id", vehicleId)
    .is("voided_at", null)
    .gte("expires_on", new Date().toISOString().split("T")[0]!)
    .order("expires_on", { ascending: true });

  if (error) return { warranties: [], error: error.message };
  return { warranties: data ?? [] };
}
