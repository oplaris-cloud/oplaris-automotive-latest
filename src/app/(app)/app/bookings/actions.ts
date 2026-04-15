"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager, requireRole } from "@/lib/auth/session";
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
  /** P46 — clickable link target for the busy-tech "currently working" line. */
  currentJobId: string | null;
  /** P53 — role membership, for the change-handler palette grouping + pickers. */
  roles: string[];
}

export async function getStaffAvailability(): Promise<StaffAvailability[]> {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  // P46.2 — only mechanic + mot_tester roles count as "technicians".
  // Managers shouldn't appear in the assignment grid even though they're
  // active staff at the garage.
  type StaffRow = {
    id: string;
    full_name: string;
    avatar_url?: string | null;
    roles: string[] | null;
  };
  let staff: StaffRow[] | null = null;
  const { data: staffData, error: staffErr } = await supabase
    .from("staff")
    .select("id, full_name, avatar_url, roles")
    .eq("is_active", true)
    .order("full_name");

  if (staffErr || !staffData) {
    const { data: fallbackData } = await supabase
      .from("staff")
      .select("id, full_name, roles")
      .eq("is_active", true)
      .order("full_name");
    staff =
      (fallbackData as Omit<StaffRow, "avatar_url">[] | null)?.map((s) => ({
        ...s,
        avatar_url: null,
      })) ?? null;
  } else {
    staff = staffData as StaffRow[];
  }

  if (!staff) return [];

  const technicians = staff.filter((s) => {
    const roles = s.roles ?? [];
    return roles.includes("mechanic") || roles.includes("mot_tester");
  });

  // Active work logs → who's busy + on which job. We grab job_id too so
  // the modal can render a link, not just a job number text.
  const { data: activeLogs } = await supabase
    .from("work_logs")
    .select("staff_id, job_id, jobs!job_id ( job_number )")
    .is("ended_at", null);

  const busyMap = new Map<string, { jobId: string; jobNumber: string }>();
  for (const log of activeLogs ?? []) {
    const job = Array.isArray(log.jobs) ? log.jobs[0] : log.jobs;
    busyMap.set(log.staff_id, {
      jobId: log.job_id,
      jobNumber: (job as { job_number: string } | null)?.job_number ?? "",
    });
  }

  return technicians.map((s) => {
    const busy = busyMap.get(s.id);
    return {
      id: s.id,
      full_name: s.full_name,
      avatar_url: s.avatar_url ?? null,
      isBusy: !!busy,
      currentJobNumber: busy?.jobNumber ?? null,
      currentJobId: busy?.jobId ?? null,
      roles: s.roles ?? [],
    };
  });
}


// ------------------------------------------------------------------
// Dismiss (delete) a check-in
// ------------------------------------------------------------------

export async function dismissCheckin(bookingId: string): Promise<ActionResult> {
  await requireManager();

  if (!bookingId || !/^[0-9a-f-]{36}$/.test(bookingId)) {
    return { ok: false, error: "Invalid ID" };
  }

  // P47 soft-delete (managers only). Hard delete is handled by the
  // scheduled GDPR purge — not by this action. Refuses to dismiss a
  // booking that has already been promoted to a job (job_id IS NOT NULL).
  const supabase = await createSupabaseServerClient();
  const { data: updated, error } = await supabase
    .from("bookings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", bookingId)
    .is("job_id", null)
    .is("deleted_at", null)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "Check-in cannot be dismissed (already converted or removed)",
    };
  }

  // Audit trail — manager + booking_id + timestamp via the existing helper.
  await supabase.rpc("write_audit_log", {
    p_action: "dismiss_checkin",
    p_target_table: "bookings",
    p_target_id: bookingId,
  });

  revalidatePath("/app/bookings");
  revalidatePath("/app/tech");
  return { ok: true };
}

// ------------------------------------------------------------------
// P47.2 — MOT tester self-starts an MOT check-in
// ------------------------------------------------------------------

/**
 * Converts an MOT-service check-in to an in-progress MOT job owned by
 * the calling tester. Mirrors the manager `promoteBookingToJob` path but
 * skips the tech picker — the tester is the tech.
 */
export async function startMotFromCheckIn(
  bookingId: string,
): Promise<ActionResult> {
  await requireRole(["manager", "mot_tester"]);

  if (!bookingId || !/^[0-9a-f-]{36}$/.test(bookingId)) {
    return { ok: false, error: "Invalid ID" };
  }

  // Whole flow lives in a SECURITY DEFINER RPC (migration 028) so the
  // tester can create a job + assignment without global INSERT rights on
  // those tables. Authorisation is re-checked inside the function.
  const supabase = await createSupabaseServerClient();
  const { data: jobId, error } = await supabase.rpc(
    "start_mot_from_checkin",
    { p_booking_id: bookingId },
  );

  if (error) return { ok: false, error: error.message };
  if (!jobId) return { ok: false, error: "Could not start MOT" };

  revalidatePath("/app/bookings");
  revalidatePath("/app");
  revalidatePath("/app/tech");
  revalidatePath("/app/jobs");
  return { ok: true, id: jobId as string };
}

