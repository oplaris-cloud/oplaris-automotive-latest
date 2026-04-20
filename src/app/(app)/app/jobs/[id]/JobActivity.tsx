import {
  ArrowLeftRight,
  CornerDownLeft,
  Play,
  CircleDot,
  Activity,
  GitBranch,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatWorkLogDuration, formatWorkLogTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getJobTimelineEvents,
  type TimelineRow,
} from "@/lib/timeline/fetch";
import { CUSTOMER_STATUS_LABELS } from "@/lib/timeline/customer-labels";

import { LogWorkDialog } from "./LogWorkDialog";

/**
 * P54 — Unified Job Activity feed. Replaces the old Pass-back timeline
 * and Work Log sections on the job detail page, and (via audience=
 * "customer") powers the public status page view.
 *
 * Data: `public.job_timeline_events` view (security_invoker=on). Fetcher
 * in `src/lib/timeline/fetch.ts` applies RLS + per-audience shaping.
 *
 * Realtime: the caller is responsible for mounting `<JobActivityRealtime
 * jobId=... />` from `@/lib/realtime/shims` alongside this component.
 */

interface JobActivityProps {
  jobId: string;
  audience: "staff" | "customer";
  /** Staff-only — wires the Log Work button + the dialog. Pass null
   *  for non-managers or the customer audience. */
  logWorkContext?: {
    garageId: string;
    staff: { id: string; full_name: string }[];
  } | null;
}

