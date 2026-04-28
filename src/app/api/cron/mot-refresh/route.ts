import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDvsaAccessToken } from "@/lib/dvla/token";

/**
 * GET /api/cron/mot-refresh — daily DVSA refresh.
 *
 * Fired by Dokploy's "Schedules" tab at 04:00 London with
 * `Authorization: Bearer ${CRON_SECRET}`. For every vehicle whose
 * `mot_last_checked_at` is older than 7 days (or null) and whose
 * customer is active, we hit the DVSA Trade API, update
 * `mot_expiry_date`, and stamp `mot_last_checked_at = now()`. By
 * 04:30 the dataset is fresh; the 09:00 reminder cron then reads
 * truth-of-the-day, not stale manual edits.
 *
 * Idempotent: re-running mid-day is safe — rows whose
 * `mot_last_checked_at` was just bumped fall outside the WHERE
 * clause. Per-row failures are counted in `failed`; the route still
 * returns 200 so DVSA flake doesn't lose tomorrow's reminders.
 *
 * P2.8 — full spec: docs/redesign/STAGING_FIX_PLAN.md > P2.8.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 200;
const FRESHNESS_DAYS = 7;
const ROUTE_TIMEOUT_MS = 4 * 60 * 1000; // 4 min — Dokploy curl is `--max-time 300`.

interface VehicleRow {
  id: string;
  garage_id: string;
  registration: string;
  mot_expiry_date: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();
  const env = serverEnv();

  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Cron disabled — CRON_SECRET not set" },
      { status: 503 },
    );
  }

  // Bearer-token gate. Constant-time isn't critical here (one
  // attempt per cron tick + Traefik logs; brute-forcing 32 random
  // bytes via curl over public internet isn't a realistic threat
  // surface) but cheap to do anyway.
  const auth = request.headers.get("authorization") ?? "";
  if (!constantTimeBearerEquals(auth, env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  if (!env.DVSA_CLIENT_ID || !env.DVSA_API_KEY || !env.DVSA_BASE_URL) {
    return NextResponse.json(
      { error: "DVSA API not configured" },
      { status: 503 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(
    Date.now() - FRESHNESS_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Pull every eligible vehicle in one query. With Dudley at ~250
  // active vehicles this is fine; if we onboard a 5,000-vehicle
  // garage we'll page. The OR(mot_last_checked_at IS NULL) catches
  // freshly-imported vehicles that have never been checked.
  const { data: vehicles, error: selErr } = await supabase
    .from("vehicles")
    .select("id, garage_id, registration, mot_expiry_date")
    .is("deleted_at", null)
    .not("customer_id", "is", null)
    .or(`mot_last_checked_at.is.null,mot_last_checked_at.lt.${cutoff}`)
    .order("mot_last_checked_at", { ascending: true, nullsFirst: true });

  if (selErr) {
    console.error("[cron/mot-refresh] vehicle select failed:", selErr.message);
    return NextResponse.json({ error: "DB select failed" }, { status: 500});
  }

  const rows = (vehicles ?? []) as VehicleRow[];
  let updated = 0;
  let failed = 0;

  // Token refreshes per call internally. We grab one upfront so the
  // first row doesn't pay the OAuth round-trip.
  let token: string;
  try {
    token = await getDvsaAccessToken();
  } catch (e) {
    console.error("[cron/mot-refresh] DVSA token fetch failed:", e);
    return NextResponse.json(
      { error: "DVSA token unavailable", scanned: rows.length },
      { status: 502 },
    );
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    if (Date.now() - start > ROUTE_TIMEOUT_MS) {
      console.warn(
        `[cron/mot-refresh] hit ${ROUTE_TIMEOUT_MS}ms wall — stopping at row ${i} of ${rows.length}`,
      );
      break;
    }

    const batch = rows.slice(i, i + BATCH_SIZE);
    let batchFailures = 0;

    for (const row of batch) {
      try {
        const reg = row.registration.replace(/\s+/g, "").toUpperCase();
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
          batchFailures++;
          failed++;
          continue;
        }
        const payload = (await res.json()) as {
          motTests?: { expiryDate?: string }[];
        };
        const expiry =
          payload.motTests?.[0]?.expiryDate ?? row.mot_expiry_date ?? null;
        const { error: updErr } = await supabase
          .from("vehicles")
          .update({
            mot_expiry_date: expiry,
            mot_last_checked_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updErr) {
          batchFailures++;
          failed++;
        } else {
          updated++;
        }
      } catch (err) {
        batchFailures++;
        failed++;
        console.error(
          `[cron/mot-refresh] vehicle ${row.id} (${row.registration}) failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    if (batch.length > 0 && batchFailures / batch.length > 0.2) {
      console.warn(
        `[cron/mot-refresh] batch ${i / BATCH_SIZE} had ${batchFailures}/${batch.length} failures — DVSA may be flaky`,
      );
    }

    if (i + BATCH_SIZE < rows.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return NextResponse.json({
    scanned: rows.length,
    updated,
    failed,
    took_ms: Date.now() - start,
  });
}

/** Parse `Authorization: Bearer <secret>` and constant-time-compare
 *  the secret. Falls through to false on any malformed header. */
function constantTimeBearerEquals(header: string, expected: string): boolean {
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const got = header.slice(prefix.length);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) {
    diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
