"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateApprovalToken,
} from "@/lib/security/approval-tokens";
import { queueSms } from "@/lib/sms/queue";
import { normaliseAppUrl, renderTemplate } from "@/lib/sms/templates";
import { serverEnv } from "@/lib/env";
import { isValidTransition, type JobStatus } from "@/lib/validation/job-schemas";

import type { ActionResult } from "../../customers/actions";

const requestApprovalSchema = z.object({
  jobId: z.string().uuid(),
  description: z.string().min(1, "Description is required").max(1000),
  amountPence: z.coerce.number().int().min(0),
});

/**
 * Request customer approval for additional work.
 *
 * 1. Creates a signed HMAC token
 * 2. Stores sha256(token) in approval_requests
 * 3. Sends SMS to the customer's phone with the approval link
 * 4. Updates the job status to 'awaiting_customer_approval'
 */
export async function requestApproval(
  input: z.infer<typeof requestApprovalSchema>,
): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = requestApprovalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed" };
  }

  const supabase = await createSupabaseServerClient();
  const env = serverEnv();

  // Look up the job + customer phone. We also need the current status so
  // we can reject state-machine violations server-side (e.g. a mechanic
  // trying to request approval on a draft or completed job).
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, status, customer_id, vehicle_id, customers!customer_id ( phone )")
    .eq("id", parsed.data.jobId)
    .single();

  if (jobErr || !job) {
    return { ok: false, error: "Job not found" };
  }

  if (!isValidTransition(job.status as JobStatus, "awaiting_customer_approval")) {
    return {
      ok: false,
      error: `Cannot request approval on a job with status "${job.status}"`,
    };
  }

  const customers = job.customers as unknown as { phone: string } | { phone: string }[] | null;
  const phone = Array.isArray(customers) ? customers[0]?.phone : customers?.phone;
  if (!phone) {
    return { ok: false, error: "Customer has no phone number on file" };
  }

  // Generate token + hash
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  const requestId = crypto.randomUUID();
  const { token, tokenHash } = generateApprovalToken(
    parsed.data.jobId,
    requestId,
    expiresAt,
  );

  // Store in DB
  const { error: insertErr } = await supabase
    .from("approval_requests")
    .insert({
      id: requestId,
      garage_id: session.garageId,
      job_id: parsed.data.jobId,
      requested_by: session.userId,
      customer_id: job.customer_id,
      description: parsed.data.description,
      amount_pence: parsed.data.amountPence,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      status: "pending",
    });

  if (insertErr) {
    return { ok: false, error: insertErr.message };
  }

  // Build the approval URL. P2.7a — normaliseAppUrl is the belt-and-
  // braces fix for the `https:host.tld` operator typo (env value missing
  // the `//` after the scheme). Even after the env value is corrected,
  // we keep the helper so the next bad paste doesn't reach the customer.
  const approvalUrl = `${normaliseAppUrl(env.NEXT_PUBLIC_APP_URL)}/api/approvals/${encodeURIComponent(token)}`;

  // Migration 047 — fire through queueSms so failures land in the
  // sms_outbox row instead of getting swallowed by console.error.
  // The approval_request row already records the request itself —
  // this just tracks the customer-notification side.
  // Migration 055 — body now comes from the manager-editable template
  // (per-garage), so brand_name is no longer hardcoded as "Dudley
  // Auto Service".
  const { data: garage } = await supabase
    .from("garages")
    .select("brand_name, name")
    .eq("id", session.garageId)
    .maybeSingle();
  const garageName =
    (garage as { brand_name?: string | null; name?: string | null } | null)
      ?.brand_name ??
    (garage as { name?: string } | null)?.name ??
    "Your garage";

  // P2.7b — capture queueSms outcome so the manager actually finds
  // out when the SMS didn't go out. Previous shape silently swallowed
  // a `failed` outbox row (e.g. Twilio 21610 carrier-block, 21211
  // invalid phone), the job status flipped, the customer never got
  // the SMS, and nobody knew until a chase call landed the next day.
  // The approval_request row is already in the DB so the manager
  // can resend from /app/messages — but we want the toast to fire
  // immediately so they don't move on assuming the SMS landed.
  let smsFailedReason: string | null = null;
  try {
    const result = await queueSms({
      garageId: session.garageId,
      jobId: parsed.data.jobId,
      vehicleId: (job as { vehicle_id?: string }).vehicle_id ?? undefined,
      customerId: job.customer_id,
      phone,
      messageType: "approval_request",
      messageBody: await renderTemplate(
        "approval_request",
        {
          garage_name: garageName,
          description: parsed.data.description,
          amount: (parsed.data.amountPence / 100).toFixed(2),
          approval_url: approvalUrl,
        },
        session.garageId,
      ),
    });
    if (result.status === "failed") {
      smsFailedReason = result.errorMessage ?? "SMS provider rejected the message";
    }
  } catch (smsErr) {
    // Outbox insert itself failed (RPC unreachable). The approval
    // request is still in the DB; manager can resend via /app/messages.
    console.error("approval queueSms failed:", smsErr);
    smsFailedReason =
      smsErr instanceof Error ? smsErr.message : "SMS outbox unreachable";
  }

  // Update job status. We do this even if the SMS failed — the
  // approval row + status give the manager a UI surface to manage
  // the request from. The retry path in /app/messages re-fires the
  // SMS without needing to recreate the approval_requests row.
  await supabase
    .from("jobs")
    .update({ status: "awaiting_customer_approval" })
    .eq("id", parsed.data.jobId);

  revalidatePath("/app/jobs");
  if (smsFailedReason) {
    return {
      ok: false,
      error: `Approval recorded but SMS failed: ${smsFailedReason}. Resend from Messages.`,
    };
  }
  return { ok: true, id: requestId };
}

// ------------------------------------------------------------------
// Manually approve a pending approval request (manager override)
// ------------------------------------------------------------------

const manualApproveSchema = z.object({
  approvalId: z.string().uuid(),
});

export async function manuallyApproveRequest(
  input: z.infer<typeof manualApproveSchema>,
): Promise<ActionResult> {
  await requireStaffSession();
  const parsed = manualApproveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();

  // Update approval status
  const { data, error } = await supabase
    .from("approval_requests")
    .update({
      status: "approved",
      responded_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.approvalId)
    .eq("status", "pending")
    .select("job_id")
    .single();

  if (error || !data) return { ok: false, error: "Approval not found or already responded" };

  // Auto-advance job status to in_repair
  if (data.job_id) {
    await supabase
      .from("jobs")
      .update({ status: "in_repair" })
      .eq("id", data.job_id)
      .eq("status", "awaiting_customer_approval");
  }

  revalidatePath("/app/jobs");
  return { ok: true };
}
