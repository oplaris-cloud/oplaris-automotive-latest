// P54 — Customer-facing copy for the Job Activity feed.
//
// The view `public.job_timeline_events` returns a superset of events —
// e.g. returned_from_mot_tester, internal status wobbles, work sessions
// by role, etc. The customer only sees a curated slice with plain-
// English labels. Kinds absent from `CUSTOMER_KIND_COPY` are filtered
// out at the fetcher level.
//
// Staff names on this map are ALWAYS first-name only (per Hossein's
// Decision #3 on 2026-04-14). The fetcher redacts before passing into
// these builders; the builders just format.

import { formatWorkLogDuration } from "@/lib/format";

export type CustomerFriendlyCopy = {
  /** Primary text on the timeline row. */
  line: string;
  /** Optional short metadata line (time shown separately). */
  detail?: string;
};

type CopyInput = {
  payload: Record<string, unknown>;
  actorFirstName: string | null;
};

// Status values that are worth surfacing to the customer. Anything else
// (draft / checked_in / cancelled / awaiting_mechanic) is internal and
// would only confuse them. Order matters only for the reverse lookup.
export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  in_diagnosis: "Diagnosis in progress",
  in_repair: "Repair in progress",
  awaiting_parts: "Waiting on parts",
  awaiting_customer_approval: "Waiting for your approval",
  ready_for_collection: "Ready for collection",
  completed: "Completed",
};

/**
 * Customer-visible kinds with their copy builders. Return `null` from
 * a builder to suppress a particular event — used for `status_changed`
 * when the target status isn't in the customer-safe list.
 */
export const CUSTOMER_KIND_COPY: Record<
  string,
  (input: CopyInput) => CustomerFriendlyCopy | null
> = {
  passed_to_mechanic: () => ({
    line: "Passed to mechanic for repair work",
  }),
  returned_from_mechanic: () => ({
    line: "Mechanic finished — back with MOT tester",
  }),
  work_running: ({ actorFirstName }) => ({
    line: `${actorFirstName ?? "A technician"} is working on your car now`,
  }),
  work_session: ({ payload, actorFirstName }) => {
    const seconds =
      typeof payload.duration_seconds === "number"
        ? payload.duration_seconds
        : null;
    const duration = formatWorkLogDuration(seconds ?? undefined);
    const who = actorFirstName ?? "A technician";
    return {
      line: `${who} worked for ${duration}`,
    };
  },
  status_changed: ({ payload }) => {
    const to =
      typeof payload.to_status === "string" ? payload.to_status : null;
    if (!to) return null;
    const label = CUSTOMER_STATUS_LABELS[to];
    if (!label) return null;
    return { line: label };
  },
};

export function isCustomerVisibleKind(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(CUSTOMER_KIND_COPY, kind);
}

/** Extract a best-effort first name from a full name, for privacy. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}
