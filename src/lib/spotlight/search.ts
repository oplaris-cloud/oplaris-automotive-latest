/**
 * B5.4 — Global spotlight (Cmd+K) cross-entity search.
 *
 * Server-only — every query runs through the user-session Supabase
 * client so RLS keeps the result set inside the caller's garage.
 * Never use the service-role client here; doing so would let one
 * garage's manager spotlight-search another garage's customers.
 *
 * The fan-out is exactly five entities: jobs (5), customers (5),
 * vehicles (5), messages (3), stock (3). Per-entity caps come from
 * the audit's cognitive-load reference — more than 5 in a group
 * pushes the next group below the fold and dilutes the picker.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sanitiseSearch, buildPhonePatterns } from "@/lib/search/utils";

export type SpotlightKind =
  | "job"
  | "customer"
  | "vehicle"
  | "message"
  | "stock";

export interface SpotlightResult {
  id: string;
  kind: SpotlightKind;
  label: string;
  sublabel: string | null;
  href: string;
}

export interface SpotlightGroups {
  jobs: SpotlightResult[];
  customers: SpotlightResult[];
  vehicles: SpotlightResult[];
  messages: SpotlightResult[];
  stock: SpotlightResult[];
}

export const EMPTY_GROUPS: SpotlightGroups = {
  jobs: [],
  customers: [],
  vehicles: [],
  messages: [],
  stock: [],
};

const LIMIT_LARGE = 5;
const LIMIT_SMALL = 3;

/**
 * Run all five entity searches in parallel and assemble the result
 * payload. Each entity function is independently RLS-scoped; the
 * fanout never makes its own filtering decisions about garage_id.
 */
export async function searchSpotlight(
  supabase: SupabaseClient,
  rawQ: string,
): Promise<SpotlightGroups> {
  const q = sanitiseSearch(rawQ);
  if (q.length === 0) return EMPTY_GROUPS;

  const phonePatterns = buildPhonePatterns(q);

  const [jobs, customers, vehicles, messages, stock] = await Promise.all([
    searchJobsForSpotlight(supabase, q, phonePatterns),
    searchCustomersForSpotlight(supabase, q, phonePatterns),
    searchVehiclesForSpotlight(supabase, q),
    searchMessagesForSpotlight(supabase, q, phonePatterns),
    searchStockForSpotlight(supabase, q),
  ]);

  return { jobs, customers, vehicles, messages, stock };
}

// ---------------------------------------------------------------------------
// Per-entity functions — each returns up to N rows of `SpotlightResult`.
// ---------------------------------------------------------------------------

async function searchJobsForSpotlight(
  supabase: SupabaseClient,
  q: string,
  phonePatterns: string[],
): Promise<SpotlightResult[]> {
  // Resolve customer matches first (name, phone, email) so we can
  // pull jobs by their customer_id even when the search term doesn't
  // match the job's own description / number.
  const customerOr = [
    `full_name.ilike.%${q}%`,
    `email.ilike.%${q}%`,
    ...phonePatterns.map((p) => `phone.ilike.%${p}%`),
  ].join(",");
  const { data: cm } = await supabase
    .from("customers")
    .select("id")
    .is("deleted_at", null)
    .or(customerOr)
    .limit(50);
  const customerIds = (cm ?? []).map((r) => r.id as string);

  const upper = q.toUpperCase();
  const { data: vm } = await supabase
    .from("vehicles")
    .select("id")
    .or(`registration.ilike.%${upper}%`)
    .limit(50);
  const vehicleIds = (vm ?? []).map((r) => r.id as string);

  const ors: string[] = [
    `description.ilike.%${q}%`,
    `job_number.ilike.%${q}%`,
  ];
  if (customerIds.length > 0) {
    ors.push(`customer_id.in.(${customerIds.join(",")})`);
  }
  if (vehicleIds.length > 0) {
    ors.push(`vehicle_id.in.(${vehicleIds.join(",")})`);
  }

  const { data } = await supabase
    .from("jobs")
    .select(
      `id, job_number, status, description,
       customers!customer_id ( full_name ),
       vehicles!vehicle_id ( registration )`,
    )
    .is("deleted_at", null)
    .or(ors.join(","))
    .order("created_at", { ascending: false })
    .limit(LIMIT_LARGE);

  return ((data ?? []) as unknown as RawJob[]).map((j) => {
    const customer = Array.isArray(j.customers) ? j.customers[0] : j.customers;
    const vehicle = Array.isArray(j.vehicles) ? j.vehicles[0] : j.vehicles;
    const sublabelParts = [
      customer?.full_name,
      vehicle?.registration,
      j.status?.replace(/_/g, " "),
    ].filter(Boolean);
    return {
      id: j.id,
      kind: "job",
      label: j.job_number,
      sublabel: sublabelParts.length > 0 ? sublabelParts.join(" · ") : null,
      href: `/app/jobs/${j.id}`,
    };
  });
}

