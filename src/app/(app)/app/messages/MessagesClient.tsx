"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { CustomerNameLink } from "@/components/ui/customer-name-link";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Hourglass,
  MoreHorizontal,
  Send,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RegPlate } from "@/components/ui/reg-plate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import {
  cancelMessage,
  getMessages,
  retryMessage,
  type MessageKpis,
  type MessageRow,
  type MessagesFilter,
  type MessagesPage,
  type SmsStatus,
} from "./actions";
import type { SmsType } from "@/lib/sms/queue";
import { canRetry, formatRetryWindow } from "@/lib/sms/retry-policy";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  initialKpis: MessageKpis;
  initialPage: MessagesPage;
}

// ---------------------------------------------------------------------------
// Static lookup tables
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<SmsType, string> = {
  mot_reminder_30d: "MOT 30d",
  mot_reminder_7d: "MOT 7d",
  mot_reminder_5d: "MOT 5d",
  quote_sent: "Quote",
  quote_updated: "Quote (updated)",
  approval_request: "Approval",
  status_code: "Status code",
  invoice_sent: "Invoice",
};

/** Tailwind classes for the type chip — paired with ux-audit colour map. */
const TYPE_CLASS: Record<SmsType, string> = {
  mot_reminder_30d: "bg-warning/15 text-foreground",
  mot_reminder_7d: "bg-warning/25 text-foreground",
  mot_reminder_5d: "bg-warning text-warning-foreground",
  quote_sent: "bg-info/15 text-info",
  quote_updated: "bg-info/25 text-info",
  approval_request: "bg-primary/15 text-primary",
  status_code: "bg-muted text-muted-foreground",
  invoice_sent: "bg-success/15 text-success",
};

