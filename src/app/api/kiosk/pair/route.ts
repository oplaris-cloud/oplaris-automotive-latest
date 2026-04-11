import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createHmac } from "node:crypto";

import { serverEnv } from "@/lib/env";
import { requireManager } from "@/lib/auth/session";

/**
 * POST /api/kiosk/pair — manager pairs a tablet to their garage.
 *
 * Requires an authenticated manager session. The garage_id is taken from
 * the JWT (never from the request body) to prevent cross-tenant pairing.
 * Issues a long-lived HMAC-signed device cookie for future kiosk use.
 */
export async function POST(_request: NextRequest): Promise<NextResponse> {
  const session = await requireManager();
  const env = serverEnv();

  // garage_id from the server-trusted session, never from client
  const garageId = session.garageId;

  // Sign the cookie
  const payload = JSON.stringify({
    garage_id: garageId,
    paired_at: new Date().toISOString(),
  });
  const sig = createHmac("sha256", env.KIOSK_PAIRING_SECRET)
    .update(payload)
    .digest("base64url");
  const cookieValue = Buffer.from(payload).toString("base64url") + "." + sig;

  const store = await cookies();
  store.set("kiosk_device", cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 365 * 24 * 60 * 60, // 1 year
  });

  return NextResponse.json({ ok: true, message: "Tablet paired successfully" });
}
