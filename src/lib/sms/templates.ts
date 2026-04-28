import "server-only";

import { cache } from "react";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  FALLBACK_BODIES,
  substitute,
  type TemplateKey,
} from "./template-schema";

// ────────────────────────────────────────────────────────────────────
// Server-side renderer for SMS templates (P2.3).
//
// Pure schema (TEMPLATE_KEYS / TEMPLATE_VARS / SAMPLE_VARS /
// previewSegments / substitute) lives in `template-schema.ts` so the
// editor's `"use client"` component can import it without dragging
// `server-only` + the admin client into the browser bundle. Anything
// that touches the DB stays here.
// ────────────────────────────────────────────────────────────────────

// Re-export the schema for the existing call sites that import from
// this module. Adding a new server-only consumer? Import from here.
// Adding a client consumer? Import from `template-schema` directly.
export {
  FALLBACK_BODIES,
  SAMPLE_VARS,
  TEMPLATE_KEYS,
  TEMPLATE_LABEL,
  TEMPLATE_VARS,
  TEMPLATE_VAR_HINTS,
  normaliseAppUrl,
  previewSegments,
  substitute,
  type PreviewSegment,
  type TemplateKey,
} from "./template-schema";

/** Per-request cache so multiple `renderTemplate(...)` calls within
 *  the same Server Action / API route hit the DB once. The admin
 *  client is used because some call sites run in service-role
 *  contexts (e.g. status-page request-code where the caller isn't
 *  authenticated). The RLS policy doesn't apply to service-role —
 *  we still scope by the explicit garage_id passed in. */
const fetchTemplatesForGarage = cache(
  async (garageId: string): Promise<Map<TemplateKey, string>> => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("sms_templates")
      .select("template_key, body")
      .eq("garage_id", garageId);
    const map = new Map<TemplateKey, string>();
    for (const row of data ?? []) {
      map.set(row.template_key as TemplateKey, row.body);
    }
    return map;
  },
);

/** Fetch the template body + run substitution. Falls back to the
 *  stored default if the row is missing for any reason (e.g. a
 *  garage created before migration 055 and the seed trigger hadn't
 *  fired) — better to send the canonical default than to throw and
 *  miss the SMS entirely. */
export async function renderTemplate(
  key: TemplateKey,
  vars: Record<string, string>,
  garageId: string,
): Promise<string> {
  const map = await fetchTemplatesForGarage(garageId);
  const body = map.get(key) ?? FALLBACK_BODIES[key];
  return substitute(body, vars);
}