const STATUS_LABEL: Record<SmsStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
  // P2.2 — auto-retry exhausted; manager intervention recommended.
  // Manual Retry from the row actions still works.
  failed_final: "Failed (no retry)",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<SmsStatus, string> = {
  queued: "bg-warning/15 text-foreground",
  sent: "bg-info/15 text-info",
  delivered: "bg-success/15 text-success",
  failed: "bg-destructive/10 text-destructive",
  // Same destructive tint as `failed` so both flag the manager's eye,
  // with a heavier border to distinguish "auto-retry over" from
  // "still being retried".
  failed_final: "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
  cancelled: "bg-muted text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessagesClient({ initialKpis, initialPage }: Props) {
  const [filter, setFilter] = useState<MessagesFilter>({});
  const [page, setPage] = useState<MessagesPage>(initialPage);
  const [pageNumber, setPageNumber] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [isPending, startTransition] = useTransition();

  // Debounced search — 300ms after the manager stops typing.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilter((f) => ({ ...f, search: searchInput.trim() || undefined }));
      setPageNumber(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Refetch whenever filter or page changes.
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const next = await getMessages(filter, pageNumber);
      if (!cancelled) setPage(next);
    });
    return () => {
      cancelled = true;
    };
  }, [filter, pageNumber]);

  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const failedNow = useMemo(
    () => page.rows.filter((r) => r.status === "failed").length,
    [page.rows],
  );

  // P2.9 — visible eligible-for-bulk-retry count powers the "Retry
  // all eligible" button label + disabled state. Counts both `failed`
  // and `failed_final` so a manager hand-firing the bulk action picks
  // up the cron-aged rows too.
  const bulkRetryable = useMemo(
    () =>
      page.rows.filter((r) => {
        if (r.status !== "failed" && r.status !== "failed_final") return false;
        return canRetry(r.messageType, r.createdAt).ok;
      }),
    [page.rows],
  );

  function handleRetry(id: string) {
    startTransition(async () => {
      const result = await retryMessage({ id });
      if (!result.ok) {
        toast.error(result.error ?? "Retry failed");
        return;
      }
      toast.success("Message resent");
      const next = await getMessages(filter, pageNumber);
      setPage(next);
    });
  }

  // P2.9 — bulk retry orchestrates client-side over the existing
  // single-row action so the security gate (canRetry on the server)
  // remains the source of truth. Skipped rows are reported in the
  // toast so the manager knows what didn't go.
  function handleRetryAllEligible() {
    if (bulkRetryable.length === 0) return;
    startTransition(async () => {
      let retried = 0;
      let skipped = 0;
      for (const row of bulkRetryable) {
        const r = await retryMessage({ id: row.id });
        if (r.ok) retried += 1;
        else skipped += 1;
      }
      const totalFailedRows = page.rows.filter(
        (r) => r.status === "failed" || r.status === "failed_final",
      ).length;
      const ineligible = totalFailedRows - bulkRetryable.length;
      const summary =
        skipped + ineligible > 0
          ? `Retried ${retried}, skipped ${skipped + ineligible} (expired or ineligible).`
          : `Retried ${retried}.`;
      toast.success(summary);
      const next = await getMessages(filter, pageNumber);
      setPage(next);
    });
  }

  async function handleCancel(id: string) {
    const result = await cancelMessage({ id, reason: "manual" });
    if (!result.ok) {
      toast.error(result.error ?? "Cancel failed");
      return;
    }
    toast.success("Message cancelled");
    const next = await getMessages(filter, pageNumber);
    setPage(next);
  }

  return (
    <>
      {/* KPI strip — initialKpis is the SSR snapshot; we don't refetch
       *  the KPIs on filter changes because they describe the whole
       *  garage, not the current view. */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Sent today" value={initialKpis.sentToday} />
        <KpiCard
          label="Failed"
          value={initialKpis.failed}
          tone={initialKpis.failed > 0 ? "destructive" : "neutral"}
        />
        <KpiCard label="Queued" value={initialKpis.queued} />
      </div>

      {/* Filter bar */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="msg-type">Type</Label>
          <Select
            value={filter.type ?? "all"}
            onValueChange={(v) => {
              setFilter((f) => ({
                ...f,
                type: v === "all" ? "all" : (v as SmsType),
              }));
              setPageNumber(1);
            }}
          >
            <SelectTrigger id="msg-type" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(TYPE_LABEL) as SmsType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="msg-status">Status</Label>
          <Select
            value={filter.status ?? "all"}
            onValueChange={(v) => {
              setFilter((f) => ({
                ...f,
                status: v === "all" ? "all" : (v as SmsStatus),
              }));
              setPageNumber(1);
            }}
          >
            <SelectTrigger id="msg-status" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_LABEL) as SmsStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="msg-from">From</Label>
          <Input
            id="msg-from"
            type="date"
            value={filter.dateFrom ?? ""}
            onChange={(e) => {
              setFilter((f) => ({ ...f, dateFrom: e.target.value || undefined }));
              setPageNumber(1);
            }}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="msg-to">To</Label>
          <Input
            id="msg-to"
            type="date"
            value={filter.dateTo ?? ""}
            onChange={(e) => {
              setFilter((f) => ({ ...f, dateTo: e.target.value || undefined }));
              setPageNumber(1);
            }}
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Label htmlFor="msg-search">Search</Label>
          <Input
            id="msg-search"
            placeholder="Phone number or registration"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      {/* P2.9 — Failed-tab utility row. Bulk retry orchestrates over
       *  the per-row retry action, applying canRetry per row so we
       *  don't burn SMS on expired-by-policy content. */}
      {failedNow > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {failedNow} failed message{failedNow === 1 ? "" : "s"} on this page.
            {bulkRetryable.length > 0
              ? ` ${bulkRetryable.length} eligible to retry.`
              : ""}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending || bulkRetryable.length === 0}
            onClick={handleRetryAllEligible}
          >
            <Send className="h-4 w-4" />
            {isPending ? "Retrying…" : `Retry all eligible (${bulkRetryable.length})`}
          </Button>
        </div>
      ) : null}

      {/* Table — desktop */}
      {page.rows.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No messages"
          description="Outgoing SMS will appear here as soon as a quote, approval, or status code is sent."
          className="mt-6"
        />
      ) : (
        <>
          <div className="mt-6 hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>To</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.rows.map((row) => (
                  <MessageTableRow
                    key={row.id}
                    row={row}
                    expanded={expanded === row.id}
                    onToggle={() =>
                      setExpanded((cur) => (cur === row.id ? null : row.id))
                    }
                    onRetry={() => handleRetry(row.id)}
                    onCancel={() => handleCancel(row.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="mt-6 space-y-2 md:hidden">
            {page.rows.map((row) => (
              <MessageMobileCard
                key={row.id}
                row={row}
                expanded={expanded === row.id}
                onToggle={() =>
                  setExpanded((cur) => (cur === row.id ? null : row.id))
                }
                onRetry={() => handleRetry(row.id)}
                onCancel={() => handleCancel(row.id)}
              />
            ))}
          </ul>
        </>
      )}

      {/* Pagination */}
      {page.total > page.pageSize ? (
        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {pageNumber} of {totalPages} · {page.total} total
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pageNumber >= totalPages}
              onClick={() => setPageNumber((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "destructive";
}) {
  return (
    <Card size="sm" className={tone === "destructive" && value > 0 ? "border-destructive/40" : ""}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "text-2xl font-bold tabular-nums",
            tone === "destructive" && value > 0 && "text-destructive",
          )}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: SmsStatus }) {
  const Icon =
    status === "queued"
      ? Hourglass
      : status === "delivered"
        ? CheckCircle2
        : status === "failed" || status === "failed_final"
          ? XCircle
          : status === "cancelled"
            ? XCircle
            : Send;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium",
        STATUS_CLASS[status],
      )}
    >
      <Icon className="h-3 w-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function TypeBadge({ type }: { type: SmsType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium",
        TYPE_CLASS[type],
      )}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

