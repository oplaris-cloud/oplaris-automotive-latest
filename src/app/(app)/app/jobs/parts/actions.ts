"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaffSession, requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  validateUpload,
  FileValidationError,
} from "@/lib/security/file-validation";

import type { ActionResult } from "../../customers/actions";

const PART_SUPPLIERS = ["ecp", "gsf", "atoz", "ebay", "other"] as const;
const PAYMENT_METHODS = ["cash", "card", "bank_transfer"] as const;

const addJobPartSchema = z.object({
  jobId: z.string().uuid(),
  description: z.string().min(1, "Description is required").max(500),
  supplier: z.enum(PART_SUPPLIERS),
  supplierOther: z.string().max(200).optional().or(z.literal("")),
  unitPricePence: z.coerce.number().int().min(0),
  quantity: z.coerce.number().int().min(1),
  purchasedAt: z.string().datetime(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

// ------------------------------------------------------------------
// Add part (with optional file upload)
// ------------------------------------------------------------------

export async function addJobPart(formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();

  const parsed = addJobPartSchema.safeParse({
    jobId: formData.get("jobId"),
    description: formData.get("description"),
    supplier: formData.get("supplier"),
    supplierOther: formData.get("supplierOther") ?? "",
    unitPricePence: formData.get("unitPricePence"),
    quantity: formData.get("quantity"),
    purchasedAt: formData.get("purchasedAt"),
    paymentMethod: formData.get("paymentMethod"),
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key) fieldErrors[String(key)] = issue.message;
    }
    return { ok: false, error: "Validation failed", fieldErrors };
  }

  if (parsed.data.supplier === "other" && !parsed.data.supplierOther) {
    return {
      ok: false,
      fieldErrors: { supplierOther: "Supplier name required when 'other' is selected" },
    };
  }

  const supabase = await createSupabaseServerClient();

  // ------------------------------------------------------------------
  // File upload (optional)
  // ------------------------------------------------------------------

  let invoiceFilePath: string | null = null;
  const file = formData.get("invoiceFile") as File | null;

  if (file && file.size > 0) {
    let validated;
    try {
      validated = await validateUpload(file);
    } catch (err) {
      if (err instanceof FileValidationError) {
        return { ok: false, fieldErrors: { invoiceFile: err.message } };
      }
      throw err;
    }

    // Path: {garage_id}/{job_id}/{uuid}.{ext}
    const fileId = crypto.randomUUID();
    const storagePath = `${session.garageId}/${parsed.data.jobId}/${fileId}${validated.extension}`;

    const { error: uploadErr } = await supabase.storage
      .from("parts-invoices")
      .upload(storagePath, validated.buffer, {
        contentType: validated.mime,
        upsert: false,
      });

    if (uploadErr) {
      return { ok: false, error: `File upload failed: ${uploadErr.message}` };
    }

    invoiceFilePath = storagePath;
  }

  // ------------------------------------------------------------------
  // Insert the job_parts row
  // ------------------------------------------------------------------

  const { data, error } = await supabase
    .from("job_parts")
    .insert({
      garage_id: session.garageId,
      job_id: parsed.data.jobId,
      added_by: session.userId,
      description: parsed.data.description,
      supplier: parsed.data.supplier,
      supplier_other: parsed.data.supplierOther || null,
      unit_price_pence: parsed.data.unitPricePence,
      quantity: parsed.data.quantity,
      purchased_at: parsed.data.purchasedAt,
      payment_method: parsed.data.paymentMethod,
      invoice_file_path: invoiceFilePath,
      notes: parsed.data.notes || null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/jobs");
  return { ok: true, id: data.id };
}

// ------------------------------------------------------------------
// Update part
// ------------------------------------------------------------------

const updateJobPartSchema = z.object({
  partId: z.string().uuid(),
  description: z.string().min(1).max(500).optional(),
  supplier: z.enum(PART_SUPPLIERS).optional(),
  unitPricePence: z.coerce.number().int().min(0).optional(),
  quantity: z.coerce.number().int().min(1).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
});

export async function updateJobPart(
  input: z.infer<typeof updateJobPartSchema>,
): Promise<ActionResult> {
  await requireStaffSession();
  const parsed = updateJobPartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validation failed" };

  const updates: Record<string, unknown> = {};
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.supplier !== undefined) updates.supplier = parsed.data.supplier;
  if (parsed.data.unitPricePence !== undefined) updates.unit_price_pence = parsed.data.unitPricePence;
  if (parsed.data.quantity !== undefined) updates.quantity = parsed.data.quantity;
  if (parsed.data.paymentMethod !== undefined) updates.payment_method = parsed.data.paymentMethod;

  if (Object.keys(updates).length === 0) return { ok: true, id: parsed.data.partId };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("job_parts")
    .update(updates)
    .eq("id", parsed.data.partId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/jobs");
  return { ok: true, id: parsed.data.partId };
}

// ------------------------------------------------------------------
// Delete part (hard delete — not PII)
// ------------------------------------------------------------------

export async function deleteJobPart(
  input: { partId: string },
): Promise<ActionResult> {
  await requireManager();

  if (!input.partId || !/^[0-9a-f-]{36}$/.test(input.partId)) {
    return { ok: false, error: "Invalid part ID" };
  }

  // Use admin client because there's no DELETE RLS policy on job_parts.
  // Manager role is enforced above via requireManager().
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("job_parts")
    .delete()
    .eq("id", input.partId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/jobs");
  return { ok: true };
}

// ------------------------------------------------------------------
// Generate signed URL for invoice download (5-minute expiry)
// ------------------------------------------------------------------

export async function getInvoiceUrl(
  filePath: string,
): Promise<{ url: string } | { error: string }> {
  await requireStaffSession();

  if (!filePath || typeof filePath !== "string") {
    return { error: "Invalid file path" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("parts-invoices")
    .createSignedUrl(filePath, 300); // 5 minutes

  if (error) return { error: error.message };
  return { url: data.signedUrl };
}