export async function JobActivity({
  jobId,
  audience,
  logWorkContext,
}: JobActivityProps): Promise<React.JSX.Element> {
  const events = await getJobTimelineEvents(jobId, { audience });

  // Client-side safety sort: DB's ORDER BY over a UNION ALL view isn't
  // fully stable across ties (and PostgREST doesn't guarantee it end-to-
  // end either). Sort by `at` desc, with `eventId` as the tiebreaker so
  // renders are deterministic across refreshes.
  const sorted = [...events].sort((a, b) => {
    const t = b.at.localeCompare(a.at);
    if (t !== 0) return t;
    return a.eventId.localeCompare(b.eventId);
  });

  // Running work sessions pin to the top regardless of `at`. A session
  // that started three hours ago is still "now" — it out-ranks more
  // recent, but completed, events.
  const running = sorted.filter((e) => e.kind === "work_running");
  const rest = sorted.filter((e) => e.kind !== "work_running");

  // React key must be unique. The underlying view emits the same
  // `event_id` twice for pass-back rows — once for the `passed_to_*`
  // event and once for the `returned_from_*` event. Composing
  // `kind-eventId` disambiguates them.
  const keyFor = (e: TimelineRow) => `${e.kind}-${e.eventId}`;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Job Activity</h2>
        {audience === "staff" && logWorkContext ? (
          <LogWorkDialog
            jobId={jobId}
            garageId={logWorkContext.garageId}
            staff={logWorkContext.staff}
          />
        ) : null}
      </div>

      {events.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>No activity logged yet.</span>
        </div>
      ) : (
        <ol className="space-y-2">
          {running.map((e) => (
            <TimelineEventRow key={keyFor(e)} event={e} audience={audience} />
          ))}
          {rest.map((e) => (
            <TimelineEventRow key={keyFor(e)} event={e} audience={audience} />
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row rendering
// ---------------------------------------------------------------------------

interface RowProps {
  event: TimelineRow;
  audience: "staff" | "customer";
}

function TimelineEventRow({ event, audience }: RowProps): React.JSX.Element {
  if (audience === "customer") {
    return <CustomerRow event={event} />;
  }
  return <StaffRow event={event} />;
}

function RowShell({
  accent,
  icon,
  primary,
  meta,
  timestamp,
  pinned = false,
}: {
  accent: "amber" | "green" | "neutral" | "live";
  icon: React.ReactNode;
  primary: React.ReactNode;
  meta?: React.ReactNode;
  timestamp: string;
  pinned?: boolean;
}): React.JSX.Element {
  const accentClass =
    accent === "amber"
      ? "bg-warning/10 text-warning"
      : accent === "green"
        ? "bg-success/10 text-success"
        : accent === "live"
          ? "bg-success/10 text-success ring-2 ring-success/50"
          : "bg-muted text-muted-foreground";

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-3",
        pinned
          ? "border-success/40 bg-success/5"
          : "border-border bg-background",
      )}
    >
      <div
        className={cn(
          "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          accentClass,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{primary}</div>
        {meta ? (
          <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
        ) : null}
        <div className="mt-1 text-[11px] text-muted-foreground">
          {formatWorkLogTime(timestamp)}
        </div>
      </div>
    </li>
  );
}

// ---- Staff rendering ------------------------------------------------------

function StaffRow({ event }: { event: TimelineRow }): React.JSX.Element {
  const actor = event.actorFirstName ?? null;
  const payload = event.payload;

  switch (event.kind) {
    case "passed_to_mechanic":
    case "passed_to_mot_tester": {
      const target =
        event.kind === "passed_to_mechanic" ? "Mechanic" : "MOT tester";
      const note = typeof payload.note === "string" ? payload.note : null;
      const itemCount = Array.isArray(payload.items)
        ? (payload.items as unknown[]).length
        : 0;
      return (
        <RowShell
          accent="amber"
          icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
          primary={`${actor ?? "Manager"} passed to ${target}`}
          meta={
            <>
              {itemCount > 0 ? <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span> : null}
              {note ? <span>{itemCount > 0 ? " · " : ""}&ldquo;{note}&rdquo;</span> : null}
            </>
          }
          timestamp={event.at}
        />
      );
    }

    case "returned_from_mechanic":
    case "returned_from_mot_tester": {
      const returner =
        event.kind === "returned_from_mechanic" ? "Mechanic" : "MOT tester";
      return (
        <RowShell
          accent="green"
          icon={<CornerDownLeft className="h-3.5 w-3.5" />}
          primary={`${returner} returned job`}
          meta={actor ? `by ${actor}` : null}
          timestamp={event.at}
        />
      );
    }

    case "work_session": {
      const seconds =
        typeof payload.duration_seconds === "number"
          ? payload.duration_seconds
          : null;
      const endedAt =
        typeof payload.ended_at === "string" ? payload.ended_at : null;
      return (
        <RowShell
          accent="neutral"
          icon={<Play className="h-3.5 w-3.5" />}
          primary={`${actor ?? "A technician"} worked ${formatWorkLogDuration(seconds ?? undefined)}`}
          meta={
            <>
              {formatWorkLogTime(event.at)} → {formatWorkLogTime(endedAt)}
              {typeof payload.task_type === "string" ? (
                <span className="ml-1 capitalize">
                  · {String(payload.task_type).replace(/_/g, " ")}
                </span>
              ) : null}
            </>
          }
          timestamp={event.at}
        />
      );
    }

    case "work_running": {
      return (
        <RowShell
          accent="live"
          icon={
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
          }
          primary={`${actor ?? "A technician"} is working now`}
          meta={`started ${formatWorkLogTime(event.at)}`}
          timestamp={event.at}
          pinned
        />
      );
    }

    case "status_changed": {
      const from =
        typeof payload.from_status === "string" ? payload.from_status : null;
      const to =
        typeof payload.to_status === "string" ? payload.to_status : null;
      if (!to) return <RowShell accent="neutral" icon={<GitBranch className="h-3.5 w-3.5" />} primary="Status changed" timestamp={event.at} />;
      return (
        <RowShell
          accent="neutral"
          icon={<GitBranch className="h-3.5 w-3.5" />}
          primary={
            <span className="flex flex-wrap items-center gap-1.5">
              Status:
              {from ? (
                <>
                  <Badge variant="outline" className="font-mono text-[10px] capitalize">
                    {from.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                </>
              ) : null}
              <Badge variant="secondary" className="font-mono text-[10px] capitalize">
                {to.replace(/_/g, " ")}
              </Badge>
            </span>
          }
          meta={actor ? `by ${actor}` : null}
          timestamp={event.at}
        />
      );
    }

    default:
      return (
        <RowShell
          accent="neutral"
          icon={<CircleDot className="h-3.5 w-3.5" />}
          primary={event.kind}
          timestamp={event.at}
        />
      );
  }
}

// ---- Customer rendering ---------------------------------------------------

function CustomerRow({ event }: { event: TimelineRow }): React.JSX.Element {
  // The fetcher has already attached customerCopy and filtered the kind set.
  // Anything without copy shouldn't reach this renderer, but fail soft.
  const copy = event.customerCopy;
  if (!copy) {
    return (
      <RowShell
        accent="neutral"
        icon={<CircleDot className="h-3.5 w-3.5" />}
        primary="Update"
        timestamp={event.at}
      />
    );
  }

  const pinned = event.kind === "work_running";
  const accent = iconAccentForCustomer(event.kind);
  const icon = iconForCustomer(event.kind);

  return (
    <RowShell
      accent={accent}
      icon={icon}
      primary={copy.line}
      meta={copy.detail}
      timestamp={event.at}
      pinned={pinned}
    />
  );
}

function iconAccentForCustomer(kind: string): "amber" | "green" | "neutral" | "live" {
  switch (kind) {
    case "passed_to_mechanic":
      return "amber";
    case "returned_from_mechanic":
      return "green";
    case "work_running":
      return "live";
    case "work_session":
      return "neutral";
    case "status_changed":
      return "neutral";
    default:
      return "neutral";
  }
}

function iconForCustomer(kind: string): React.ReactNode {
  switch (kind) {
    case "passed_to_mechanic":
      return <ArrowLeftRight className="h-3.5 w-3.5" />;
    case "returned_from_mechanic":
      return <CornerDownLeft className="h-3.5 w-3.5" />;
    case "work_running":
      return (
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
        </span>
      );
    case "work_session":
      return <Play className="h-3.5 w-3.5" />;
    case "status_changed":
      return <GitBranch className="h-3.5 w-3.5" />;
    default:
      return <CircleDot className="h-3.5 w-3.5" />;
  }
}

// Re-export the status label map for contexts that only need the static
// lookup (e.g. a curated highlight outside this feed).
export { CUSTOMER_STATUS_LABELS };
