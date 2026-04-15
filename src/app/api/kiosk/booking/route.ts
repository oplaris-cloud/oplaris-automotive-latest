import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyKioskCookie } from "@/lib/security/kiosk-cookie";
import { checkRateLimit } from "@/lib/security/rate-limit";

const bookingSchema = z.object({
  service: z.enum(["mot", "electrical", "maintenance"]),
  customerName: z.string().min(1).max(200),
  customerPhone: z.string().min(1).max(30),
  customerEmail: z.string().email().max(254).optional().or(z.literal("")),
  registration: z.string().min(1).max(15),
  make: z.string().max(100).optional().or(z.literal("")),
  model: z.string().max(100).optional().or(z.literal("")),
  preferredDate: z.string().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

/**
 * POST /api/kiosk/booking — tablet kiosk booking submission.
 *
 * Authenticated via per-device signed cookie (not Supabase auth).
 * The garage_id comes from the cookie, never from the request body.
 * All writes use the service_role client because the kiosk has no
 * Supabase session.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify kiosk cookie
  const garageId = await verifyKioskCookie();
  if (!garageId) {
    return NextResponse.json({ error: "Unauthorised device" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  // M1 Go-Live Blocker B9 — rate-limit kiosk bookings.
  // Pattern mirrors /api/status/* (Postgres-backed checkRateLimit). The
  // kiosk cookie already proves the request comes from a paired device,
  // but a paired tablet left unattended in reception is the realistic
  // attack surface — bored customers, walk-ins, kids spamming submit.
  //
  // Two buckets per the M1 kickstart guidance:
  //   - 5 bookings / IP / hour  (overall spam ceiling)
  //   - 3 bookings / (IP + normalised reg) / hour  (a single legit
  //     customer should not need to resubmit the same reg 4 times)
  //
  // Note: checkRateLimit windows are hourly (rate_limits table truncates
  // to the hour). Per-minute windows would need a schema change; hourly
  // is sufficient for v1 spam prevention.
  const rateIp = ip ?? "unknown";
  const normalisedReg = parsed.data.registration.replace(/\s+/g, "").toUpperCase();

  const ipLimit = await checkRateLimit(`kiosk_booking_ip:${rateIp}`, 5);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const ipRegLimit = await checkRateLimit(
    `kiosk_booking_ip_reg:${rateIp}|${normalisedReg}`,
    3,
  );
  if (!ipRegLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      garage_id: garageId,
      source: "kiosk",
      service: parsed.data.service,
      customer_name: parsed.data.customerName,
      customer_phone: parsed.data.customerPhone,
      customer_email: parsed.data.customerEmail || null,
      registration: normalisedReg,
      make: parsed.data.make || null,
      model: parsed.data.model || null,
      preferred_date: parsed.data.preferredDate || null,
      notes: parsed.data.notes || null,
      ip,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[kiosk/booking] DB insert failed:", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, bookingId: data.id });
}
