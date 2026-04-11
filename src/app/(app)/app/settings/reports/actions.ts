"use server";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Reporting server actions — all manager-only, all read-only.
 * Views filter by garage via RLS on the underlying tables.
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

export async function getWeeklyRevenue() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_weekly_revenue")
    .select("*")
    .order("completed_at", { ascending: false });
  return { data: data ?? [], error: error?.message };
}

export async function getTechHours() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_tech_hours")
    .select("*")
    .order("total_seconds", { ascending: false, nullsFirst: false });
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

export async function getCommonRepairs() {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_common_repairs")
    .select("*")
    .order("occurrence_count", { ascending: false });
  return { data: data ?? [], error: error?.message };
}
