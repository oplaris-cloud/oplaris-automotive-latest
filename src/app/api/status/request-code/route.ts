import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomInt } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { normaliseRegistration } from "@/lib/validation/registration";
import { serverEnv } from "@/lib/env";
import { sendSms } from "@/lib/sms/twilio";

/**
 * POST /api/status/request-code
 *
 * Anti-enumeration:
 *   - Same JSON shape + HTTP status for hit/miss (always 200 + { ok: true })
 *   - Consistent timing via padded delay (250ms ± jitter)
 *   - Phone + reg are hashed before storage; raw values never persisted
 *   - Rate limited: 3/phone/hr + 10/IP/hr
 *
 * The 6-digit code is hashed (sha256) before storage. 10-minute expiry.
 */

const OK_RESPONSE = {
  ok: true,
  message: "If a matching vehicle exists, a code has been sent to the phone on file.",
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startMs = Date.now();
  const env = serverEnv();

  let body: { registration?: string; phone?: string };
  try {
    body = (await request.json()) as { registration?: string; phone?: string };
  } catch {
    return padded(startMs, NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const rawReg = body.registration?.trim();
  const rawPhone = body.phone?.trim();
  if (!rawReg || !rawPhone) {
    return padded(startMs, NextResponse.json({ error: "registration and phone required" }, { status: 400 }));
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Rate limits (fail closed)
  const phoneHash = hash(rawPhone + env.STATUS_PHONE_PEPPER);
  const phoneLimit = await checkRateLimit(`status_phone:${phoneHash}`, 3);
  if (!phoneLimit.allowed) {
    return padded(startMs, NextResponse.json({ error: "Too many requests" }, { status: 429 }));
  }
  const ipLimit = await checkRateLimit(`status_ip:${ip}`, 10);
  if (!ipLimit.allowed) {
    return padded(startMs, NextResponse.json({ error: "Too many requests" }, { status: 429 }));
  }

  // Normalise
  const reg = normaliseRegistration(rawReg);
  const regHash = hash(reg + env.STATUS_PHONE_PEPPER);

  // Look up vehicle by reg + customer phone (same garage scope via join)
  const supabase = createSupabaseAdminClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, garage_id, customers!customer_id ( phone )")
    .eq("registration", reg)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  const customerPhone = vehicle
    ? (Array.isArray(vehicle.customers) ? vehicle.customers[0] : vehicle.customers)?.phone
    : null;

  // Generate a 6-digit code regardless of match (anti-enumeration)
  const code = String(randomInt(100000, 999999));
  const codeHash = hash(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Only store + send if phone matches
  const phoneMatches = customerPhone && normalisePhoneSimple(rawPhone) === customerPhone;

  if (phoneMatches && vehicle) {
    // Store code
    await supabase.rpc("store_status_code", {
      p_garage_id: vehicle.garage_id,
      p_vehicle_id: vehicle.id,
      p_phone_hash: phoneHash,
      p_reg_hash: regHash,
      p_code_hash: codeHash,
      p_expires_at: expiresAt.toISOString(),
      p_ip: ip,
    });

    // Send SMS
    try {
      await sendSms(customerPhone, `Your vehicle status code: ${code}\nExpires in 10 minutes.`);
    } catch (err) {
      console.error("[status] SMS send failed:", err);
    }
  }

  // Always return the same response
  return padded(startMs, NextResponse.json(OK_RESPONSE));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Extremely simple phone normalisation for matching — just strip
 * non-digits and prepend +44 if starts with 0. Good enough for the
 * same-response-shape comparison; the real normalisation is done at
 * customer create time.
 */
function normalisePhoneSimple(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) return "+44" + digits.slice(1);
  if (digits.startsWith("44")) return "+" + digits;
  return "+" + digits;
}

/**
 * Pad response time to ~250ms ± jitter to prevent timing side-channels
 * that would reveal whether the reg/phone matched.
 */
async function padded(startMs: number, response: NextResponse): Promise<NextResponse> {
  const elapsed = Date.now() - startMs;
  const target = 250 + Math.random() * 50; // 250–300ms
  const remaining = target - elapsed;
  if (remaining > 0) {
    await new Promise((r) => setTimeout(r, remaining));
  }
  return response;
}
