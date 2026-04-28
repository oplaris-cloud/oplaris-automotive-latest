"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { queueSms } from "@/lib/sms/queue";
import { normaliseAppUrl, renderTemplate } from "@/lib/sms/templates";
import { serverEnv } from "@/lib/env";

import type { ActionResult } from "../../customers/actions";

// P2.3 followup — quote / invoice templates pull the garage's display
// name through the same `brand_name → name → fallback` precedence as
// the approval-request path in approvals/actions.ts. Centralised here
// so both call sites in this file stay byte-identical.
async function getGarageName(
  supabase: SupabaseClient,
  garageId: string,
): Promise<string> {
  const { data } = await supabase
    .from("garages")
    .select("brand_name, name")
    .eq("id", garageId)
    .maybeSingle();
  const row = data as
    | { brand_name?: string | null; name?: string | null }
    | null;
  return row?.brand_name ?? row?.name ?? "Your garage";
}

// ------------------------------------------------------------------
// Schemas
// ------------------------------------------------------------------

const addChargeSchema = z.object({
  jobId: z.string().uuid(),
  chargeType: z.enum(["part", "labour", "other"]),
  description: z.string().max(500).default(""),
  quantity: z.coerce.number().min(0.01),
  unitPricePence: z.coerce.number().int().min(0),
  jobPartId: z.string().uuid().optional(),
});

const updateChargeSchema = z.object({
  chargeId: z.string().uuid(),
  description: z.string().max(500).optional(),
  quantity: z.coerce.number().min(0.01).optional(),
  unitPricePence: z.coerce.number().int().min(0).optional(),
});

// ------------------------------------------------------------------
// Invoice-state gate
// ------------------------------------------------------------------

/**
 * Tiered invoice editing (migrations 045 + 046). Charge CRUD is:
 *   - allowed on `draft` (no side-effects)
 *   - allowed on `quoted` (bumps `invoices.revision` + `updated_at`)
 *   - REJECTED on `invoiced` (manager must "Revert to quoted" first)
 *   - REJECTED on `paid` (manager must "Revert to invoiced" first)
 *
 * Central helper so every CRUD action enforces the same policy
 * without copy-pasting the check.
 */
async function assertInvoiceEditable(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  jobId: string,
): Promise<
  | { editable: true; bumpRevision: boolean }
  | { editable: false; error: string }
> {
  const { data: inv } = await supabase
    .from("invoices")
    .select("quote_status")
    .eq("job_id", jobId)
    .maybeSingle();
  if (!inv || inv.quote_status === "draft") {
    return { editable: true, bumpRevision: false };
  }
  if (inv.quote_status === "quoted") {
    return { editable: true, bumpRevision: true };
  }
  if (inv.quote_status === "paid") {
    return {
      editable: false,
      error:
        "Payment already recorded. Revert to invoiced first to make changes.",
    };
  }
  // invoiced
  return {
    editable: false,
    error: "Invoice is locked. Revert to quoted first to make changes.",
  };
}

async function bumpInvoiceRevision(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  jobId: string,
): Promise<void> {
  // `updated_at` auto-bumps via the trigger from migration 045.
  const { data: current } = await supabase
    .from("invoices")
    .select("revision")
    .eq("job_id", jobId)
    .maybeSingle();
  if (!current) return;
  await supabase
    .from("invoices")
    .update({ revision: (current.revision ?? 1) + 1 })
    .eq("job_id", jobId);
}

// ------------------------------------------------------------------
// Add a charge line item
// ------------------------------------------------------------------

