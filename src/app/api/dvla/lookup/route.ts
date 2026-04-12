import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { requireManagerOrTester } from "@/lib/auth/session";
import { getDvsaAccessToken } from "@/lib/dvla/token";

const requestSchema = z.object({
  registration: z.string().min(1).max(15),
});

/**
 * POST /api/dvla/lookup — look up vehicle details from DVSA MOT Trade API.
 *
 * Uses OAuth2 bearer token + x-api-key.
 * Endpoint: GET /v1/trade/vehicles/registration/{registration}
 * Returns make, model, colour, year, fuel type, mileage, MOT status.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  await requireManagerOrTester();

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
      console.error("[dvsa] Trade API error:", res.status, text);
      return NextResponse.json(
        { error: "Vehicle lookup failed" },
        { status: 502 },
      );
    }

    const data = await res.json();

    // Extract latest MOT result
    const motTests = data.motTests ?? [];
    const latestMot = motTests[0] ?? null;

    return NextResponse.json({
      registration: data.registration ?? reg,
      make: data.make ?? null,
      model: data.model ?? null,
      colour: data.primaryColour ?? null,
      year: data.manufactureDate?.slice(0, 4) ?? null,
      fuelType: data.fuelType ?? null,
      engineSize: data.engineSize ?? null,
      motStatus: latestMot?.testResult ?? null,
      motExpiry: latestMot?.expiryDate ?? null,
      mileage: latestMot?.odometerValue ? Number(latestMot.odometerValue) : null,
    });
  } catch (err) {
    console.error("[dvsa] Trade API fetch error:", err);
    return NextResponse.json(
      { error: "Failed to reach DVSA" },
      { status: 502 },
    );
  }
}