// ------------------------------------------------------------------
// Mechanic / manager self-start a non-MOT check-in (electrical,
// maintenance, passback). Wraps migration 030's SECURITY DEFINER RPC.
// ------------------------------------------------------------------

export async function startWorkFromCheckIn(
  bookingId: string,
): Promise<ActionResult> {
  await requireRole(["manager", "mechanic"]);

  if (!bookingId || !/^[0-9a-f-]{36}$/.test(bookingId)) {
    return { ok: false, error: "Invalid ID" };
  }

  const supabase = await createSupabaseServerClient();

  // P51: pass-backs no longer create a booking row; any booking still
  // carrying `passed_from_job_id` dates from before migration 033 and must
  // be handled by opening the parent MOT job directly (the "Passed back
  // to me" section on My Work). Block the old start-work path so we
  // don't quietly spawn a stray second job during the soak period.
  const { data: booking } = await supabase
    .from("bookings")
    .select("passed_from_job_id")
    .eq("id", bookingId)
    .is("deleted_at", null)
    .maybeSingle();

  if (booking?.passed_from_job_id) {
    return {
      ok: false,
      error:
        "This pass-back booking is from the old model — open the parent job directly from 'Passed back to me'.",
    };
  }

  const { data: jobId, error } = await supabase.rpc(
    "start_work_from_checkin",
    { p_booking_id: bookingId },
  );

  if (error) return { ok: false, error: error.message };
  if (!jobId) return { ok: false, error: "Could not start work" };

  revalidatePath("/app/bookings");
  revalidatePath("/app");
  revalidatePath("/app/tech");
  revalidatePath("/app/jobs");
  return { ok: true, id: jobId as string };
}

// ------------------------------------------------------------------
// Helpers: list open check-ins for the My Work feed.
// RLS already scopes what the viewer can see.
// ------------------------------------------------------------------

export interface OpenCheckIn {
  id: string;
  customer_name: string;
  customer_phone: string;
  registration: string;
  make: string | null;
  model: string | null;
  notes: string | null;
  service: "mot" | "electrical" | "maintenance";
  priority: number;
  passed_from_job_id: string | null;
  passback_note: string | null;
  passback_items: unknown;
  created_at: string;
}

/**
 * Open (unconverted) check-ins the caller is allowed to see. RLS filters
 * by role — manager sees all, mot_tester sees MOT, mechanic sees
 * electrical + maintenance + passbacks.
 */
export async function listOpenCheckIns(): Promise<OpenCheckIn[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, customer_name, customer_phone, registration, make, model, notes, service, priority, passed_from_job_id, passback_note, passback_items, created_at",
    )
    .is("job_id", null)
    .is("deleted_at", null)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []) as OpenCheckIn[];
}


// P46 — manager creates a job from a check-in and assigns it to a tech in
// one transaction. Replaces the looser `promoteBookingToJob`. Matches the
// spec contract: `createJobFromCheckIn(checkInId, technicianId)`,
// manager-gated, refuses already-converted check-ins, returns the new
// job id so the dialog can navigate.
const createFromCheckInSchema = z.object({
  bookingId: z.string().uuid(),
  technicianId: z.string().uuid(),
});

export async function createJobFromCheckIn(
  input: z.infer<typeof createFromCheckInSchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = createFromCheckInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();

  // P46.6 — refuse already-converted (or soft-deleted) check-ins.
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", parsed.data.bookingId)
    .is("job_id", null)
    .is("deleted_at", null)
    .single();

  if (bErr || !booking) {
    return { ok: false, error: "Check-in not found or already converted" };
  }

  // P46.2/.7 — the technician must exist, be active, and live in the same
  // garage. RLS already filters cross-tenant reads, so an empty result here
  // means either bad id or cross-tenant attempt — same error either way.
  const { data: tech } = await supabase
    .from("staff")
    .select("id, is_active, roles")
    .eq("id", parsed.data.technicianId)
    .eq("garage_id", session.garageId)
    .maybeSingle();
  if (!tech || tech.is_active === false) {
    return { ok: false, error: "Technician not found or inactive" };
  }
  const techRoles = ((tech as { roles: string[] | null }).roles ?? []) as string[];
  const isTech =
    techRoles.includes("mechanic") || techRoles.includes("mot_tester");
  if (!isTech) {
    return { ok: false, error: "Selected staff member is not a technician" };
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

  // 5. Set status to checked_in + propagate service (P47)
  await supabase
    .from("jobs")
    .update({ status: "checked_in", service: booking.service })
    .eq("id", jobId);

  // 6. Link booking to job
  await supabase
    .from("bookings")
    .update({ job_id: jobId })
    .eq("id", parsed.data.bookingId);

  // 7. Assign the chosen technician (always — required by P46).
  const { error: aErr } = await supabase.from("job_assignments").insert({
    job_id: jobId as string,
    staff_id: parsed.data.technicianId,
    garage_id: session.garageId,
  });
  if (aErr) {
    // The job exists but the assignment failed. Surface the failure so
    // the manager retries assignment from the job page rather than
    // silently leaving the job orphaned.
    return {
      ok: false,
      error: `Job created but assignment failed: ${aErr.message}`,
    };
  }

  revalidatePath("/app/bookings");
  revalidatePath("/app/jobs");
  return { ok: true, id: jobId as string };
}