export async function addCharge(
  input: z.infer<typeof addChargeSchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = addChargeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();

  const gate = await assertInvoiceEditable(supabase, parsed.data.jobId);
  if (!gate.editable) return { ok: false, error: gate.error };

  const { data, error } = await supabase
    .from("job_charges")
    .insert({
      garage_id: session.garageId,
      job_id: parsed.data.jobId,
      charge_type: parsed.data.chargeType,
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      unit_price_pence: parsed.data.unitPricePence,
      job_part_id: parsed.data.jobPartId ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  if (gate.bumpRevision) {
    await recalculateInvoiceTotals(parsed.data.jobId);
    await bumpInvoiceRevision(supabase, parsed.data.jobId);
  }

  revalidatePath(`/app/jobs/${parsed.data.jobId}`);
  return { ok: true, id: data.id };
}

// ------------------------------------------------------------------
// Update a charge line item
// ------------------------------------------------------------------

export async function updateCharge(
  input: z.infer<typeof updateChargeSchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = updateChargeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const updates: Record<string, unknown> = {};
  if (parsed.data.description) updates.description = parsed.data.description;
  if (parsed.data.quantity !== undefined) updates.quantity = parsed.data.quantity;
  if (parsed.data.unitPricePence !== undefined) updates.unit_price_pence = parsed.data.unitPricePence;

  if (Object.keys(updates).length === 0) return { ok: true };

  const supabase = await createSupabaseServerClient();

  // Resolve the jobId so we can gate on invoice state. The charge row
  // carries `job_id`; fetch it once + reuse for the gate + the bump.
  const { data: chargeRow } = await supabase
    .from("job_charges")
    .select("job_id")
    .eq("id", parsed.data.chargeId)
    .maybeSingle();
  if (!chargeRow) return { ok: false, error: "Charge not found" };

  const gate = await assertInvoiceEditable(supabase, chargeRow.job_id);
  if (!gate.editable) return { ok: false, error: gate.error };

  const { error } = await supabase
    .from("job_charges")
    .update(updates)
    .eq("id", parsed.data.chargeId);

  if (error) return { ok: false, error: error.message };

  if (gate.bumpRevision) {
    await recalculateInvoiceTotals(chargeRow.job_id);
    await bumpInvoiceRevision(supabase, chargeRow.job_id);
  }

  revalidatePath(`/app/jobs/${chargeRow.job_id}`);
  return { ok: true };
}

// ------------------------------------------------------------------
// Remove a charge line item
// ------------------------------------------------------------------

export async function removeCharge(chargeId: string): Promise<ActionResult> {
  await requireManager();
  if (!chargeId || !/^[0-9a-f-]{36}$/.test(chargeId)) {
    return { ok: false, error: "Invalid ID" };
  }

  const supabase = await createSupabaseServerClient();

  const { data: chargeRow } = await supabase
    .from("job_charges")
    .select("job_id")
    .eq("id", chargeId)
    .maybeSingle();
  if (!chargeRow) return { ok: false, error: "Charge not found" };

  const gate = await assertInvoiceEditable(supabase, chargeRow.job_id);
  if (!gate.editable) return { ok: false, error: gate.error };

  const { error } = await supabase
    .from("job_charges")
    .delete()
    .eq("id", chargeId);

  if (error) return { ok: false, error: error.message };

  if (gate.bumpRevision) {
    await recalculateInvoiceTotals(chargeRow.job_id);
    await bumpInvoiceRevision(supabase, chargeRow.job_id);
  }

  revalidatePath(`/app/jobs/${chargeRow.job_id}`);
  return { ok: true };
}

// ------------------------------------------------------------------
// Calculate labour charge from work logs
// ------------------------------------------------------------------

/**
 * P40 — suggest a labour line for a job based on its work logs.
 *
 * Returns a pre-fill payload for the Add Charge dialog rather than
 * auto-inserting a row. The manager can still edit any field before
 * saving — this is a suggestion, not a commitment.
 *
 * Rounding: to the nearest 0.25 hour (so 1h 22m → 1.5, not ceil to 2).
 * Labels: uses the garage's configured `labour_default_description` when
 * set, otherwise auto-generates one from the duration.
 */
export async function suggestLabourFromLogs(jobId: string): Promise<{
  ok: boolean;
  hours?: number;
  ratePence?: number;
  description?: string;
  error?: string;
}> {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  const { data: workLogs } = await supabase
    .from("work_logs")
    .select("duration_seconds")
    .eq("job_id", jobId)
    .not("ended_at", "is", null);

  const totalSeconds = (workLogs ?? []).reduce(
    (sum, wl) => sum + (wl.duration_seconds ?? 0),
    0,
  );

  if (totalSeconds === 0) {
    return { ok: false, error: "No completed work logs found" };
  }

  const { data: garage } = await supabase
    .from("garages")
    .select("labour_rate_pence, labour_default_description")
    .eq("id", session.garageId)
    .single();

  const ratePence = garage?.labour_rate_pence ?? 7500;

  // Round to nearest 0.25h. Floor at 0.25 so a short log still bills.
  const rawHours = totalSeconds / 3600;
  const hours = Math.max(0.25, Math.round(rawHours * 4) / 4);

  const hoursPart = Math.floor(rawHours);
  const minsPart = Math.round((rawHours - hoursPart) * 60);
  const autoDescription =
    hoursPart > 0
      ? `Labour — ${hoursPart}h${minsPart > 0 ? ` ${minsPart}m` : ""}`
      : `Labour — ${minsPart}m`;
  const description = garage?.labour_default_description || autoDescription;

  return { ok: true, hours, ratePence, description };
}

// Back-compat alias so existing callers don't blow up. Prefer suggestLabourFromLogs.
export const calculateLabourFromLogs = suggestLabourFromLogs;

// ------------------------------------------------------------------
// Get or create invoice record for a job
// ------------------------------------------------------------------

export async function getOrCreateInvoice(jobId: string): Promise<{
  ok: boolean;
  invoice?: {
    id: string;
    invoiceNumber: string;
    quoteStatus: string;
    subtotalPence: number;
    vatPence: number;
    totalPence: number;
  };
  error?: string;
}> {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  // Check if invoice already exists
  const { data: existing } = await supabase
    .from("invoices")
    .select("id, invoice_number, quote_status, subtotal_pence, vat_pence, total_pence")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      invoice: {
        id: existing.id,
        invoiceNumber: existing.invoice_number,
        quoteStatus: existing.quote_status,
        subtotalPence: existing.subtotal_pence,
        vatPence: existing.vat_pence,
        totalPence: existing.total_pence,
      },
    };
  }

  // Get job number for invoice number
  const { data: job } = await supabase
    .from("jobs")
    .select("job_number")
    .eq("id", jobId)
    .single();

  if (!job) return { ok: false, error: "Job not found" };

  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({
      garage_id: session.garageId,
      job_id: jobId,
      invoice_number: `Q-${job.job_number}`,
      quote_status: "draft",
    })
    .select("id, invoice_number, quote_status, subtotal_pence, vat_pence, total_pence")
    .single();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    invoice: {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      quoteStatus: inv.quote_status,
      subtotalPence: inv.subtotal_pence,
      vatPence: inv.vat_pence,
      totalPence: inv.total_pence,
    },
  };
}

