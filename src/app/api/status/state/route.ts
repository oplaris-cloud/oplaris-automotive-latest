import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { getJobTimelineEvents } from "@/lib/timeline/fetch";

/**
 * GET /api/status/state
 *
 * V5.3 — Customer portal.
 *
 * Reads the signed status_session cookie and returns the verified
 * customer's full view of their vehicle at this garage:
 *   - Vehicle + garage contact info (so they can call us without
 *     hunting for the number on WhatsApp)
 *   - Every active job on the vehicle (not just the newest — a single
 *     visit can spawn multiple jobs via pass-back, and the customer
 *     should see them all)
 *   - Invoice / quote status per job with a tap-to-download link
 *   - MOT expiry date from the cached DVSA payload — no live DVSA hits
 *     from the public endpoint; the in-app `/api/dvsa/refresh` flow is
 *     what populates the cache
 *
 * Cookie scope: scoped to /api/status + a vehicle_id inside the HMAC'd
 * payload. A cookie for vehicle A cannot read state of vehicle B, and
 * the signature check has to succeed before any DB lookup runs.
 *
 * RLS: this route uses the service-role client (admin) to bypass RLS,
 * which is safe ONLY because the HMAC cookie gate above already binds
 * the request to a single vehicle. No cross-vehicle traversal is
 * possible — every query below filters by `payload.vehicle_id`.
 */
