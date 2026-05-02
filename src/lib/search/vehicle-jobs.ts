/**
 * B5.2 — Per-vehicle Job History search.
 *
 * Vehicle scope is implicit (the page route is /app/vehicles/<id>) so
 * the predicate just needs:
 *   - free-text q: match jobs.description OR job_charges.description
 *     OR job_parts.description for jobs on this vehicle
 *   - repair-type chips: match bookings.service for jobs originating
 *     from a check-in (mot / electrical / maintenance)
 *
 * The schema doesn't have invoices.description (the spec mentioned it
 * but no such column exists — invoices store totals + status only),
 * so the description fan-out is jobs + job_charges + job_parts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type RepairChip = "mot" | "electrical" | "maintenance";

export const REPAIR_CHIP_OPTIONS = [
  { value: "mot", label: "MOT" },
  { value: "electrical", label: "Electrical" },
  { value: "maintenance", label: "Maintenance" },
] as const;

export interface VehicleJobsSearchParams {
  q?: string | null;
  /** Comma-separated chip values from URL ("mot,electrical"). */
  repair?: string | null;
}

export interface VehicleJobsSearchPredicate {
  q: string | null;
  repairChips: RepairChip[];
}

const VALID_CHIPS = new Set<RepairChip>(["mot", "electrical", "maintenance"]);

function sanitise(raw: string): string {
  // Same conservative filter as the jobs predicate composer — keep
  // PostgREST .or() values free of reserved chars.
  return raw.replace(/[,()*\\"']/g, " ").trim();
}

function parseChips(raw: string | null | undefined): RepairChip[] {
  if (!raw) return [];
  const out: RepairChip[] = [];
  for (const part of raw.split(",")) {
    const v = part.trim().toLowerCase();
    if (v && VALID_CHIPS.has(v as RepairChip)) {
      out.push(v as RepairChip);
    }
  }
  return out;
}

export function composeVehicleJobsSearchPredicate(
  p: VehicleJobsSearchParams,
): VehicleJobsSearchPredicate {
  const cleaned = p.q ? sanitise(p.q) : "";
  return {
    q: cleaned.length > 0 ? cleaned : null,
    repairChips: parseChips(p.repair),
  };
}

interface JobRow {
  id: string;
  job_number: string;
  status: string;
  description: string | null;
  created_at: string;
  completed_at: string | null;
  bay_name: string | null;
  service: RepairChip | null;
}

interface RawJob {
  id: string;
  job_number: string;
  status: string;
  description: string | null;
  created_at: string;
  completed_at: string | null;
  bays?: { name: string } | null;
  bookings?: { service: RepairChip }[] | null;
}

/**
 * Fetch + filter the job history for a single vehicle. Vehicle scope
 * comes from the caller (we trust the page-route id). RLS still
 * applies because we use the user-session client.
 *
 * Implementation notes:
 *   - We over-fetch the jobs first (no q/chip filter on this query
 *     beyond vehicle_id). Dudley's largest single-vehicle history is
 *     under ~60 rows, so the filter-in-memory cost is negligible.
 *   - For text search we additionally pull `job_charges` /
 *     `job_parts` rows whose description ILIKE %q%, get their
 *     `job_id`, and treat any of those as a hit.
 *   - For chips we look at `bookings.service` joined onto the job
 *     (1:N in theory but typically 1:1 for v1). A job with no
 *     booking row never matches a chip filter.
 */
export async function searchVehicleJobs(
  supabase: SupabaseClient,
  vehicleId: string,
  pred: VehicleJobsSearchPredicate,
): Promise<JobRow[]> {
  const { data: rawJobs } = await supabase
    .from("jobs")
    .select(
      `id, job_number, status, description, created_at, completed_at,
       bays:bays!bay_id ( name ),
       bookings ( service )`,
    )
    .eq("vehicle_id", vehicleId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const jobs: JobRow[] = ((rawJobs ?? []) as unknown as RawJob[]).map((j) => {
    const bay = Array.isArray(j.bays) ? j.bays[0] : j.bays;
    // bookings is 1:N — use the first row's service. v1 garages only
    // ever produce one booking per job (kiosk + manager paths both
    // create one); future pass-back churn doesn't add bookings.
    const booking = Array.isArray(j.bookings) ? j.bookings[0] : null;
    return {
      id: j.id,
      job_number: j.job_number,
      status: j.status,
      description: j.description,
      created_at: j.created_at,
      completed_at: j.completed_at,
      bay_name: bay?.name ?? null,
      service: booking?.service ?? null,
    };
  });

  // Empty-predicate fast path.
  if (!pred.q && pred.repairChips.length === 0) return jobs;

  let descriptionMatchIds = new Set<string>();
  if (pred.q) {
    const jobIds = jobs.map((j) => j.id);
    if (jobIds.length === 0) return [];

    // job_charges.description ILIKE — limit to this vehicle's jobs
    const { data: chargeMatches } = await supabase
      .from("job_charges")
      .select("job_id")
      .in("job_id", jobIds)
      .ilike("description", `%${pred.q}%`)
      .limit(500);
    chargeMatches?.forEach((c) => descriptionMatchIds.add(c.job_id as string));

    // job_parts.description ILIKE — same scope
    const { data: partMatches } = await supabase
      .from("job_parts")
      .select("job_id")
      .in("job_id", jobIds)
      .ilike("description", `%${pred.q}%`)
      .limit(500);
    partMatches?.forEach((p) => descriptionMatchIds.add(p.job_id as string));
  }

  const lcQ = pred.q?.toLowerCase() ?? null;
  const chips = new Set(pred.repairChips);

  return jobs.filter((j) => {
    if (chips.size > 0) {
      if (!j.service || !chips.has(j.service)) return false;
    }
    if (lcQ) {
      const ownDesc = (j.description ?? "").toLowerCase();
      const ownNum = j.job_number.toLowerCase();
      const ok =
        ownDesc.includes(lcQ) ||
        ownNum.includes(lcQ) ||
        descriptionMatchIds.has(j.id);
      if (!ok) return false;
    }
    return true;
  });
}
