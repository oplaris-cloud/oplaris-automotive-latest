import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** P56.3 (UI-M7) — Canonical loading states.
 *
 *  Three surfaces:
 *    - `<LoadingState.Page>`   — full page skeleton (title + 3 cards)
 *    - `<LoadingState.Grid>`   — table/list row skeleton (parametric rows)
 *    - `<LoadingState.Inline>` — spinner + label, for buttons + inline fetches
 *
 *  Every variant renders `aria-live="polite"` with a screen-reader-only
 *  label so assistive tech announces the wait (WCAG 4.1.3).
 */

function SrStatus({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}

function LoadingPage({
  label = "Loading page",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      data-slot="loading-state"
      data-variant="page"
      className={cn("space-y-6", className)}
      aria-busy
    >
      <SrStatus label={label} />
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}

function LoadingGrid({
  rows = 6,
  label = "Loading list",
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      data-slot="loading-state"
      data-variant="grid"
      className={cn("space-y-2", className)}
      aria-busy
    >
      <SrStatus label={label} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function LoadingInline({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      data-slot="loading-state"
      data-variant="inline"
      className={cn(
        "inline-flex items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
      aria-busy
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export const LoadingState = {
  Page: LoadingPage,
  Grid: LoadingGrid,
  Inline: LoadingInline,
};