export async function GET(): Promise<NextResponse> {
  const env = serverEnv();
  const store = await cookies();
  const cookie = store.get("status_session")?.value;

  if (!cookie) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Verify cookie signature
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

  const supabase = createSupabaseAdminClient();

  // Vehicle + garage-contact bundle. `garage_id` is on the vehicle row,
  // so a single join gives us both.
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select(
      `id, registration, make, model,
       garages!garage_id (
         id, name, phone, address_line1, address_line2, postcode,
         email, website, brand_name, logo_url
       )`,
    )
    .eq("id", payload.vehicle_id)
    .maybeSingle();

  if (!vehicle) {
    return NextResponse.json(
      { error: "Vehicle not found" },
      { status: 404 },
    );
  }

  const garageRow = Array.isArray(vehicle.garages) ? vehicle.garages[0] : vehicle.garages;

  // All non-cancelled, non-deleted jobs on the vehicle — newest first.
  const { data: jobRows } = await supabase
    .from("jobs")
    .select(
      "id, job_number, status, estimated_ready_at, created_at, completed_at, description",
    )
    .eq("vehicle_id", payload.vehicle_id)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  const jobIds = (jobRows ?? []).map((j) => j.id);

  // Invoices on those jobs. Three cases:
  //   - `quoted` / `invoiced` → full row with amount + PDF download
  //   - `draft` → "Pricing in preparation" placeholder only (no amount)
  //   - no invoice row but job_charges exist → same placeholder
  // The last case handles jobs where the manager has been adding
  // line items but hasn't opened the invoice wrapper yet. Without
  // this the customer sees silence while work is clearly in progress.
  type InvoiceRow = {
    id: string;
    job_id: string;
    invoice_number: string;
    quote_status: string;
    total_pence: number;
    quoted_at: string | null;
    invoiced_at: string | null;
    revision: number;
    updated_at: string | null;
    paid_at: string | null;
    payment_method: string | null;
  };
  let invoiceRows: InvoiceRow[] = [];
  const jobsWithDraftCharges = new Set<string>();
  if (jobIds.length > 0) {
    const { data } = await supabase
      .from("invoices")
      .select(
        "id, job_id, invoice_number, quote_status, total_pence, quoted_at, invoiced_at, revision, updated_at, paid_at, payment_method",
      )
      .in("job_id", jobIds);
    invoiceRows = (data ?? []) as InvoiceRow[];

    // Detect jobs that have charges but no invoice row yet (or only a
    // draft one) — flag them for the "pricing in preparation" hint.
    const { data: chargeCounts } = await supabase
      .from("job_charges")
      .select("job_id")
      .in("job_id", jobIds);
    for (const row of chargeCounts ?? []) {
      jobsWithDraftCharges.add(row.job_id);
    }
  }

  const invoiceByJob = new Map<string, InvoiceRow>();
  for (const inv of invoiceRows) {
    // Keep the latest invoice per job if there are multiple revisions.
    if (!invoiceByJob.has(inv.job_id)) {
      invoiceByJob.set(inv.job_id, inv);
    }
  }

  // Build the per-job timelines. One round-trip per job is fine at
  // typical caller volumes (status page polls every 4s, a verified
  // customer has 1–2 active jobs).
  const statusLabels: Record<string, string> = {
    draft: "Scheduled",
    booked: "Booked in",
    checked_in: "Checked in",
    in_diagnosis: "Being diagnosed",
    in_repair: "Being repaired",
    awaiting_parts: "Waiting for parts",
    awaiting_customer_approval: "Waiting for your approval",
    awaiting_mechanic: "Mechanic review",
    ready_for_collection: "Ready for collection",
    completed: "Completed",
  };

  const jobs = await Promise.all(
    (jobRows ?? []).map(async (job) => {
      const timeline = await getJobTimelineEvents(job.id, {
        audience: "customer",
        limit: 50,
        client: supabase,
      });
      const invoice = invoiceByJob.get(job.id) ?? null;
      const isPublished =
        invoice?.quote_status === "quoted" ||
        invoice?.quote_status === "invoiced" ||
        invoice?.quote_status === "paid";
      // Published invoice → full row with amount + download.
      // Draft invoice OR raw charges with no invoice row yet → a
      // "pricing in preparation" placeholder with no amount.
      const hasPendingPricing =
        !isPublished &&
        (invoice?.quote_status === "draft" ||
          jobsWithDraftCharges.has(job.id));
      return {
        id: job.id,
        jobNumber: job.job_number,
        status: job.status,
        statusLabel: statusLabels[job.status] ?? job.status,
        estimatedReady: job.estimated_ready_at,
        createdAt: job.created_at,
        completedAt: job.completed_at,
        description: job.description,
        timeline: timeline.map((e) => ({
          eventId: e.eventId,
          kind: e.kind,
          at: e.at,
          line: e.customerCopy?.line ?? "",
          detail: e.customerCopy?.detail ?? null,
        })),
        invoice: isPublished
          ? {
              invoiceNumber: invoice!.invoice_number,
              status: invoice!.quote_status as "quoted" | "invoiced" | "paid",
              totalPence: invoice!.total_pence,
              quotedAt: invoice!.quoted_at,
              invoicedAt: invoice!.invoiced_at,
              /** Migration 045 — "Updated" chip fires when > 1. */
              revision: invoice!.revision ?? 1,
              updatedAt: invoice!.updated_at,
              /** Migration 046 — PAID badge fires when non-null. */
              paidAt: invoice!.paid_at,
              paymentMethod: invoice!.payment_method as
                | "cash"
                | "card"
                | "bank_transfer"
                | "other"
                | null,
              /** Download link lives behind the same signed cookie —
               *  /api/status/invoice/[jobId] re-checks vehicle ownership
               *  before serving the PDF. */
              pdfPath: `/api/status/invoice/${job.id}`,
            }
          : hasPendingPricing
            ? {
                invoiceNumber: invoice?.invoice_number ?? null,
                status: "pending" as const,
                totalPence: null,
                quotedAt: null,
                invoicedAt: null,
                revision: 1,
                updatedAt: null,
                paidAt: null,
                paymentMethod: null,
                pdfPath: null,
              }
            : null,
      };
    }),
  );

  // MOT: pull from the cache only. No live DVSA hit from the anonymous
  // public endpoint — that would both double-bill our DVSA rate and
  // leak a vector for enumerating vehicle existence.
  let mot: {
    expiryDate: string | null;
    testResult: string | null;
    testedAt: string | null;
  } | null = null;

  const { data: motCached } = await supabase
    .from("mot_history_cache")
    .select("payload, fetched_at")
    .eq("vehicle_id", payload.vehicle_id)
    .maybeSingle();

  if (motCached?.payload) {
    const tests =
      (motCached.payload as { motTests?: Array<Record<string, unknown>> })
        .motTests ?? [];
    const latest = tests[0] ?? null;
    mot = latest
      ? {
          expiryDate: (latest.expiryDate as string | undefined) ?? null,
          testResult: (latest.testResult as string | undefined) ?? null,
          testedAt: (latest.completedDate as string | undefined) ?? null,
        }
      : null;
  }

  return NextResponse.json({
    vehicle: {
      registration: vehicle.registration,
      make: vehicle.make,
      model: vehicle.model,
    },
    garage: garageRow
      ? {
          name: garageRow.brand_name || garageRow.name,
          phone: garageRow.phone,
          addressLine1: garageRow.address_line1,
          addressLine2: garageRow.address_line2,
          postcode: garageRow.postcode,
          email: garageRow.email,
          website: garageRow.website,
          logoUrl: garageRow.logo_url,
        }
      : null,
    jobs,
    mot,
  });
}
