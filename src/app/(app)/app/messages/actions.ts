"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queueSms, type SmsType } from "@/lib/sms/queue";

import type { ActionResult } from "../customers/actions";

/**
 * Migration 047 — server actions for the /app/messages page.
 *
 * Reads use the user's RLS-scoped client (`createSupabaseServerClient`)
 * — the `sms_outbox_select_manager` policy from migration 047 enforces
 * `garage_id = private.current_garage() AND has_role('manager')`,
 * so a non-manager hitting this surface returns `[]`.
 *
 * Writes (retry / cancel) go through SECURITY DEFINER RPCs and the
 * admin client to bypass the `revoke insert/update/delete from
 * authenticated` rule. The RPCs themselves re-check the role + garage
 * (defense in depth).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SmsStatus = "queued" | "sent" | "delivered" | "failed" | "cancelled";

export interface MessageRow {
  id: string;
  garageId: string;
  vehicleId: string | null;
  customerId: string | null;
  jobId: string | null;
  phone: string;
  messageBody: string;
  messageType: SmsType;
  scheduledFor: string | null;
  twilioSid: string | null;
  status: SmsStatus;
  statusUpdatedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  // Joined for the table cells — saves a per-row trip
  vehicleReg: string | null;
  customerFullName: string | null;
  jobNumber: string | null;
}

export interface MessageKpis {
  sentToday: number;
  failed: number;
  queued: number;
}

export interface MessagesFilter {
  type?: SmsType | "all";
  status?: SmsStatus | "all";
  /** ISO date string (YYYY-MM-DD) — inclusive lower bound */
  dateFrom?: string;
  /** ISO date string — inclusive upper bound (we treat as end-of-day) */
  dateTo?: string;
  /** Free text — phone or registration substring */
  search?: string;
}

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export async function getMessageKpis(): Promise<MessageKpis> {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  // "Today" in UK time. We bound on `created_at >= startOfDayUTC` —
  // close enough for a manager-facing KPI (a midnight rollover at
  // BST/GMT shifts the count by one only at the moment of midnight).
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [sentRes, failedRes, queuedRes] = await Promise.all([
    supabase
      .from("sms_outbox")
      .select("id", { count: "exact", head: true })
      .in("status", ["sent", "delivered"])
      .gte("created_at", startOfDay.toISOString()),
    supabase
      .from("sms_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase
      .from("sms_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued"),
  ]);

  return {
    sentToday: sentRes.count ?? 0,
    failed: failedRes.count ?? 0,
    queued: queuedRes.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Paginated list
// ---------------------------------------------------------------------------

export interface MessagesPage {
  rows: MessageRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getMessages(
  filter: MessagesFilter = {},
  page: number = 1,
): Promise<MessagesPage> {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("sms_outbox")
    .select(
      `id, garage_id, vehicle_id, customer_id, job_id,
       phone, message_body, message_type, scheduled_for,
       twilio_sid, status, status_updated_at,
       error_code, error_message, cancelled_at, cancel_reason, created_at,
       vehicles:vehicles!vehicle_id ( registration ),
       customers:customers!customer_id ( full_name ),
       jobs:jobs!job_id ( job_number )`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filter.type && filter.type !== "all") {
    query = query.eq("message_type", filter.type);
  }
  if (filter.status && filter.status !== "all") {
    query = query.eq("status", filter.status);
  }
  if (filter.dateFrom) {
    query = query.gte("created_at", `${filter.dateFrom}T00:00:00.000Z`);
  }
  if (filter.dateTo) {
    query = query.lte("created_at", `${filter.dateTo}T23:59:59.999Z`);
  }
  if (filter.search && filter.search.trim().length > 0) {
    // Phone OR registration substring. Postgrest's .or syntax wants
    // a single string — escape commas in the search term to avoid
    // breaking the parser.
    const term = filter.search.trim().replace(/,/g, "");
    query = query.or(
      `phone.ilike.%${term}%,vehicles.registration.ilike.%${term}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) {
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
  }

  const rows: MessageRow[] = (data ?? []).map((r) => {
    const vehicle = Array.isArray(r.vehicles) ? r.vehicles[0] : r.vehicles;
    const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
    return {
      id: r.id,
      garageId: r.garage_id,
      vehicleId: r.vehicle_id,
      customerId: r.customer_id,
      jobId: r.job_id,
      phone: r.phone,
      messageBody: r.message_body,
      messageType: r.message_type as SmsType,
      scheduledFor: r.scheduled_for,
      twilioSid: r.twilio_sid,
      status: r.status as SmsStatus,
      statusUpdatedAt: r.status_updated_at,
      errorCode: r.error_code,
      errorMessage: r.error_message,
      cancelledAt: r.cancelled_at,
      cancelReason: r.cancel_reason,
      createdAt: r.created_at,
      vehicleReg: (vehicle as { registration?: string } | null)?.registration ?? null,
      customerFullName:
        (customer as { full_name?: string } | null)?.full_name ?? null,
      jobNumber: (job as { job_number?: string } | null)?.job_number ?? null,
    };
  });

  return { rows, total: count ?? 0, page, pageSize: PAGE_SIZE };
}

// ---------------------------------------------------------------------------
// Retry — re-fires a failed message via queueSms. Creates a NEW row;
// the original `failed` row stays as audit trail.
// ---------------------------------------------------------------------------

const retrySchema = z.object({ id: z.string().uuid() });

export async function retryMessage(
  input: z.infer<typeof retrySchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = retrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id" };

  const supabase = await createSupabaseServerClient();
  const { data: original } = await supabase
    .from("sms_outbox")
    .select(
      "vehicle_id, customer_id, job_id, phone, message_body, message_type, status",
    )
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!original) return { ok: false, error: "Message not found" };
  if (original.status !== "failed") {
    return {
      ok: false,
      error: `Cannot retry — status is "${original.status}", only failed rows can be retried.`,
    };
  }

  const result = await queueSms({
    garageId: session.garageId,
    vehicleId: original.vehicle_id ?? undefined,
    customerId: original.customer_id ?? undefined,
    jobId: original.job_id ?? undefined,
    phone: original.phone,
    messageBody: original.message_body,
    messageType: original.message_type as SmsType,
  });

  if (result.status === "failed") {
    return {
      ok: false,
      error: result.errorMessage ?? "Retry failed",
    };
  }

  revalidatePath("/app/messages");
  return { ok: true, id: result.outboxId };
}

// ---------------------------------------------------------------------------
// Cancel — flips a queued row to cancelled. SECURITY DEFINER RPC
// (private.cancel_sms) re-checks manager + garage.
// ---------------------------------------------------------------------------

const cancelSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(200).default("manual"),
});

export async function cancelMessage(
  input: z.infer<typeof cancelSchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const admin = createSupabaseAdminClient();
  const { data: rowCount, error } = await admin.rpc("cancel_sms", {
    p_outbox_id: parsed.data.id,
    p_cancel_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };
  if (rowCount === 0) {
    return {
      ok: false,
      error: "Cannot cancel — already sent, delivered, or not in your garage.",
    };
  }

  revalidatePath("/app/messages");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Expired-MOT list (Step 5f)
// ---------------------------------------------------------------------------

export interface ExpiredMotRow {
  vehicleId: string;
  registration: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  expiredOn: string;
  daysOverdue: number;
}

export async function getExpiredMots(): Promise<ExpiredMotRow[]> {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("vehicles")
    .select(
      `id, registration, customer_id, mot_expiry_date,
       customers:customers!customer_id ( full_name, phone )`,
    )
    .lt("mot_expiry_date", todayIso)
    .is("deleted_at", null)
    .order("mot_expiry_date", { ascending: true });

  return (data ?? []).map((v) => {
    const customer = Array.isArray(v.customers) ? v.customers[0] : v.customers;
    const expired = new Date(v.mot_expiry_date as string);
    const daysOverdue = Math.max(
      0,
      Math.floor((today.getTime() - expired.getTime()) / 86_400_000),
    );
    return {
      vehicleId: v.id as string,
      registration: v.registration as string,
      customerId: (v.customer_id as string | null) ?? null,
      customerName:
        (customer as { full_name?: string } | null)?.full_name ?? null,
      customerPhone:
        (customer as { phone?: string } | null)?.phone ?? null,
      expiredOn: v.mot_expiry_date as string,
      daysOverdue,
    };
  });
}