// ------------------------------------------------------------------
// Update invoice totals (recalculate from charges)
// ------------------------------------------------------------------

export async function recalculateInvoiceTotals(jobId: string): Promise<ActionResult> {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  // Sum all charges
  const { data: charges } = await supabase
    .from("job_charges")
    .select("quantity, unit_price_pence")
    .eq("job_id", jobId);

  const subtotalPence = (charges ?? []).reduce(
    (sum, c) => sum + Math.round(Number(c.quantity) * c.unit_price_pence),
    0,
  );
  const vatPence = Math.round(subtotalPence * 0.2);
  const totalPence = subtotalPence + vatPence;

  const { error } = await supabase
    .from("invoices")
    .update({ subtotal_pence: subtotalPence, vat_pence: vatPence, total_pence: totalPence })
    .eq("job_id", jobId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/app/jobs/${jobId}`);
  return { ok: true };
}

// ------------------------------------------------------------------
// Mark as quoted
// ------------------------------------------------------------------

export async function markAsQuoted(jobId: string): Promise<ActionResult> {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  // Self-heal: make sure a draft invoice row actually exists before we
  // try to promote it. Previously this action no-op'd silently when the
  // manager had added charges but never opened the invoice wrapper —
  // the UI reported success, the row count stayed at zero, and the
  // customer status page saw nothing.
  const ensured = await getOrCreateInvoice(jobId);
  if (!ensured.ok) {
    return { ok: false, error: ensured.error ?? "Could not open invoice" };
  }

  // Recalculate totals now that we know a row exists.
  await recalculateInvoiceTotals(jobId);

  const { error } = await supabase
    .from("invoices")
    .update({
      quote_status: "quoted",
      quoted_at: new Date().toISOString(),
    })
    .eq("job_id", jobId)
    .in("quote_status", ["draft", "quoted"]);

  if (error) return { ok: false, error: error.message };

  // P39.1 — text the customer to let them know the quote is ready. We
  // point them at the existing status page (phone + reg + 6-digit code)
  // rather than building a new HMAC quote-approval route — the status
  // page already shows the quote breakdown once verified.
  // Migration 047 — fire-and-track via queueSms; failures land in the
  // sms_outbox row + surface on /app/messages instead of console-only.
  try {
    const env = serverEnv();
    const { data: details } = await supabase
      .from("jobs")
      .select(
        `customer_id, vehicle_id,
         customers!customer_id ( phone ),
         vehicles!vehicle_id ( registration ),
         invoices ( invoice_number, total_pence )`,
      )
      .eq("id", jobId)
      .single();

    const customer = Array.isArray(details?.customers)
      ? details?.customers[0]
      : details?.customers;
    const vehicle = Array.isArray(details?.vehicles)
      ? details?.vehicles[0]
      : details?.vehicles;
    const invoice = Array.isArray(details?.invoices)
      ? details?.invoices[0]
      : details?.invoices;

    const phone = (customer as { phone?: string } | null)?.phone;
    if (phone && invoice) {
      const reg = (vehicle as { registration?: string } | null)?.registration ?? "your vehicle";
      const total = (
        ((invoice as { total_pence: number }).total_pence ?? 0) / 100
      ).toFixed(2);
      const ref = (invoice as { invoice_number: string }).invoice_number;
      const link = `${normaliseAppUrl(env.NEXT_PUBLIC_APP_URL)}/status`;
      const garageName = await getGarageName(supabase, session.garageId);
      await queueSms({
        garageId: session.garageId,
        vehicleId: (details as { vehicle_id?: string } | null)?.vehicle_id ?? undefined,
        customerId: (details as { customer_id?: string } | null)?.customer_id ?? undefined,
        jobId,
        phone,
        messageType: "quote_sent",
        messageBody: await renderTemplate(
          "quote_sent",
          {
            garage_name: garageName,
            reference: ref,
            vehicle_reg: reg,
            total,
            status_url: link,
          },
          session.garageId,
        ),
      });
    }
  } catch (smsErr) {
    // Don't fail the action — quote status already moved; manager can resend.
    console.error("[charges] Send Quote SMS failed:", smsErr);
  }

  revalidatePath(`/app/jobs/${jobId}`);
  return { ok: true };
}

// ------------------------------------------------------------------
// Mark as invoiced
// ------------------------------------------------------------------

export async function markAsInvoiced(jobId: string): Promise<ActionResult> {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  // Self-heal: ensure the invoice row exists. Same reason as
  // markAsQuoted — silent no-op was masking missing-row bugs.
  const ensured = await getOrCreateInvoice(jobId);
  if (!ensured.ok) {
    return { ok: false, error: ensured.error ?? "Could not open invoice" };
  }

  // Recalculate totals
  await recalculateInvoiceTotals(jobId);

  // Get job number to build invoice number
  const { data: job } = await supabase
    .from("jobs")
    .select("job_number")
    .eq("id", jobId)
    .single();

  const { error } = await supabase
    .from("invoices")
    .update({
      quote_status: "invoiced",
      invoiced_at: new Date().toISOString(),
      invoice_number: job ? `INV-${job.job_number}` : undefined,
    })
    .eq("job_id", jobId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/app/jobs/${jobId}`);
  return { ok: true };
}

