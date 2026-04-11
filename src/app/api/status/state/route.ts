import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

/**
 * GET /api/status/state
 *
 * Reads the signed status_session cookie and returns minimal job state
 * for that vehicle. No PII beyond what the customer already knows (their
 * own car's status + ETA).
 *
 * Cookie scope: scoped to /api/status path + the vehicle_id inside it.
 * A cookie for vehicle A cannot read state of vehicle B.
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

  let payload: { vehicle_id: string; exp: number };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const expectedSig = createHmac("sha256", env.STATUS_PHONE_PEPPER)
    .update(JSON.stringify(payload))
    .digest("base64url");

  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  // Check expiry
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  // Fetch minimal status for this vehicle's most recent active job
  const supabase = createSupabaseAdminClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("status, estimated_ready_at, job_number")
    .eq("vehicle_id", payload.vehicle_id)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({
      status: "no_active_job",
      message: "No active job found for this vehicle.",
    });
  }

  // Map internal status to customer-friendly label
  const statusLabels: Record<string, string> = {
    draft: "Scheduled",
    booked: "Booked in",
    in_diagnosis: "Being diagnosed",
    in_repair: "Being repaired",
    awaiting_parts: "Waiting for parts",
    awaiting_customer_approval: "Waiting for your approval",
    ready_for_collection: "Ready for collection",
    completed: "Completed",
  };

  return NextResponse.json({
    status: job.status,
    label: statusLabels[job.status] ?? job.status,
    estimatedReady: job.estimated_ready_at,
    jobNumber: job.job_number,
  });
}
