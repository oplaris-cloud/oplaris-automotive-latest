"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateApprovalToken,
} from "@/lib/security/approval-tokens";
import { sendSms } from "@/lib/sms/twilio";
import { serverEnv } from "@/lib/env";

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

  // Look up the job + customer phone
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, customer_id, customers!customer_id ( phone )")
    .eq("id", parsed.data.jobId)
    .single();

  if (jobErr || !job) {
    return { ok: false, error: "Job not found" };
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

  // Build the approval URL
  const approvalUrl = `${env.NEXT_PUBLIC_APP_URL}/api/approvals/${encodeURIComponent(token)}`;

  // Send SMS
  try {
    await sendSms(
      phone,
      `Dudley Auto Service needs your approval: ${parsed.data.description} — £${(parsed.data.amountPence / 100).toFixed(2)}.\n\nApprove or decline: ${approvalUrl}`,
    );
  } catch (smsErr) {
    // Log the error but don't fail the action — the approval request is
    // already in the DB and the manager can resend or share the link manually.
    console.error("SMS send failed:", smsErr);
  }

  // Update job status
  await supabase
    .from("jobs")
    .update({ status: "awaiting_customer_approval" })
    .eq("id", parsed.data.jobId);

  revalidatePath("/app/jobs");
  return { ok: true, id: requestId };
}
