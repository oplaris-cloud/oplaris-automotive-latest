import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiter backed by private.rate_limits in Postgres.
 *
 * Buckets are keyed by a string like "status_phone:+447911123456" or
 * "status_ip:1.2.3.4". Each bucket tracks counts per 1-hour window.
 *
 * Why Postgres, not Redis? This is v1 with ≤50 concurrent users. The
 * private schema keeps counters invisible to PostgREST (users can't
 * reset their own limits). pg_cron purges stale windows every 10 min.
 */

export async function checkRateLimit(
  bucket: string,
  limit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  // Truncate to the current hour
  const windowStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
  ).toISOString();

  // Upsert + increment atomically
  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_bucket: bucket,
    p_window_start: windowStart,
  });

  if (error) {
    // Fail closed: if the rate limiter is broken, deny the request
    console.error("[rate-limit] error:", error.message);
    return { allowed: false, remaining: 0 };
  }

  const count = (data as number) ?? 0;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
  };
}
