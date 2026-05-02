/**
 * B5.3 — composer functions for the 5 in-page list searches.
 *
 * The page-level Server Components import the composer + run the
 * query inline. Composers are pure & unit-testable; the multi-step
 * `searchCustomers` / `searchVehicles` runners exist only where the
 * search needs to fan out across two tables (e.g. customers <-> their
 * vehicles' regs). Tenant isolation is enforced by RLS on every
 * underlying table — the composers never do their own filtering.
 *
 * SmsType import is duplicated in the messages composer so the page
 * doesn't have to depend on the queue module.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SmsType } from "@/lib/sms/queue";

import { sanitiseSearch, buildPhonePatterns } from "./utils";

// ---------------------------------------------------------------------------
// Customers (full_name, email, phone, owned-vehicle reg) + TRADER chip
// ---------------------------------------------------------------------------

export interface CustomersSearchParams {
  q?: string | null;
  /** Comma-separated chip values from URL ("trader"). */
  filters?: string | null;
}

export interface CustomersSearchPredicate {
  q: string | null;
  phonePatterns: string[];
  traderOnly: boolean;
}

export function composeCustomersSearchPredicate(
  p: CustomersSearchParams,
): CustomersSearchPredicate {
  const cleaned = p.q ? sanitiseSearch(p.q) : "";
  const q = cleaned.length > 0 ? cleaned : null;
  const chips = (p.filters ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return {
    q,
    phonePatterns: q ? buildPhonePatterns(q) : [],
    traderOnly: chips.includes("trader"),
  };
}

// ---------------------------------------------------------------------------
// Vehicles (reg, make, model, owner.full_name)
// ---------------------------------------------------------------------------

export interface VehiclesSearchParams {
  q?: string | null;
}

export interface VehiclesSearchPredicate {
  q: string | null;
  /** Upper-cased copy of q for reg-style matching (regs are stored upper). */
  qUpper: string | null;
}

export function composeVehiclesSearchPredicate(
  p: VehiclesSearchParams,
): VehiclesSearchPredicate {
  const cleaned = p.q ? sanitiseSearch(p.q) : "";
  const q = cleaned.length > 0 ? cleaned : null;
  return { q, qUpper: q ? q.toUpperCase() : null };
}

interface VehicleListRow {
  id: string;
  registration: string;
  make: string | null;
  model: string | null;
  year: number | null;
  colour: string | null;
  customer:
    | { id: string; full_name: string; phone: string; is_trader: boolean }
    | null;
}

export async function searchVehicles(
  supabase: SupabaseClient,
  pred: VehiclesSearchPredicate,
  limit = 50,
): Promise<VehicleListRow[]> {
  let customerIds: string[] = [];
  if (pred.q) {
    const { data: cm } = await supabase
      .from("customers")
      .select("id")
      .is("deleted_at", null)
      .ilike("full_name", `%${pred.q}%`)
      .limit(200);
    customerIds = (cm ?? []).map((r) => r.id as string);
  }

  let query = supabase
    .from("vehicles")
    .select(
      `id, registration, make, model, year, colour,
       customer:customers!customer_id ( id, full_name, phone, is_trader )`,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (pred.q) {
    const ors = [
      `registration.ilike.%${pred.qUpper}%`,
      `make.ilike.%${pred.q}%`,
      `model.ilike.%${pred.q}%`,
    ];
    if (customerIds.length > 0) {
      ors.push(`customer_id.in.(${customerIds.join(",")})`);
    }
    query = query.or(ors.join(","));
  }

  const { data } = await query;
  return ((data ?? []) as unknown as VehicleListRow[]).map((v) => {
    const cust = Array.isArray(v.customer) ? v.customer[0] ?? null : v.customer;
    return { ...v, customer: cust };
  });
}

// ---------------------------------------------------------------------------
// Stock (description, sku, location)
// ---------------------------------------------------------------------------

export interface StockSearchParams {
  q?: string | null;
}

export interface StockSearchPredicate {
  q: string | null;
}

export function composeStockSearchPredicate(
  p: StockSearchParams,
): StockSearchPredicate {
  const cleaned = p.q ? sanitiseSearch(p.q) : "";
  return { q: cleaned.length > 0 ? cleaned : null };
}

// ---------------------------------------------------------------------------
// Warranties (part name = stock_item.description, supplier, invoice_reference,
// claim_reason)
//
// Note: warranties are stock-only — there's no customer column. The spec
// asked for "customer name" as a search field; the schema doesn't model
// it (M1.12 — stock-only supplier warranties, no job coupling). We
// search the four fields that ARE on the warranty + its joined stock
// item description, which preserves the spirit of "find a warranty by
// what it covers and who supplied it".
// ---------------------------------------------------------------------------

export interface WarrantiesSearchParams {
  q?: string | null;
}

export interface WarrantiesSearchPredicate {
  q: string | null;
}

export function composeWarrantiesSearchPredicate(
  p: WarrantiesSearchParams,
): WarrantiesSearchPredicate {
  const cleaned = p.q ? sanitiseSearch(p.q) : "";
  return { q: cleaned.length > 0 ? cleaned : null };
}

// ---------------------------------------------------------------------------
// Messages (phone normalised, message_body, vehicle reg) + message_type chips
// ---------------------------------------------------------------------------

const VALID_MESSAGE_TYPES: SmsType[] = [
  "mot_reminder_30d",
  "mot_reminder_7d",
  "mot_reminder_5d",
  "quote_sent",
  "quote_updated",
  "approval_request",
  "status_code",
  "invoice_sent",
];

const MESSAGE_TYPE_SET = new Set<SmsType>(VALID_MESSAGE_TYPES);

export interface MessagesSearchParams {
  q?: string | null;
  /** Comma-separated SmsType values from URL or controlled state. */
  types?: string | string[] | null;
  status?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface MessagesSearchPredicate {
  q: string | null;
  phonePatterns: string[];
  types: SmsType[];
  status: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

export function composeMessagesSearchPredicate(
  p: MessagesSearchParams,
): MessagesSearchPredicate {
  const cleaned = p.q ? sanitiseSearch(p.q) : "";
  const q = cleaned.length > 0 ? cleaned : null;

  const rawTypes: string[] = Array.isArray(p.types)
    ? p.types
    : (p.types ?? "")
        .split(",")
        .map((s) => s.trim());
  const types: SmsType[] = [];
  for (const t of rawTypes) {
    if (t.length === 0) continue;
    if (MESSAGE_TYPE_SET.has(t as SmsType)) {
      types.push(t as SmsType);
    }
  }

  return {
    q,
    phonePatterns: q ? buildPhonePatterns(q) : [],
    types,
    status: p.status?.trim() ? p.status.trim() : null,
    dateFrom: p.dateFrom?.trim() ? p.dateFrom.trim() : null,
    dateTo: p.dateTo?.trim() ? p.dateTo.trim() : null,
  };
}
