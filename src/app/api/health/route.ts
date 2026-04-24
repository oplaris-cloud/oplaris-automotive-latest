import { NextResponse } from "next/server";

/**
 * Liveness probe.
 *
 * Public, no-auth, no-DB-hit. Docker HEALTHCHECK and Dokploy's health check
 * both point at this route. Intentionally dumb — "is the Node process still
 * listening?" not "is the database reachable?". A DB-aware readiness probe
 * would belong at a separate path (Phase 4+ if ever needed).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
