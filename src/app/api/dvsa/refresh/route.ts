import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";

const refreshSchema = z.object({
  vehicleId: z.string().uuid(),
  registration: z.string().min(1).max(15),
});

/**
 * POST /api/dvsa/refresh — fetch MOT history from DVSA and cache it.
 *
 * Manager-only. The DVSA API key never leaves the server. Cached 24h —
 * if a fresh fetch was done within 24h, return the cached version.
 *
 * DVSA rate limits are tight (per-key), so respecting the cache is
 * critical. We never bypass it.
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

  // Fetch from DVSA
  if (!env.DVSA_API_KEY) {
    return NextResponse.json(
      { error: "DVSA API key not configured" },
      { status: 503 },
    );
  }

  const reg = parsed.data.registration.replace(/\s+/g, "").toUpperCase();

  try {
    const baseUrl = env.DVSA_API_BASE_URL ?? "https://beta.check-mot.service.gov.uk";
    const res = await fetch(
      `${baseUrl}/trade/vehicles/mot-tests?registration=${encodeURIComponent(reg)}`,
      {
        headers: {
          "x-api-key": env.DVSA_API_KEY,
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(`[dvsa] API error ${res.status}: ${text}`);
      return NextResponse.json(
        { error: "DVSA lookup failed. Please try again later." },
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
      { error: "DVSA lookup failed. Please try again later." },
      { status: 502 },
    );
  }
}
