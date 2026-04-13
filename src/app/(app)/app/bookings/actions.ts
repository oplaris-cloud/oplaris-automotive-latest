"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normaliseRegistration } from "@/lib/validation/registration";

import type { ActionResult } from "../customers/actions";

// ------------------------------------------------------------------
// Staff availability (for tech assignment modal)
// ------------------------------------------------------------------

export interface StaffAvailability {
  id: string;
  full_name: string;
  avatar_url: string | null;
  isBusy: boolean;
  currentJobNumber: string | null;
}

export async function getStaffAvailability(): Promise<StaffAvailability[]> {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  // Get all active staff at the garage
  // Try with avatar_url first; fall back without it if the column doesn't exist yet
  let staff: { id: string; full_name: string; avatar_url?: string | null }[] | null = null;
  const { data: staffData, error: staffErr } = await supabase
    .from("staff")
    .select("id, full_name, avatar_url")
    .eq("is_active", true)
    .order("full_name");

  if (staffErr || !staffData) {
    // avatar_url column may not exist — retry without it
    const { data: fallbackData } = await supabase
      .from("staff")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name");
    staff = fallbackData?.map((s) => ({ ...s, avatar_url: null })) ?? null;
  } else {
    staff = staffData;
  }

  if (!staff) return [];

  // Get active work logs (ended_at IS NULL)
  const { data: activeLogs } = await supabase
    .from("work_logs")
    .select("staff_id, jobs!job_id ( job_number )")
    .is("ended_at", null);

  const busyMap = new Map<string, string>();
  for (const log of activeLogs ?? []) {
    const job = Array.isArray(log.jobs) ? log.jobs[0] : log.jobs;
    busyMap.set(log.staff_id, (job as { job_number: string } | null)?.job_number ?? "");
  }

  return staff.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    avatar_url: (s as { avatar_url?: string | null }).avatar_url ?? null,
    isBusy: busyMap.has(s.id),
    currentJobNumber: busyMap.get(s.id) ?? null,
  }));
}

// ------------------------------------------------------------------
// Dismiss (delete) a check-in
// ------------------------------------------------------------------

export async function dismissCheckin(bookingId: string): Promise<ActionResult> {
  await requireManager();

  if (!bookingId || !/^[0-9a-f-]{36}$/.test(bookingId)) {
    return { ok: false, error: "Invalid ID" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", bookingId)
    .is("job_id", null); // only delete unpromoted

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/bookings");
  return { ok: true };
}

const promoteSchema = z.object({
  bookingId: z.string().uuid(),
  assignedStaffId: z.string().uuid().optional(),
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

  // 5. Set status to checked_in (RPC creates as draft)
  await supabase
    .from("jobs")
    .update({ status: "checked_in" })
    .eq("id", jobId);

  // 6. Link booking to job
  await supabase
    .from("bookings")
    .update({ job_id: jobId })
    .eq("id", parsed.data.bookingId);

  // 7. Optionally assign a tech
  if (parsed.data.assignedStaffId) {
    await supabase.from("job_assignments").insert({
      job_id: jobId as string,
      staff_id: parsed.data.assignedStaffId,
      garage_id: session.garageId,
    });
  }

  revalidatePath("/app/bookings");
  revalidatePath("/app/jobs");
  return { ok: true, id: jobId as string };
}
