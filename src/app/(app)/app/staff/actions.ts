import "server-only";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeStaffStatus,
  jobsCompletedToday,
  type StaffStatus,
} from "@/lib/staff/status";

// P3.1 — Read layer for the manager-only /app/staff section.
//
// Two queries (parallel):
//   1. All active staff in the garage.
//   2. All work_logs for the garage in the *visibility window* — running
//      logs (ended_at IS NULL) for the live-status panel + closed logs
//      from today for the "completed today" count + the active job's
//      vehicle reg via FK joins.
//
// Combination + filtering happens in JS so the date-boundary logic is
// the same in `getStaffWithLiveStatus` and `getStaffDetail`. The pure
// helpers in `lib/staff/status.ts` carry the testable bits.

export interface StaffRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  roles: string[];
}

export interface ActiveWorkLogSummary {
  id: string;
  jobId: string;
  jobNumber: string | null;
  vehicleId: string | null;
  vehicleReg: string | null;
  startedAt: string;
  pausedAt: string | null;
  pausedSecondsTotal: number;
}

export interface StaffWithLiveStatus {
  staff: StaffRow;
  status: StaffStatus;
  activeWorkLog: ActiveWorkLogSummary | null;
  jobsCompletedToday: number;
}

interface RawWorkLog {
  id: string;
  staff_id: string;
  job_id: string;
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  paused_seconds_total: number | null;
  jobs: {
    job_number: string | null;
    vehicles: { id: string | null; registration: string | null } | null;
  } | null;
}

/**
 * Manager-only. Returns a row per active staff member with their live
 * status, the active work_log (if any), and today's completion count.
 */
