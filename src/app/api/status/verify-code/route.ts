import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createHmac } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { normaliseRegistration } from "@/lib/validation/registration";
import { serverEnv } from "@/lib/env";

/**
 * POST /api/status/verify-code
 *
 * Validates the 6-digit code and issues a signed cookie scoped to that
 * vehicle for 30 minutes. The cookie is httpOnly + secure + sameSite=strict.
 *
 * Single-use: verify_status_code sets consumed_at on the first call.
 * Second call with the same code returns 410 Gone.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = serverEnv();

  let body: { registration?: string; phone?: string; code?: string };
  try {
    body = (await request.json()) as { registration?: string; phone?: string; code?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { registration, phone, code } = body;
  if (!registration || !phone || !code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "registration, phone, and 6-digit code required" }, { status: 400 });
  }

  // Rate limit: 5 verify attempts per IP per hour (brute-force prevention)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipLimit = await checkRateLimit(`verify_ip:${ip}`, 5);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const reg = normaliseRegistration(registration);
  const phoneHash = hash(phone.trim() + env.STATUS_PHONE_PEPPER);
  const regHash = hash(reg + env.STATUS_PHONE_PEPPER);
  const codeHash = hash(code);

  const supabase = createSupabaseAdminClient();
  const { data: vehicleId } = await supabase.rpc("verify_status_code", {
    p_phone_hash: phoneHash,
    p_reg_hash: regHash,
    p_code_hash: codeHash,
  });

  if (!vehicleId) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 410 });
  }

  // Issue a signed session cookie scoped to this vehicle
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60; // 30 min
  const payload = JSON.stringify({ vehicle_id: vehicleId, exp: expiresAt });
  const sig = createHmac("sha256", env.STATUS_PHONE_PEPPER)
    .update(payload)
    .digest("base64url");
  const cookieValue = Buffer.from(payload).toString("base64url") + "." + sig;

  const store = await cookies();
  store.set("status_session", cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/status",
    maxAge: 30 * 60,
  });

  return NextResponse.json({ ok: true });
}

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
