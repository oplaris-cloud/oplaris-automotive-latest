/**
 * B5.1 — Jobs list server-side search.
 *
 * Compose a search predicate from URL searchParams, then execute it
 * against the active Supabase client. Tenant isolation is enforced by
 * RLS on `jobs` / `customers` / `vehicles` — we never bypass via
 * service-role here.
 *
 * The cross-table OR ("name OR reg OR phone") is split into three
 * RLS-scoped sub-queries (customers, vehicles, then jobs). Each step
 * filters by garage_id implicitly through the caller's session.
 *
 * Phone matching is liberal: a query of "07911 123456" should also find
 * customers stored as "+447911123456" or "447911123456". We try the raw
 * input + every E.164 variant we can derive via libphonenumber-js.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalisePhoneSafe } from "@/lib/validation/phone";

export interface JobsSearchParams {
  q?: string | null;
  /** datetime-local string (e.g. "2026-04-30T09:00") — UI native. */
  from?: string | null;
  to?: string | null;
  status?: string | null;
}

export interface JobsSearchPredicate {
  q: string | null;
  fromTs: string | null;
  toTs: string | null;
  status: string | null;
  /** Patterns to ILIKE-match against `customers.phone`. */
  phonePatterns: string[];
}

/**
 * Reserved chars in PostgREST `.or()` filter values — strip from the
 * raw search query so a curious user typing "(brake)" doesn't break
 * the filter. None of these chars are meaningful for typical
 * name/reg/phone/description matches.
 */
function sanitise(raw: string): string {
  return raw.replace(/[,()*\\"']/g, " ").trim();
}

/**
 * Build a set of patterns to ILIKE-match against `customers.phone`.
 * UK numbers are stored E.164 ("+44…") but staff search by any
 * variant, so we expand the haystack rather than constraining input.
 */
function buildPhonePatterns(q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const out = new Set<string>();
  out.add(trimmed);

  const normalised = normalisePhoneSafe(trimmed);
  if (normalised) {
    out.add(normalised);
    if (normalised.startsWith("+44")) {
      out.add(`0${normalised.slice(3)}`); // local UK form: 07911…
      out.add(normalised.slice(3));        // bare national: 7911…
      out.add(normalised.slice(1));        // digits-only with country: 447911…
    }
  }
  return Array.from(out);
}

/** Pure, testable. */
export function composeJobsSearchPredicate(
  p: JobsSearchParams,
): JobsSearchPredicate {
  const rawQ = p.q?.trim() ?? "";
  const cleaned = sanitise(rawQ);
  const q = cleaned.length > 0 ? cleaned : null;

  const fromTs = p.from ? new Date(p.from).toISOString() : null;
  const toTs = p.to ? new Date(p.to).toISOString() : null;
  const status = p.status?.trim() ? p.status.trim() : null;

  return {
    q,
    fromTs,
    toTs,
    status,
    phonePatterns: q ? buildPhonePatterns(q) : [],
  };
}

interface JobRow {
  id: string;
  job_number: string;
  status: string;
  description: string | null;
  created_at: string;
  estimated_ready_at: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  customers: { full_name: string; is_trader: boolean } | null;
  vehicles:
    | { registration: string; make: string | null; model: string | null }
    | null;
}

/**
 * Execute the search. Three RLS-scoped queries:
 *   1. customers matching name/email/phone → customer IDs
 *   2. vehicles matching reg/make/model → vehicle IDs
 *   3. jobs scoped to the union of those IDs OR description/job_number
 *
 * Steps 1 & 2 run only when there's a text query. The `q`-empty path
 * is a single jobs query with optional status + date filters.
 */
export async function searchJobs(
  supabase: SupabaseClient,
  pred: JobsSearchPredicate,
  limit = 50,
): Promise<JobRow[]> {
  let customerIds: string[] = [];
  let vehicleIds: string[] = [];

  if (pred.q) {
    const customerOrParts = [
      `full_name.ilike.%${pred.q}%`,
      `email.ilike.%${pred.q}%`,
      ...pred.phonePatterns.map((p) => `phone.ilike.%${p}%`),
    ];
    const { data: cm } = await supabase
      .from("customers")
      .select("id")
      .is("deleted_at", null)
      .or(customerOrParts.join(","))
      .limit(200);
    customerIds = (cm ?? []).map((r) => r.id as string);

    const { data: vm } = await supabase
      .from("vehicles")
      .select("id")
      .or(
        `registration.ilike.%${pred.q}%,make.ilike.%${pred.q}%,model.ilike.%${pred.q}%`,
      )
      .limit(200);
    vehicleIds = (vm ?? []).map((r) => r.id as string);
  }

  let query = supabase
    .from("jobs")
    .select(
      `id, job_number, status, description, created_at, estimated_ready_at,
       customer_id, vehicle_id,
       customers!customer_id ( full_name, is_trader ),
       vehicles!vehicle_id ( registration, make, model )`,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (pred.status) query = query.eq("status", pred.status);
  if (pred.fromTs) query = query.gte("created_at", pred.fromTs);
  if (pred.toTs) query = query.lte("created_at", pred.toTs);

  if (pred.q) {
    const ors: string[] = [];
    if (customerIds.length > 0) {
      ors.push(`customer_id.in.(${customerIds.join(",")})`);
    }
    if (vehicleIds.length > 0) {
      ors.push(`vehicle_id.in.(${vehicleIds.join(",")})`);
    }
    ors.push(`description.ilike.%${pred.q}%`);
    ors.push(`job_number.ilike.%${pred.q}%`);
    query = query.or(ors.join(","));
  }

  const { data } = await query;
  return (data ?? []) as unknown as JobRow[];
}
