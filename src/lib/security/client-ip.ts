import "server-only";

import type { NextRequest } from "next/server";

/**
 * Extract the originating client IP from a NextRequest.
 *
 * Behind Traefik / Dokploy the request hops through one (or more)
 * reverse proxies. Each hop appends to `x-forwarded-for`, with the
 * left-most entry being the originating client. We take the first
 * non-empty token and trim whitespace; the rest of the chain (including
 * any internal Dokploy IPs) is ignored.
 *
 * Centralised here so a future trust-proxy chain change (e.g. moving
 * to Cloudflare's `CF-Connecting-IP`, or trusting only the last N hops)
 * is one edit, not four.
 *
 * P2.6 (2026-04-28): the rate-limit diagnostic on staging Supabase
 * showed real public IPs landing in `private.rate_limits.bucket`
 * (e.g. `92.23.152.171`, `77.96.51.124`), which means the current
 * Traefik config IS forwarding XFF correctly. This helper preserves
 * that behaviour and gives us a single seam to harden if it changes.
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  // Fallbacks. `x-real-ip` is what nginx-style proxies often set; if
  // someone re-platforms to a proxy that doesn't add XFF, this keeps
  // the rate-limiter alive (with degraded resolution) until the call
  // site is updated.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // Last resort. Better than crashing the rate-limit RPC with `null`
  // (which would short-circuit to `count = 0` and disable the limiter).
  return "unknown";
}
