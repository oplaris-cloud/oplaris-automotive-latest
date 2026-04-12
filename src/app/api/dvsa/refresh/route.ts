import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { getDvsaAccessToken } from "@/lib/dvla/token";

const refreshSchema = z.object({
  vehicleId: z.string().uuid(),
  registration: z.string().min(1).max(15),
});

/**
 * POST /api/dvsa/refresh — fetch full MOT history and cache it.
 *
 * Manager-only. Uses DVSA OAuth2 token + x-api-key.
 * Endpoint: GET /v1/trade/vehicles/registration/{registration}
 * Cached 24h — if a fresh fetch was done within 24h, return the cached version.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireManager();
  const env = serverEnv();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Check cache (24h freshness)
  const { data: cached } = await supabase
    .from("mot_history_cache")
    .select("payload, fetched_at")
    .eq("vehicle_id", parsed.data.vehicleId)
    .single();

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < 24 * 60 * 60 * 1000) {
      return NextResponse.json({ data: cached.payload, cached: true });
    }
  }

  if (!env.DVSA_CLIENT_ID || !env.DVSA_API_KEY || !env.DVSA_BASE_URL) {
    return NextResponse.json(
      { error: "DVSA API not configured" },
      { status: 503 },
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

    if (!res.ok) {
      const text = await res.text();
      console.error(`[dvsa] API error ${res.status}: ${text}`);
      return NextResponse.json(
        { error: "MOT history lookup failed. Please try again later." },
        { status: 502 },
      );
    }

    const payload = await res.json();

    // Upsert cache
    await supabase.from("mot_history_cache").upsert(
      {
        vehicle_id: parsed.data.vehicleId,
        garage_id: session.garageId,
        fetched_at: new Date().toISOString(),
        payload,
      },
      { onConflict: "vehicle_id" },
    );

    return NextResponse.json({ data: payload, cached: false });
  } catch (err) {
    console.error("[dvsa] fetch error:", err);
    return NextResponse.json(
      { error: "MOT history lookup failed. Please try again later." },
      { status: 502 },
    );
  }
}
