import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queueSms, type SmsType } from "@/lib/sms/queue";
import { renderTemplate } from "@/lib/sms/templates";

/**
 * GET /api/cron/mot-reminders — daily reminder producer.
 *
 * Fired by Dokploy's "Schedules" tab at 09:00 London with
 * `Authorization: Bearer ${CRON_SECRET}`. For each window
 * (30, 7, 5 days), find every vehicle whose `mot_expiry_date` lands
 * exactly that many days from today AND hasn't been reminded for
 * the same window in the last 7 days, then render the
 * `mot_reminder` template + queueSms.
 *
 * Idempotent: the 7-day dedup window means re-running the same day,
 * or the next day, won't double-send. Per-row failures bump
 * `failed` but don't fail the route.
 *
 * P2.8 — full spec: docs/redesign/STAGING_FIX_PLAN.md > P2.8.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOWS = [
  { days: 30, type: "mot_reminder_30d" as const },
  { days: 7, type: "mot_reminder_7d" as const },
  { days: 5, type: "mot_reminder_5d" as const },
];

interface VehicleRow {
  id: string;
  garage_id: string;
  registration: string;
  mot_expiry_date: string;
  customer: { id: string; full_name: string; phone: string | null } | null;
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

  const auth = request.headers.get("authorization") ?? "";
  if (!constantTimeBearerEquals(auth, env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  let scanned = 0;
  let queued = 0;
  let skipped_dedup = 0;
  let failed = 0;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dedupCutoff = new Date(today);
  dedupCutoff.setUTCDate(dedupCutoff.getUTCDate() - 7);

  for (const { days, type } of WINDOWS) {
    const targetDate = new Date(today);
    targetDate.setUTCDate(targetDate.getUTCDate() + days);
    const targetIso = targetDate.toISOString().slice(0, 10); // YYYY-MM-DD

    // Vehicles expiring on `targetDate` with a customer + phone on file.
    const { data: candidates, error: selErr } = await supabase
      .from("vehicles")
      .select(
        `id, garage_id, registration, mot_expiry_date,
         customer:customers!customer_id ( id, full_name, phone )`,
      )
      .eq("mot_expiry_date", targetIso)
      .is("deleted_at", null);

    if (selErr) {
      console.error(
        `[cron/mot-reminders] window ${days}d select failed:`,
        selErr.message,
      );
      failed++;
      continue;
    }

    const rows = (candidates ?? []) as unknown as VehicleRow[];
    scanned += rows.length;

    for (const row of rows) {
      const customer = row.customer;
      if (!customer || !customer.phone) continue;

      // 7-day dedup: was a reminder of the SAME type already queued?
      const { count: priorCount, error: dedupErr } = await supabase
        .from("sms_outbox")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", row.id)
        .eq("message_type", type)
        .gte("created_at", dedupCutoff.toISOString());

      if (dedupErr) {
        console.error(
          `[cron/mot-reminders] dedup check failed for ${row.id}:`,
          dedupErr.message,
        );
        failed++;
        continue;
      }
      if ((priorCount ?? 0) > 0) {
        skipped_dedup++;
        continue;
      }

      // Render via the per-garage template editor (P2.3) so a
      // garage manager's customised copy is honoured. The template
      // schema declares vars `garage_name`, `vehicle_reg`,
      // `expiry_date`.
      const { data: garage } = await supabase
        .from("garages")
        .select("brand_name, name")
        .eq("id", row.garage_id)
        .maybeSingle();
      const garageName =
        (garage as { brand_name?: string | null; name?: string | null } | null)
          ?.brand_name ??
        (garage as { name?: string } | null)?.name ??
        "Your garage";

      try {
        const body = await renderTemplate(
          "mot_reminder",
          {
            garage_name: garageName,
            vehicle_reg: row.registration,
            expiry_date: formatExpiryDate(row.mot_expiry_date),
          },
          row.garage_id,
        );

        const result = await queueSms({
          garageId: row.garage_id,
          vehicleId: row.id,
          customerId: customer.id,
          phone: customer.phone,
          messageBody: body,
          messageType: type as SmsType,
        });

        if (result.status === "failed") {
          failed++;
        } else {
          queued++;
        }
      } catch (err) {
        console.error(
          `[cron/mot-reminders] queueSms failed for ${row.id} (${type}):`,
          err instanceof Error ? err.message : String(err),
        );
        failed++;
      }
    }
  }

  return NextResponse.json({
    scanned,
    queued,
    skipped_dedup,
    failed,
    took_ms: Date.now() - start,
  });
}

function formatExpiryDate(iso: string): string {
  const d = new Date(iso);
  // Customer-readable: "12 May 2026"
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

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
