import "server-only";

import { cache } from "react";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// ────────────────────────────────────────────────────────────────────
// Per-garage SMS templates (P2.3, migration 055).
//
// Replaces hardcoded strings in queueSms call sites with manager-
// editable bodies. Each template_key has a fixed VARIABLE schema —
// the renderer accepts only the listed keys, throws on unknown ones,
// and substitutes `{{var}}` tokens with the supplied values.
//
// At the editor surface (`/app/settings/sms`) the same VARIABLE schema
// drives:
//   - the "click to insert" chip list under each editor
//   - the sample-vars used to render the live preview
// so manager and renderer always agree on what the variables mean.
// ────────────────────────────────────────────────────────────────────

export const TEMPLATE_KEYS = [
  "status_code",
  "approval_request",
  "mot_reminder",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Variables each template accepts. Keep in sync with migration 055
 *  default bodies + every call site. Adding a new variable is a
 *  three-edit chore: this list, the call site, and (usually) the
 *  default body. */
export const TEMPLATE_VARS: Record<TemplateKey, readonly string[]> = {
  status_code: ["code"],
  approval_request: ["garage_name", "description", "amount", "approval_url"],
  mot_reminder: ["garage_name", "vehicle_reg", "expiry_date"],
} as const;

/** Human-friendly labels surfaced on the settings page next to each
 *  template's variable chips. The renderer never reads these — only
 *  the chip UI does. */
export const TEMPLATE_VAR_HINTS: Record<string, string> = {
  code: "Six-digit OTP",
  garage_name: "Brand name (Settings → Branding)",
  description: "What the customer is approving",
  amount: "Amount in £ (already formatted)",
  approval_url: "Signed approval link",
  vehicle_reg: "Vehicle registration",
  expiry_date: "MOT expiry date",
};

/** What each template fires for. Surfaced as the editor card
 *  description so the manager knows when their changes go out. */
export const TEMPLATE_LABEL: Record<TemplateKey, { name: string; firesWhen: string }> = {
  status_code: {
    name: "Status code",
    firesWhen:
      "Sent to a customer when they request a verification code on the public status page.",
  },
  approval_request: {
    name: "Approval request",
    firesWhen:
      "Sent to a customer when staff click “Request approval” on a charge or quote.",
  },
  mot_reminder: {
    name: "MOT reminder",
    firesWhen:
      "Sent automatically to customers whose MOT is approaching expiry.",
  },
};

/** Sample values used to render the preview pane. Realistic enough
 *  that the manager can eyeball line breaks and segment boundaries.
 *  Unfilled variables show as a tinted placeholder in the preview
 *  rather than disappearing. */
export const SAMPLE_VARS: Record<TemplateKey, Record<string, string>> = {
  status_code: { code: "482917" },
  approval_request: {
    garage_name: "Dudley Auto Service",
    description: "Replace front brake pads",
    amount: "245.00",
    approval_url: "https://example.com/approve/abc123",
  },
  mot_reminder: {
    garage_name: "Dudley Auto Service",
    vehicle_reg: "AB12 CDE",
    expiry_date: "12 May 2026",
  },
};

// ────────────────────────────────────────────────────────────────────
// Renderer
// ────────────────────────────────────────────────────────────────────

/** `{{var}}` substitution. Variables not in `vars` are left as a
 *  literal placeholder so we never silently send a half-filled SMS;
 *  the call site is expected to provide every variable in the
 *  template's schema. */
export function substitute(
  body: string,
  vars: Record<string, string | undefined>,
): string {
  return body.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (raw, key) => {
    const v = vars[key];
    return v ?? raw;
  });
}

/** Pure function for the editor preview. Returns an array of segments
 *  so the UI can render filled `{{var}}` substitutions inline and
 *  unfilled ones as tinted placeholders. */
export interface PreviewSegment {
  type: "text" | "filled" | "unfilled";
  value: string;
  /** For filled/unfilled segments, the variable name. */
  varName?: string;
}

export function previewSegments(
  body: string,
  vars: Record<string, string>,
): PreviewSegment[] {
  const out: PreviewSegment[] = [];
  const re = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) {
      out.push({ type: "text", value: body.slice(lastIndex, match.index) });
    }
    const varName = match[1];
    if (!varName) {
      lastIndex = match.index + match[0].length;
      continue;
    }
    const filled = vars[varName];
    out.push(
      filled !== undefined
        ? { type: "filled", value: filled, varName }
        : { type: "unfilled", value: `[${varName}]`, varName },
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    out.push({ type: "text", value: body.slice(lastIndex) });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Server-side fetch + render
// ────────────────────────────────────────────────────────────────────

/** Per-request cache so multiple `renderTemplate(...)` calls within
 *  the same Server Action / API route hit the DB once. The admin
 *  client is used because some call sites run in service-role
 *  contexts (e.g. status-page request-code where the caller isn't
 *  authenticated). The RLS policy doesn't apply to service-role —
 *  we still scope by the explicit garage_id passed in. */
const fetchTemplatesForGarage = cache(
  async (
    garageId: string,
  ): Promise<Map<TemplateKey, string>> => {
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

/** Mirrors the migration 055 seed values exactly — used as a last
 *  resort when the DB row is missing. */
const FALLBACK_BODIES: Record<TemplateKey, string> = {
  status_code: "Your vehicle status code: {{code}}\nExpires in 10 minutes.",
  approval_request:
    "{{garage_name}} needs your approval: {{description}} — £{{amount}}.\n\nApprove or decline: {{approval_url}}",
  mot_reminder:
    "Hi from {{garage_name}}. Your vehicle {{vehicle_reg}} MOT expires on {{expiry_date}}. Reply to this message or call us to book a test.",
};
