import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { InvoiceDocument, type InvoiceData } from "@/lib/pdf/invoice";

/**
 * GET /api/status/invoice/[jobId]
 *
 * V5.3 — Public customer download for the job's quote / invoice PDF.
 *
 * Auth model: the signed status_session cookie HMAC'd in
 * `/api/status/verify-code` pins the caller to a single vehicle_id.
 * This route re-verifies the signature on every hit AND confirms the
 * requested jobId belongs to that vehicle. A cookie for vehicle A
 * cannot download an invoice for vehicle B — the final ownership
 * query is gated on `jobs.vehicle_id = payload.vehicle_id`.
 *
 * No draft quotes: a charge-basket in `draft` state is internal-only.
 * We only serve `quoted` or `invoiced` invoices to customers.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const env = serverEnv();
  const store = await cookies();
  const cookie = store.get("status_session")?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parts = cookie.split(".");
  if (parts.length !== 2) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  let rawPayload: string;
  try {
    rawPayload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const expectedSig = createHmac("sha256", env.STATUS_PHONE_PEPPER)
    .update(rawPayload)
    .digest("base64url");

  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  let payload: { vehicle_id: string; exp: number };
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const { jobId } = await params;
  if (!jobId || !/^[0-9a-f-]{36}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // Ownership gate: the job must belong to the vehicle that owns the
  // cookie. If this returns no row, stop here.
  const { data: job } = await supabase
    .from("jobs")
    .select(
      `id, job_number, description, created_at, completed_at, garage_id, vehicle_id,
       customers!customer_id ( full_name, phone, email, address_line1, address_line2, postcode ),
       vehicles!vehicle_id ( registration, make, model, mileage )`,
    )
    .eq("id", jobId)
    .eq("vehicle_id", payload.vehicle_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("invoice_number, quote_status, paid_at, payment_method")
    .eq("job_id", jobId)
    .maybeSingle();

  // Only serve quoted / invoiced / paid PDFs — `draft` is internal.
  if (
    !invoice ||
    (invoice.quote_status !== "quoted" &&
      invoice.quote_status !== "invoiced" &&
      invoice.quote_status !== "paid")
  ) {
    return NextResponse.json({ error: "No invoice available" }, { status: 404 });
  }

  const { data: charges } = await supabase
    .from("job_charges")
    .select("charge_type, description, quantity, unit_price_pence")
    .eq("job_id", jobId)
    .order("created_at");

  const { data: garage } = await supabase
    .from("garages")
    .select("name, phone, email, address_line1, address_line2, postcode, website, vat_number, brand_name, brand_primary_hex, brand_accent_hex")
    .eq("id", job.garage_id)
    .single();

  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
  const vehicle = Array.isArray(job.vehicles) ? job.vehicles[0] : job.vehicles;

  const lineItems = (charges ?? []).map((c) => ({
    type: c.charge_type,
    description: c.description,
    quantity: Number(c.quantity),
    unitPricePence: c.unit_price_pence,
    totalPence: Math.round(Number(c.quantity) * c.unit_price_pence),
  }));
  const subtotalPence = lineItems.reduce((sum, li) => sum + li.totalPence, 0);
  const vatPence = Math.round(subtotalPence * 0.2);
  const grandTotalPence = subtotalPence + vatPence;

  const isPaid = invoice.quote_status === "paid";
  const isInvoiced = invoice.quote_status === "invoiced" || isPaid;
  const title = isInvoiced ? "INVOICE" : "QUOTE";
  const reference = invoice.invoice_number ?? `Q-${job.job_number}`;
  const invoiceDate =
    (isInvoiced && job.completed_at
      ? new Date(job.completed_at)
      : new Date()
    ).toLocaleDateString("en-GB");

  const paidBlock = isPaid && invoice.paid_at
    ? {
        at: new Date(invoice.paid_at).toLocaleDateString("en-GB"),
        method:
          invoice.payment_method === "bank_transfer"
            ? "Bank transfer"
            : invoice.payment_method
              ? invoice.payment_method.charAt(0).toUpperCase() +
                invoice.payment_method.slice(1)
              : "",
      }
    : null;

  const invoiceData: InvoiceData = {
    garage: {
      name: (garage?.brand_name as string | null) || garage?.name || "Garage",
      phone: garage?.phone ?? null,
      email: garage?.email ?? null,
      addressLine1: garage?.address_line1 ?? null,
      addressLine2: garage?.address_line2 ?? null,
      postcode: garage?.postcode ?? null,
      website: garage?.website ?? null,
      vatNumber: garage?.vat_number ?? null,
    },
    title,
    reference,
    date: invoiceDate,
    paid: paidBlock,
    customer: {
      fullName: (customer as { full_name: string })?.full_name ?? "Unknown",
      phone: (customer as { phone: string })?.phone ?? "",
      email: (customer as { email: string | null })?.email ?? null,
      addressLine1: (customer as { address_line1?: string | null })?.address_line1 ?? null,
      addressLine2: (customer as { address_line2?: string | null })?.address_line2 ?? null,
      postcode: (customer as { postcode?: string | null })?.postcode ?? null,
    },
    vehicle: {
      registration: (vehicle as { registration: string })?.registration ?? "",
      make: (vehicle as { make: string | null })?.make ?? null,
      model: (vehicle as { model: string | null })?.model ?? null,
      mileage: (vehicle as { mileage: number | null })?.mileage ?? null,
    },
    lineItems,
    subtotalPence,
    vatPence,
    grandTotalPence,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(InvoiceDocument, { data: invoiceData }) as any;
  const buffer = await renderToBuffer(element);

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${reference}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
