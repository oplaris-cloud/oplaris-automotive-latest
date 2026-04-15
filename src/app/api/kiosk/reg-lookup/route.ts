import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { verifyKioskCookie } from "@/lib/security/kiosk-cookie";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getDvsaAccessToken } from "@/lib/dvla/token";

const requestSchema = z.object({
  registration: z.string().min(1).max(15),
});

/**
 * P43 — kiosk-side DVSA reg lookup.
 *
 * The reception kiosk is paired (signed cookie) but has no Supabase
 * session, so it can't hit the manager-gated `/api/dvla/lookup`. This
 * route shares the same DVSA fetch logic, gated by the kiosk pairing
 * cookie + a per-IP hourly rate limit.
 *
 * Architecture rule #5: DVSA key never leaves the server.
 * Rule for this surface: lookup is best-effort — kiosk submission must
 * remain functional even when DVSA is down or the rate limit trips.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const garageId = await verifyKioskCookie();
  if (!garageId) {
    return NextResponse.json({ error: "Unauthorised device" }, { status: 401 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = await checkRateLimit(`kiosk_reg_lookup_ip:${ip}`, 10);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const env = serverEnv();
  if (!env.DVSA_CLIENT_ID || !env.DVSA_API_KEY || !env.DVSA_BASE_URL) {
    return NextResponse.json(
      { error: "DVSA API not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Registration is required" },
      { status: 400 },
    );
  }

  const reg = parsed.data.registration.replace(/\s+/g, "").toUpperCase();

  try {
    const token = await getDvsaAccessToken();

    const res = await fetch(
      `${env.DVSA_BASE_URL}v1/trade/vehicles/registration/${encodeURIComponent(reg)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-API-Key": env.DVSA_API_KEY,
        },
      },
    );

    if (res.status === 404) {
      return NextResponse.json(
        { error: "Vehicle not found" },
        { status: 404 },
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[kiosk/reg-lookup] DVSA error:", res.status, text);
      return NextResponse.json(
        { error: "Vehicle lookup failed" },
        { status: 502 },
      );
    }

    const data = await res.json();

    return NextResponse.json({
      registration: data.registration ?? reg,
      make: data.make ?? null,
      model: data.model ?? null,
      colour: data.primaryColour ?? null,
      year: data.manufactureDate?.slice(0, 4) ?? null,
    });
  } catch (err) {
    console.error("[kiosk/reg-lookup] fetch error:", err);
    return NextResponse.json(
      { error: "Failed to reach DVSA" },
      { status: 502 },
    );
  }
}