interface RowActionsProps {
  row: MessageRow;
  onRetry: () => void;
  onCancel: () => void;
}

function RowActions({ row, onRetry, onCancel }: RowActionsProps) {
  // failed_final means "cron has given up auto-retrying" — manual
  // intervention is the whole point of the state, so the Retry action
  // stays available. Manager can still re-fire (creates a fresh row).
  const isFailed = row.status === "failed" || row.status === "failed_final";
  // P2.9 — type-aware retry policy. status_code older than 8m, or
  // mot_reminder/approval_request older than 24h, is refused
  // server-side. We mirror the check here so the menu item is
  // disabled with a tooltip; the action would also reject if forced.
  const retryDecision = isFailed
    ? canRetry(row.messageType, row.createdAt)
    : { ok: false, reason: "unknown_type" as const, ageMs: 0, windowMs: null };
  const canCancel = row.status === "queued";
  const hasVehicle = row.vehicleId !== null;
  const hasJob = row.jobId !== null;

  if (!isFailed && !canCancel && !hasVehicle && !hasJob) return null;

  const retryDisabledReason =
    isFailed && !retryDecision.ok
      ? retryDecision.reason === "expired_by_policy"
        ? `This ${TYPE_LABEL[row.messageType]} is older than the ${formatRetryWindow(row.messageType)} retry window — sending it now would arrive after expiry.`
        : `Unknown message type — cancel this row instead.`
      : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label="Row actions" />
        }
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isFailed ? (
          retryDisabledReason ? (
            <TooltipProvider delay={150}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenuItem
                      disabled
                      onClick={(e) => e.preventDefault()}
                    >
                      <Send className="h-4 w-4" /> Retry send
                    </DropdownMenuItem>
                  }
                />
                <TooltipContent side="left" className="max-w-xs">
                  {retryDisabledReason}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <DropdownMenuItem onClick={onRetry}>
              <Send className="h-4 w-4" /> Retry send
            </DropdownMenuItem>
          )
        ) : null}
        {canCancel ? (
          <ConfirmDialog
            trigger={
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => e.preventDefault()}
              >
                <XCircle className="h-4 w-4" /> Cancel
              </DropdownMenuItem>
            }
            title="Cancel this scheduled message?"
            description="The customer will not receive it. The row stays in the log for audit."
            confirmLabel="Cancel message"
            destructive
            onConfirm={onCancel}
          />
        ) : null}
        {hasVehicle ? (
          <Link href={`/app/vehicles/${row.vehicleId}`}>
            <DropdownMenuItem>View vehicle</DropdownMenuItem>
          </Link>
        ) : null}
        {hasJob ? (
          <Link href={`/app/jobs/${row.jobId}`}>
            <DropdownMenuItem>View job</DropdownMenuItem>
          </Link>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RowProps {
  row: MessageRow;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

function MessageTableRow({ row, expanded, onToggle, onRetry, onCancel }: RowProps) {
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/30"
        onClick={onToggle}
      >
        <TableCell>
          {row.vehicleReg ? (
            <RegPlate
              reg={row.vehicleReg}
              size="sm"
              vehicleId={row.vehicleId}
            />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          <div className="mt-1 text-xs text-muted-foreground">{row.phone}</div>
        </TableCell>
        <TableCell>
          <TypeBadge type={row.messageType} />
        </TableCell>
        <TableCell className="max-w-md text-sm">
          {truncate(row.messageBody, 60)}
        </TableCell>
        <TableCell>
          <StatusBadge status={row.status} />
        </TableCell>
        <TableCell className="text-xs text-muted-foreground" title={row.createdAt}>
          {row.scheduledFor && row.status === "queued" ? (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(row.scheduledFor).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </span>
          ) : (
            relativeTime(row.createdAt)
          )}
        </TableCell>
        <TableCell
          className="text-right"
          onClick={(e) => e.stopPropagation()}
        >
          <RowActions row={row} onRetry={onRetry} onCancel={onCancel} />
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/20">
            <ExpandedDetail row={row} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function MessageMobileCard({ row, expanded, onToggle, onRetry, onCancel }: RowProps) {
  return (
    <li className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {row.vehicleReg ? (
              <RegPlate reg={row.vehicleReg} size="sm" />
            ) : (
              <span className="text-xs text-muted-foreground">{row.phone}</span>
            )}
            <TypeBadge type={row.messageType} />
          </div>
          <p className="mt-2 text-sm">{truncate(row.messageBody, 80)}</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={row.status} />
            <span className="text-xs text-muted-foreground">
              {relativeTime(row.createdAt)}
            </span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {expanded ? (
        <div className="border-t p-3">
          <ExpandedDetail row={row} />
          <div className="mt-3">
            <RowActions row={row} onRetry={onRetry} onCancel={onCancel} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function ExpandedDetail({ row }: { row: MessageRow }) {
  return (
    <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-[140px_1fr]">
      <dt className="text-muted-foreground">Full message</dt>
      <dd className="whitespace-pre-wrap">{row.messageBody}</dd>

      <dt className="text-muted-foreground">Phone</dt>
      <dd className="font-mono text-xs">{row.phone}</dd>

      {row.customerFullName ? (
        <>
          <dt className="text-muted-foreground">Customer</dt>
          <dd>
            <CustomerNameLink
              customerId={row.customerId}
              fullName={row.customerFullName}
              isTrader={row.customerIsTrader}
            />
          </dd>
        </>
      ) : null}

      {row.jobNumber ? (
        <>
          <dt className="text-muted-foreground">Job</dt>
          <dd>
            <Link
              href={`/app/jobs/${row.jobId}`}
              className="font-mono text-primary hover:underline"
            >
              {row.jobNumber}
            </Link>
          </dd>
        </>
      ) : null}

      {row.twilioSid ? (
        <>
          <dt className="text-muted-foreground">Twilio SID</dt>
          <dd className="font-mono text-xs">{row.twilioSid}</dd>
        </>
      ) : null}

      <dt className="text-muted-foreground">Created</dt>
      <dd>
        {new Date(row.createdAt).toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </dd>

      {row.statusUpdatedAt ? (
        <>
          <dt className="text-muted-foreground">Status updated</dt>
          <dd>
            {new Date(row.statusUpdatedAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </dd>
        </>
      ) : null}

      {row.errorCode || row.errorMessage ? (
        <>
          <dt className="text-muted-foreground">Error</dt>
          <dd className="text-destructive">
            {row.errorCode ? (
              <span className="font-mono">[{row.errorCode}] </span>
            ) : null}
            {row.errorMessage}
          </dd>
        </>
      ) : null}

      {row.cancelReason === "mot_renewed_elsewhere" ? (
        <>
          <dt className="text-muted-foreground">DVSA pre-check</dt>
          <dd>MOT renewed at another garage — reminder skipped</dd>
        </>
      ) : null}
    </dl>
  );
}