// ------------------------------------------------------------------
// Resend quote SMS (no state change)
// ------------------------------------------------------------------

/**
 * Migration 045 — "Resend quote" button on the quoted-state charges
 * panel. Fires the SMS again without touching `quote_status` so the
 * customer gets a fresh link after the manager has revised pricing.
 *
 * Copy shifts to an "updated" variant when `revision > 1` so the
 * customer sees at a glance that the number changed since last time.
 */
export async function resendQuote(jobId: string): Promise<ActionResult> {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();
  const env = serverEnv();

  const { data: details } = await supabase
    .from("jobs")
    .select(
      `customer_id, vehicle_id,
       customers!customer_id ( phone ),
       vehicles!vehicle_id ( registration ),
       invoices ( invoice_number, total_pence, quote_status, revision )`,
    )
    .eq("id", jobId)
    .single();

  if (!details) return { ok: false, error: "Job not found" };

  const invoice = Array.isArray(details.invoices)
    ? details.invoices[0]
    : details.invoices;
  const customer = Array.isArray(details.customers)
    ? details.customers[0]
    : details.customers;
  const vehicle = Array.isArray(details.vehicles)
    ? details.vehicles[0]
    : details.vehicles;

  if (
    !invoice ||
    ((invoice as { quote_status: string }).quote_status !== "quoted" &&
      (invoice as { quote_status: string }).quote_status !== "invoiced")
  ) {
    return {
      ok: false,
      error: "Nothing to resend — send the quote first.",
    };
  }

  const phone = (customer as { phone?: string } | null)?.phone;
  if (!phone) return { ok: false, error: "Customer has no phone on file" };

  const reg =
    (vehicle as { registration?: string } | null)?.registration ??
    "your vehicle";
  const total = (
    ((invoice as { total_pence: number }).total_pence ?? 0) / 100
  ).toFixed(2);
  const ref = (invoice as { invoice_number: string }).invoice_number;
  const revision = (invoice as { revision: number }).revision ?? 1;
  const link = `${normaliseAppUrl(env.NEXT_PUBLIC_APP_URL)}/status`;
  const garageName = await getGarageName(supabase, session.garageId);

  const messageType = revision > 1 ? "quote_updated" : "quote_sent";
  const message = await renderTemplate(
    messageType,
    {
      garage_name: garageName,
      reference: ref,
      vehicle_reg: reg,
      total,
      status_url: link,
      ...(revision > 1 ? { revision: String(revision) } : {}),
    },
    session.garageId,
  );

  // Migration 047 — track resends in the outbox so the manager can see
  // the exact revision number that went out + delivery state. Status
  // 'failed' on the row IS our error path; we still surface a top-level
  // error so the toast tells the manager what happened.
  const result = await queueSms({
    garageId: session.garageId,
    vehicleId: (details as { vehicle_id?: string }).vehicle_id ?? undefined,
    customerId: (details as { customer_id?: string }).customer_id ?? undefined,
    jobId,
    phone,
    messageBody: message,
    messageType,
  });
  if (result.status === "failed") {
    return { ok: false, error: "SMS failed — check Twilio settings" };
  }

  revalidatePath(`/app/jobs/${jobId}`);
  return { ok: true };
}