async function searchCustomersForSpotlight(
  supabase: SupabaseClient,
  q: string,
  phonePatterns: string[],
): Promise<SpotlightResult[]> {
  const ors = [
    `full_name.ilike.%${q}%`,
    `email.ilike.%${q}%`,
    ...phonePatterns.map((p) => `phone.ilike.%${p}%`),
  ];
  const { data } = await supabase
    .from("customers")
    .select("id, full_name, phone, email")
    .is("deleted_at", null)
    .or(ors.join(","))
    .order("full_name", { ascending: true })
    .limit(LIMIT_LARGE);

  return (data ?? []).map((c) => ({
    id: c.id as string,
    kind: "customer" as const,
    label: c.full_name as string,
    sublabel: [c.phone, c.email].filter(Boolean).join(" · ") || null,
    href: `/app/customers/${c.id}`,
  }));
}

async function searchVehiclesForSpotlight(
  supabase: SupabaseClient,
  q: string,
): Promise<SpotlightResult[]> {
  const upper = q.toUpperCase();
  const { data } = await supabase
    .from("vehicles")
    .select(
      `id, registration, make, model, year,
       customer:customers!customer_id ( full_name )`,
    )
    .is("deleted_at", null)
    .or(
      `registration.ilike.%${upper}%,make.ilike.%${q}%,model.ilike.%${q}%`,
    )
    .order("created_at", { ascending: false })
    .limit(LIMIT_LARGE);

  return ((data ?? []) as unknown as RawVehicle[]).map((v) => {
    const cust = Array.isArray(v.customer) ? v.customer[0] : v.customer;
    return {
      id: v.id,
      kind: "vehicle" as const,
      label: v.registration,
      sublabel: [
        [v.make, v.model].filter(Boolean).join(" "),
        cust?.full_name,
      ]
        .filter((s) => Boolean(s))
        .join(" · ") || null,
      href: `/app/vehicles/${v.id}`,
    };
  });
}

async function searchMessagesForSpotlight(
  supabase: SupabaseClient,
  q: string,
  phonePatterns: string[],
): Promise<SpotlightResult[]> {
  // sms_outbox is manager-only SELECT (mig 047). The fanout won't
  // surface anything for tech / mot_tester sessions — that's correct.
  const phoneOr = phonePatterns
    .map((p) => `phone.ilike.%${p}%`)
    .join(",");
  const orParts = [`message_body.ilike.%${q}%`];
  if (phoneOr.length > 0) orParts.push(phoneOr);

  const { data } = await supabase
    .from("sms_outbox")
    .select(
      `id, phone, message_body, message_type, customer_id,
       customers:customers!customer_id ( full_name )`,
    )
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .limit(LIMIT_SMALL);

  return ((data ?? []) as unknown as RawMessage[]).map((m) => {
    const cust = Array.isArray(m.customers) ? m.customers[0] : m.customers;
    const body = m.message_body ?? "";
    const trimmed = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    return {
      id: m.id,
      kind: "message" as const,
      label: trimmed || "(no body)",
      sublabel: [cust?.full_name, m.phone, m.message_type].filter(Boolean).join(" · ") || null,
      // Messages page is filter-driven not per-row — link to the page.
      href: `/app/messages`,
    };
  });
}

async function searchStockForSpotlight(
  supabase: SupabaseClient,
  q: string,
): Promise<SpotlightResult[]> {
  // stock_items has no `supplier` column (suppliers live on warranties
  // + job_parts). Searching description + sku + location matches the
  // spec's spirit ("part name") without misreading the schema.
  const { data } = await supabase
    .from("stock_items")
    .select("id, description, sku, location, quantity_on_hand")
    .or(`description.ilike.%${q}%,sku.ilike.%${q}%,location.ilike.%${q}%`)
    .order("description", { ascending: true })
    .limit(LIMIT_SMALL);

  return (data ?? []).map((s) => ({
    id: s.id as string,
    kind: "stock" as const,
    label: s.description as string,
    sublabel: [s.sku, s.location, `qty ${s.quantity_on_hand ?? 0}`]
      .filter(Boolean)
      .join(" · ") || null,
    href: `/app/stock`,
  }));
}

// ---------------------------------------------------------------------------
// Raw shape types — Supabase types relations as either {} | {}[] depending
// on metadata; we explicitly cast to these and unwrap once.
// ---------------------------------------------------------------------------
interface RawJob {
  id: string;
  job_number: string;
  status: string | null;
  description: string | null;
  customers?: { full_name: string } | { full_name: string }[] | null;
  vehicles?: { registration: string } | { registration: string }[] | null;
}

interface RawVehicle {
  id: string;
  registration: string;
  make: string | null;
  model: string | null;
  year: number | null;
  customer?: { full_name: string } | { full_name: string }[] | null;
}

interface RawMessage {
  id: string;
  phone: string | null;
  message_body: string | null;
  message_type: string | null;
  customer_id: string | null;
  customers?: { full_name: string } | { full_name: string }[] | null;
}
