"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ActionResult } from "../../customers/actions";

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
// Add a charge line item
// ------------------------------------------------------------------

export async function addCharge(
  input: z.infer<typeof addChargeSchema>,
): Promise<ActionResult> {
  const session = await requireManager();
  const parsed = addChargeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const supabase = await createSupabaseServerClient();
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
  const { error } = await supabase
    .from("job_charges")
    .update(updates)
    .eq("id", parsed.data.chargeId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/jobs");
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
  const { error } = await supabase
    .from("job_charges")
    .delete()
    .eq("id", chargeId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/jobs");
  return { ok: true };
}

// ------------------------------------------------------------------
// Calculate labour charge from work logs
// ------------------------------------------------------------------

export async function calculateLabourFromLogs(jobId: string): Promise<{
  ok: boolean;
  hours?: number;
  ratePence?: number;
  totalPence?: number;
  error?: string;
}> {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  // Get total logged seconds
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

  // Get labour rate from garage (column may not exist yet — fall back to £75/hr)
  let ratePence = 7500;
  try {
    const { data: garage } = await supabase
      .from("garages")
      .select("labour_rate_pence")
      .eq("id", session.garageId)
      .single();
    if (garage?.labour_rate_pence) {
      ratePence = garage.labour_rate_pence;
    }
  } catch {
    // Column doesn't exist yet — use default
  }

  const hours = Math.ceil(totalSeconds / 3600);
  const totalPence = hours * ratePence;

  return { ok: true, hours, ratePence, totalPence };
}

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
  await requireManager();
  const supabase = await createSupabaseServerClient();

  // Recalculate totals first
  await recalculateInvoiceTotals(jobId);

  const { error } = await supabase
    .from("invoices")
    .update({
      quote_status: "quoted",
      quoted_at: new Date().toISOString(),
      invoice_number: undefined, // keep existing
    })
    .eq("job_id", jobId)
    .eq("quote_status", "draft");

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/app/jobs/${jobId}`);
  return { ok: true };
}

// ------------------------------------------------------------------
// Mark as invoiced
// ------------------------------------------------------------------

export async function markAsInvoiced(jobId: string): Promise<ActionResult> {
  await requireManager();
  const supabase = await createSupabaseServerClient();

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