// ------------------------------------------------------------------
// Revert to quoted (manager override on an invoiced row)
// ------------------------------------------------------------------

/**
 * Migration 045 — escape hatch for the `invoiced` lock. Flips the
 * invoice back to `quoted` so the manager can edit charges again.
 * Keeps `invoice_number` + `revision` intact so the audit trail of
 * the change survives. `updated_at` auto-bumps via the trigger.
 */
export async function revertToQuoted(jobId: string): Promise<ActionResult> {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("invoices")
    .update({
      quote_status: "quoted",
      invoiced_at: null,
    })
    .eq("job_id", jobId)
    .eq("quote_status", "invoiced");

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/app/jobs/${jobId}`);
  return { ok: true };
}

// ------------------------------------------------------------------
// Mark as paid (migration 046)
// ------------------------------------------------------------------

const markAsPaidSchema = z.object({
  jobId: z.string().uuid(),
  paymentMethod: z.enum(["cash", "card", "bank_transfer", "other"]),
});

/**
 * Migration 046 — terminal state for the invoice lifecycle. Only
 * legal from `invoiced`; `draft` and `quoted` can't be paid (nothing
 * has been billed yet). Stamps `paid_at = now()` via default, records
 * the manager-selected payment method.
 *
 * For the customer, this fires the PAID badge on the status page and
 * the PAID watermark on the downloaded PDF. Receipt SMS is deferred
 * to a follow-up.
 */
export async function markAsPaid(
  input: z.infer<typeof markAsPaidSchema>,
): Promise<ActionResult> {
  await requireManager();
  const parsed = markAsPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("invoices")
    .update({
      quote_status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: parsed.data.paymentMethod,
    })
    .eq("job_id", parsed.data.jobId)
    .eq("quote_status", "invoiced");

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/app/jobs/${parsed.data.jobId}`);
  return { ok: true };
}

// ------------------------------------------------------------------
// Revert to invoiced (manager override on a paid row)
// ------------------------------------------------------------------

/**
 * Migration 046 — escape hatch for the `paid` lock. Same shape as
 * `revertToQuoted`. Clears `paid_at` + `payment_method` so the
 * downstream receivables/paid-period reports don't double-count this
 * invoice after it's re-paid.
 */
export async function revertToInvoiced(jobId: string): Promise<ActionResult> {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("invoices")
    .update({
      quote_status: "invoiced",
      paid_at: null,
      payment_method: null,
    })
    .eq("job_id", jobId)
    .eq("quote_status", "paid");

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/app/jobs/${jobId}`);
  return { ok: true };
}
