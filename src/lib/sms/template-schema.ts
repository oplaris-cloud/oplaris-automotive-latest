// ────────────────────────────────────────────────────────────────────
// Shared schema + pure functions for the SMS-templates feature (P2.3).
//
// This file is import-safe from BOTH server and client modules — no
// `server-only` directive, no DB access, no env reads. The DB-aware
// renderer + admin-client fetch live in `templates.ts` (server-only).
//
// The split exists because `SmsTemplatesClient.tsx` (a `"use client"`
// component) needs `TEMPLATE_VARS` / `previewSegments` / etc. at the
// editor surface, and a single `templates.ts` with a `server-only`
// import would tree-shake-fail the client bundle (the directive runs
// at module load, regardless of which symbols the client imports).
// ────────────────────────────────────────────────────────────────────

export const TEMPLATE_KEYS = [
  "status_code",
  "approval_request",
  "mot_reminder",
  "quote_sent",
  "quote_updated",
  "invoice_sent",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Variables each template accepts. Keep in sync with migration 055
 *  / 057 default bodies + every call site. Adding a new variable is a
 *  three-edit chore: this list, the call site, and (usually) the
 *  default body. */
export const TEMPLATE_VARS: Record<TemplateKey, readonly string[]> = {
  status_code: ["code"],
  approval_request: ["garage_name", "description", "amount", "approval_url"],
  mot_reminder: ["garage_name", "vehicle_reg", "expiry_date"],
  quote_sent: ["garage_name", "reference", "vehicle_reg", "total", "status_url"],
  quote_updated: [
    "garage_name",
    "reference",
    "vehicle_reg",
    "revision",
    "total",
    "status_url",
  ],
  invoice_sent: ["garage_name", "reference", "vehicle_reg", "total", "status_url"],
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
  reference: "Quote / invoice number (e.g. INV-DUD-2026-00042)",
  total: "Total in £ (already formatted)",
  revision: "Quote revision number",
  status_url: "Customer status page URL",
};

/** What each template fires for. Surfaced as the editor card
 *  description so the manager knows when their changes go out. */
export const TEMPLATE_LABEL: Record<
  TemplateKey,
  { name: string; firesWhen: string }
> = {
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
  quote_sent: {
    name: "Quote sent",
    firesWhen:
      "Sent to a customer when staff click “Send Quote” on a job — first time the quote goes out.",
  },
  quote_updated: {
    name: "Quote updated",
    firesWhen:
      "Sent when a manager edits a quoted job and re-fires the SMS — copy includes the revision number.",
  },
  invoice_sent: {
    name: "Invoice sent",
    firesWhen:
      "Sent when a manager dispatches the final invoice. (Not yet wired to a button — the template seed is here so it’s ready when the call site lands.)",
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
  quote_sent: {
    garage_name: "Dudley Auto Service",
    reference: "INV-DUD-2026-00042",
    vehicle_reg: "AB12 CDE",
    total: "245.00",
    status_url: "https://example.com/status",
  },
  quote_updated: {
    garage_name: "Dudley Auto Service",
    reference: "INV-DUD-2026-00042",
    vehicle_reg: "AB12 CDE",
    revision: "2",
    total: "265.00",
    status_url: "https://example.com/status",
  },
  invoice_sent: {
    garage_name: "Dudley Auto Service",
    reference: "INV-DUD-2026-00042",
    vehicle_reg: "AB12 CDE",
    total: "265.00",
    status_url: "https://example.com/status",
  },
};

/** Mirrors the migration 055 + 057 seed values exactly — used as a
 *  last resort when the DB row is missing, AND as the template body
 *  the client-side preview falls back to if the editor is unsaved. */
export const FALLBACK_BODIES: Record<TemplateKey, string> = {
  status_code: "Your vehicle status code: {{code}}\nExpires in 10 minutes.",
  approval_request:
    "{{garage_name}} needs your approval: {{description}} — £{{amount}}.\n\nApprove or decline: {{approval_url}}",
  mot_reminder:
    "Hi from {{garage_name}}. Your vehicle {{vehicle_reg}} MOT expires on {{expiry_date}}. Reply to this message or call us to book a test.",
  quote_sent:
    "{{garage_name}}: Your quote {{reference}} for {{vehicle_reg}} is ready. Total £{{total}}. Review: {{status_url}}",
  quote_updated:
    "{{garage_name}}: Your quote {{reference}} for {{vehicle_reg}} has been updated (rev {{revision}}). New total £{{total}}. Review: {{status_url}}",
  invoice_sent:
    "{{garage_name}}: Your invoice {{reference}} for {{vehicle_reg}} is ready. Total £{{total}}. View and pay: {{status_url}}",
};

// ────────────────────────────────────────────────────────────────────
// Pure functions — safe to use from server or client.
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
