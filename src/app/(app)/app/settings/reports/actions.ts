"use server";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportPeriod = "week" | "month";

/**
 * Reporting server actions — all manager-only, all read-only.
 * Views filter by garage via RLS on the underlying tables.
 * Period-aware actions query underlying tables directly.
 */

export async function getTodaysJobs() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_todays_jobs")
    .select("*")
    .order("created_at", { ascending: false });
  return { data: data ?? [], error: error?.message };
}

export async function getCompletedRevenue(period: ReportPeriod = "week") {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const cutoff = periodCutoff(period);
  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_number, completed_at, customer:customers(full_name), vehicle:vehicles(registration), parts:job_parts(total_pence)")
    .eq("status", "completed")
    .is("deleted_at", null)
    .gte("completed_at", cutoff)
    .order("completed_at", { ascending: false });

  const rows = (data ?? []).map((j) => ({
    job_id: j.id,
    job_number: j.job_number,
    completed_at: j.completed_at,
    customer_name: (j.customer as unknown as { full_name: string } | null)?.full_name ?? "",
    registration: (j.vehicle as unknown as { registration: string } | null)?.registration ?? "",
    parts_total_pence: ((j.parts ?? []) as { total_pence: number }[]).reduce((s, p) => s + (p.total_pence ?? 0), 0),
  }));
  return { data: rows, error: error?.message };
}

export async function getTechHoursByPeriod(period: ReportPeriod = "week") {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const cutoff = periodCutoff(period);
  const { data, error } = await supabase
    .from("work_logs")
    .select("staff_id, duration_seconds, ended_at, started_at, staff:staff(full_name)")
    .gte("started_at", cutoff);

  const byStaff = new Map<string, { staff_id: string; full_name: string; total_seconds: number; active_logs: number }>();
  for (const wl of data ?? []) {
    const sid = wl.staff_id as string;
    const name = (wl.staff as unknown as { full_name: string } | null)?.full_name ?? "";
    const entry = byStaff.get(sid) ?? { staff_id: sid, full_name: name, total_seconds: 0, active_logs: 0 };
    if (wl.ended_at) {
      entry.total_seconds += (wl.duration_seconds as number) ?? 0;
    } else {
      entry.active_logs += 1;
    }
    byStaff.set(sid, entry);
  }
  const rows = [...byStaff.values()].sort((a, b) => b.total_seconds - a.total_seconds);
  return { data: rows, error: error?.message };
}

export async function getCommonRepairs() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_common_repairs")
    .select("*")
    .order("occurrence_count", { ascending: false });
  return { data: data ?? [], error: error?.message };
}

export async function getPartsByJob() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_parts_by_job")
    .select("*")
    .order("total_pence", { ascending: false });
  return { data: data ?? [], error: error?.message };
}

export async function getRepeatCustomers() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_repeat_customers")
    .select("*")
    .order("job_count", { ascending: false });
  return { data: data ?? [], error: error?.message };
}

// ------------------------------------------------------------------
// Migration 046 — receivables / paid / outstanding breakdown.
//
// The reports page grew a financial-state split so managers can tell
// at a glance: what's been invoiced but not paid (cash owed), what's
// landed this period, and what's still in pipeline as a quote. Aging
// bands on the unpaid stack follow the standard small-business UK
// pattern (0-7 / 8-30 / 30+ days) — 30+ is "chase hard".
// ------------------------------------------------------------------

export interface ReceivablesSummary {
  /** Sum of unpaid `invoiced` rows. Money owed to the garage. */
  outstandingPence: number;
  outstandingCount: number;
  /** Sum of `paid` rows in the period. Banked revenue. */
  paidInPeriodPence: number;
  paidInPeriodCount: number;
  /** Sum of `quoted` rows that haven't been invoiced yet. Pipeline. */
  quotedPence: number;
  quotedCount: number;
  /** Aging buckets on the unpaid stack. */
  aging: {
    fresh: { pence: number; count: number }; // 0-7 days
    chase: { pence: number; count: number }; // 8-30 days
    overdue: { pence: number; count: number }; // 30+ days
  };
}

export async function getReceivablesSummary(
  period: ReportPeriod = "week",
): Promise<{ data: ReceivablesSummary; error?: string }> {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const cutoff = periodCutoff(period);

  // Single fetch — everything non-draft in one round-trip. We bucket
  // client-side; the row count is small (one per job) even at scale.
  const { data, error } = await supabase
    .from("invoices")
    .select("total_pence, quote_status, invoiced_at, paid_at")
    .in("quote_status", ["quoted", "invoiced", "paid"]);

  if (error) {
    return {
      data: emptyReceivables(),
      error: error.message,
    };
  }

  const summary = emptyReceivables();
  const now = Date.now();
  const DAY_MS = 86_400_000;

  for (const row of data ?? []) {
    const total = row.total_pence ?? 0;
    if (row.quote_status === "quoted") {
      summary.quotedPence += total;
      summary.quotedCount += 1;
      continue;
    }
    if (row.quote_status === "paid") {
      if (row.paid_at && row.paid_at >= cutoff) {
        summary.paidInPeriodPence += total;
        summary.paidInPeriodCount += 1;
      }
      continue;
    }
    // invoiced — unpaid. Bucket by age since invoiced_at.
    summary.outstandingPence += total;
    summary.outstandingCount += 1;
    if (!row.invoiced_at) {
      summary.aging.fresh.pence += total;
      summary.aging.fresh.count += 1;
      continue;
    }
    const ageDays = (now - new Date(row.invoiced_at).getTime()) / DAY_MS;
    if (ageDays <= 7) {
      summary.aging.fresh.pence += total;
      summary.aging.fresh.count += 1;
    } else if (ageDays <= 30) {
      summary.aging.chase.pence += total;
      summary.aging.chase.count += 1;
    } else {
      summary.aging.overdue.pence += total;
      summary.aging.overdue.count += 1;
    }
  }

  return { data: summary };
}

function emptyReceivables(): ReceivablesSummary {
  return {
    outstandingPence: 0,
    outstandingCount: 0,
    paidInPeriodPence: 0,
    paidInPeriodCount: 0,
    quotedPence: 0,
    quotedCount: 0,
    aging: {
      fresh: { pence: 0, count: 0 },
      chase: { pence: 0, count: 0 },
      overdue: { pence: 0, count: 0 },
    },
  };
}

function periodCutoff(period: ReportPeriod): string {
  const now = new Date();
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}
