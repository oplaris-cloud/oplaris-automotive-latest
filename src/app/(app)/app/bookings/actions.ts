"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normaliseRegistration } from "@/lib/validation/registration";

import type { ActionResult } from "../customers/actions";

const promoteSchema = z.object({
  bookingId: z.string().uuid(),
});

/**
 * Promote a kiosk/online booking to a full job.
 * - Find or create customer by phone (dedup)
 * - Find or create vehicle by registration
 * - Create job via create_job RPC
 * - Link booking to job
 */
export async function promoteBookingToJob(
  input: z.infer<typeof promoteSchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = promoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();

  // 1. Get the booking
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", parsed.data.bookingId)
    .is("job_id", null)
    .single();

  if (bErr || !booking) {
    return { ok: false, error: "Booking not found or already promoted" };
  }

  // 2. Find or create customer by phone
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", booking.customer_phone)
    .eq("garage_id", session.garageId)
    .is("deleted_at", null)
    .maybeSingle();

  let customerId: string;
  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const { data: newCustomer, error: cErr } = await supabase
      .from("customers")
      .insert({
        garage_id: session.garageId,
        full_name: booking.customer_name,
        phone: booking.customer_phone,
        email: booking.customer_email || null,
      })
      .select("id")
      .single();
    if (cErr || !newCustomer) return { ok: false, error: cErr?.message ?? "Failed to create customer" };
    customerId = newCustomer.id;
  }

  // 3. Find or create vehicle by registration
  const reg = normaliseRegistration(booking.registration);
  const { data: existingVehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("registration", reg)
    .eq("garage_id", session.garageId)
    .is("deleted_at", null)
    .maybeSingle();

  let vehicleId: string;
  if (existingVehicle) {
    vehicleId = existingVehicle.id;
  } else {
    const { data: newVehicle, error: vErr } = await supabase
      .from("vehicles")
      .insert({
        garage_id: session.garageId,
        customer_id: customerId,
        registration: reg,
        make: booking.make || null,
        model: booking.model || null,
      })
      .select("id")
      .single();
    if (vErr || !newVehicle) return { ok: false, error: vErr?.message ?? "Failed to create vehicle" };
    vehicleId = newVehicle.id;
  }

  // 4. Create job via RPC
  const { data: jobId, error: jErr } = await supabase.rpc("create_job", {
    p_customer_id: customerId,
    p_vehicle_id: vehicleId,
    p_description: `${booking.service.toUpperCase()} booking${booking.notes ? `: ${booking.notes}` : ""}`,
    p_source: booking.source,
    p_bay_id: null,
    p_estimated_ready_at: booking.preferred_date ? new Date(booking.preferred_date).toISOString() : null,
  });

  if (jErr) return { ok: false, error: jErr.message };

  // 5. Link booking to job
  await supabase
    .from("bookings")
    .update({ job_id: jobId })
    .eq("id", parsed.data.bookingId);

  revalidatePath("/app/bookings");
  revalidatePath("/app/jobs");
  return { ok: true, id: jobId as string };
}
