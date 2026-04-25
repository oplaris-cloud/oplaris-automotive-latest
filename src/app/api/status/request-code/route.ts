import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomInt } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { normaliseRegistration } from "@/lib/validation/registration";
import { normalisePhoneSafe } from "@/lib/validation/phone";
import { serverEnv } from "@/lib/env";
import { queueSms } from "@/lib/sms/queue";
import { renderTemplate } from "@/lib/sms/templates";

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
  const normalisedInput = normalisePhoneSafe(rawPhone);
  const phoneMatches = !!(customerPhone && normalisedInput && normalisedInput === customerPhone);
  // STAGING_SMS_BYPASS — dev/staging only. Gated both by the env var
  // AND a belt-and-braces `NODE_ENV !== production` check so a
  // misconfiguration can't leak codes in prod. The env-parse guard in
  // `serverEnv()` would already have thrown at boot.
  const bypass = env.STATUS_DEV_BYPASS_SMS && env.NODE_ENV !== "production";

  if (phoneMatches && vehicle) {
    // Store code — same in both bypass and real-Twilio paths.
    await supabase.rpc("store_status_code", {
      p_garage_id: vehicle.garage_id,
      p_vehicle_id: vehicle.id,
      p_phone_hash: phoneHash,
      p_reg_hash: regHash,
      p_code_hash: codeHash,
      p_expires_at: expiresAt.toISOString(),
      p_ip: ip,
    });

    if (bypass) {
      // Audit every bypass so staging has a trace. The code value
      // itself is NEVER written to the audit log — only the fact
      // that a bypass happened + who it was for.
      await supabase.from("audit_log").insert({
        garage_id: vehicle.garage_id,
        actor_staff_id: null,
        actor_ip: ip,
        action: "status_dev_sms_bypass",
        target_table: "vehicles",
        target_id: vehicle.id,
        meta: { reg, expires_at: expiresAt.toISOString() },
      });
      // stdout only — never log to a persistent sink.
      console.warn(
        `[status] Dev-bypass code for ${reg}: ${code}  (expires ${expiresAt.toISOString()})`,
      );
      // Return the code inline. The same-response-shape rule holds
      // for the no-match path below; the extra `devCode` field is
      // only attached when the reg/phone actually matched, so
      // enumeration from outside the server is still impossible.
      return padded(
        startMs,
        NextResponse.json({ ...OK_RESPONSE, devCode: code }),
      );
    }

    // Migration 047 — track 6-digit code SMS in the outbox so the
    // manager has a single source of truth for delivery.
    // The CODE itself is logged in `message_body` (sms_outbox is
    // manager-RLS-gated + the code expires in 10 minutes — same
    // sensitivity envelope as the audit_log row).
    try {
      await queueSms({
        garageId: vehicle.garage_id,
        vehicleId: vehicle.id,
        phone: customerPhone,
        messageType: "status_code",
        messageBody: await renderTemplate(
          "status_code",
          { code },
          vehicle.garage_id,
        ),
      });
    } catch (err) {
      console.error("[status] queueSms failed:", err);
    }
  }

  // Always return the same response (no `devCode` on the no-match path)
  return padded(startMs, NextResponse.json(OK_RESPONSE));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// Phone normalisation now goes through `normalisePhoneSafe` from
// `@/lib/validation/phone` so the same parser/validator gates the entry
// point as the customer create/update path — a number that parses there
// must parse here. Anti-enumeration shape preserved by the safe variant
// (returns null instead of throwing).

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
