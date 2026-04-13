import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InvoiceDocument, type InvoiceData } from "@/lib/pdf/invoice";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await requireManager();
  const { jobId } = await params;
  const supabase = await createSupabaseServerClient();

  // Fetch job with related data
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(`
      id, job_number, description, created_at, completed_at,
      customers!customer_id ( full_name, phone, email, address_line1, address_line2, postcode ),
      vehicles!vehicle_id ( registration, make, model, mileage )
    `)
    .eq("id", jobId)
    .is("deleted_at", null)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Fetch garage details
  let garage: Record<string, unknown>;
  const { data: garageData, error: garageErr } = await supabase
    .from("garages")
    .select("name, phone, email, address_line1, address_line2, postcode, website, vat_number")
    .eq("id", session.garageId)
    .single();

  if (garageErr || !garageData) {
    // Fallback defaults
    const { data: fallback } = await supabase
      .from("garages")
      .select("name")
      .eq("id", session.garageId)
      .single();

    garage = {
      name: fallback?.name ?? "Garage",
      phone: "01582 733036",
      email: "info@dudleyautoservice.co.uk",
      address_line1: "45 Dudley Street",
      address_line2: "Luton",
      postcode: "LU2 0NP",
      website: "www.dudleyautoservice.co.uk",
      vat_number: "482 7719 52",
    };
  } else {
    garage = garageData as Record<string, unknown>;
  }

  // Fetch charges (the line items)
  const { data: charges } = await supabase
    .from("job_charges")
    .select("charge_type, description, quantity, unit_price_pence")
    .eq("job_id", jobId)
    .order("created_at");

  // Fetch invoice record
  const { data: invoice } = await supabase
    .from("invoices")
    .select("invoice_number, quote_status")
    .eq("job_id", jobId)
    .maybeSingle();

  const isInvoiced = invoice?.quote_status === "invoiced";
  const title = isInvoiced ? "INVOICE" : "QUOTE";
  const reference = invoice?.invoice_number ?? `Q-${job.job_number}`;

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

  const invoiceDate = (isInvoiced && job.completed_at)
    ? new Date(job.completed_at).toLocaleDateString("en-GB")
    : new Date().toLocaleDateString("en-GB");

  const g = garage;
  const invoiceData: InvoiceData = {
    garage: {
      name: (g.name as string) ?? "Garage",
      phone: (g.phone as string | null) ?? null,
      email: (g.email as string | null) ?? null,
      addressLine1: (g.address_line1 as string | null) ?? null,
      addressLine2: (g.address_line2 as string | null) ?? null,
      postcode: (g.postcode as string | null) ?? null,
      website: (g.website as string | null) ?? null,
      vatNumber: (g.vat_number as string | null) ?? null,
    },
    title,
    reference,
    date: invoiceDate,
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

  const filename = `${reference}.pdf`;

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