export async function getStaffWithLiveStatus(): Promise<StaffWithLiveStatus[]> {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [{ data: staffList, error: staffErr }, { data: logs, error: logsErr }] =
    await Promise.all([
      supabase
        .from("staff")
        .select("id, full_name, email, phone, avatar_url, roles")
        .eq("garage_id", session.garageId)
        .eq("is_active", true)
        .order("full_name"),
      // Window: any log either still running, OR ended today. Two
      // overlapping conditions are the common shape for live-status
      // dashboards; PostgREST OR keeps the request to a single round-trip.
      supabase
        .from("work_logs")
        .select(
          `id, staff_id, job_id, started_at, ended_at, paused_at, paused_seconds_total,
           jobs ( job_number, vehicles ( id, registration ) )`,
        )
        .eq("garage_id", session.garageId)
        .or(`ended_at.is.null,ended_at.gte.${dayStart.toISOString()}`),
    ]);

  if (staffErr) {
    console.error("[staff-page] staff query error:", staffErr.message);
    return [];
  }
  if (logsErr) {
    console.error("[staff-page] work_logs query error:", logsErr.message);
  }

  const staff = (staffList ?? []) as StaffRow[];
  const logRows = (logs ?? []) as unknown as RawWorkLog[];

  const logsByStaff = new Map<string, RawWorkLog[]>();
  for (const log of logRows) {
    const arr = logsByStaff.get(log.staff_id) ?? [];
    arr.push(log);
    logsByStaff.set(log.staff_id, arr);
  }

  const now = new Date();
  return staff.map((s) => {
    const mine = logsByStaff.get(s.id) ?? [];
    const active = mine.find((l) => l.ended_at === null) ?? null;
    return {
      staff: { ...s, roles: s.roles ?? [] },
      status: computeStaffStatus(mine),
      activeWorkLog: active
        ? {
            id: active.id,
            jobId: active.job_id,
            jobNumber: active.jobs?.job_number ?? null,
            vehicleId: active.jobs?.vehicles?.id ?? null,
            vehicleReg: active.jobs?.vehicles?.registration ?? null,
            startedAt: active.started_at,
            pausedAt: active.paused_at,
            pausedSecondsTotal: active.paused_seconds_total ?? 0,
          }
        : null,
      jobsCompletedToday: jobsCompletedToday(
        mine.map((l) => ({ ended_at: l.ended_at, job_id: l.job_id })),
        now,
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// Detail page — single staff member, today's logs + this-week summary.
// ---------------------------------------------------------------------------

export interface StaffDetail {
  staff: StaffRow;
  activeWorkLog: ActiveWorkLogSummary | null;
  todayLogs: TodayLog[];
  weekTotalSeconds: number;
  weekJobsCompleted: number;
}

export interface TodayLog {
  id: string;
  jobId: string;
  jobNumber: string | null;
  vehicleId: string | null;
  vehicleReg: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  taskType: string;
}

interface RawDetailLog extends RawWorkLog {
  task_type: string;
  duration_seconds: number | null;
}

export async function getStaffDetail(
  staffId: string,
): Promise<StaffDetail | null> {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart);
  weekStart.setDate(weekStart.getDate() - 6); // Last 7 calendar days incl. today.

  const [
    { data: staffRow, error: staffErr },
    { data: logs, error: logsErr },
  ] = await Promise.all([
    supabase
      .from("staff")
      .select("id, full_name, email, phone, avatar_url, roles, garage_id")
      .eq("id", staffId)
      .eq("garage_id", session.garageId)
      .maybeSingle(),
    supabase
      .from("work_logs")
      .select(
        `id, staff_id, job_id, task_type, started_at, ended_at, paused_at,
         paused_seconds_total, duration_seconds,
         jobs ( job_number, vehicles ( id, registration ) )`,
      )
      .eq("garage_id", session.garageId)
      .eq("staff_id", staffId)
      .or(`ended_at.is.null,ended_at.gte.${weekStart.toISOString()}`)
      .order("started_at", { ascending: false }),
  ]);

  if (staffErr || !staffRow) {
    if (staffErr) console.error("[staff-detail] staff query error:", staffErr.message);
    return null;
  }
  if (logsErr) {
    console.error("[staff-detail] logs query error:", logsErr.message);
  }

  const logRows = (logs ?? []) as unknown as RawDetailLog[];
  const active = logRows.find((l) => l.ended_at === null) ?? null;

  const todayLogs: TodayLog[] = logRows
    .filter((l) => {
      if (!l.ended_at) return false;
      const ended = new Date(l.ended_at);
      return ended >= dayStart;
    })
    .map((l) => ({
      id: l.id,
      jobId: l.job_id,
      jobNumber: l.jobs?.job_number ?? null,
      vehicleId: l.jobs?.vehicles?.id ?? null,
      vehicleReg: l.jobs?.vehicles?.registration ?? null,
      startedAt: l.started_at,
      endedAt: l.ended_at,
      durationSeconds: l.duration_seconds,
      taskType: l.task_type,
    }));

  let weekTotalSeconds = 0;
  const weekJobIds = new Set<string>();
  for (const l of logRows) {
    if (l.ended_at) {
      weekTotalSeconds += l.duration_seconds ?? 0;
      weekJobIds.add(l.job_id);
    }
  }

  return {
    staff: {
      id: staffRow.id,
      full_name: staffRow.full_name,
      email: staffRow.email,
      phone: staffRow.phone,
      avatar_url: staffRow.avatar_url,
      roles: (staffRow.roles ?? []) as string[],
    },
    activeWorkLog: active
      ? {
          id: active.id,
          jobId: active.job_id,
          jobNumber: active.jobs?.job_number ?? null,
          vehicleId: active.jobs?.vehicles?.id ?? null,
          vehicleReg: active.jobs?.vehicles?.registration ?? null,
          startedAt: active.started_at,
          pausedAt: active.paused_at,
          pausedSecondsTotal: active.paused_seconds_total ?? 0,
        }
      : null,
    todayLogs,
    weekTotalSeconds,
    weekJobsCompleted: weekJobIds.size,
  };
}
