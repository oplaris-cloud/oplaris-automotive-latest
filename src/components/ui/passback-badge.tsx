import { ArrowRightLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** P56.3 (UI-H2) — Passback badge.
 *
 *  Semantic `--warning` chip for the MOT-tester ↔ mechanic pass-back
 *  flow (P51). When `items` is supplied, hover/focus reveals the 11-item
 *  pass-back checklist that triggered the flip.
 *
 *  Usage:
 *    <PassbackBadge />
 *    <PassbackBadge items={["Brake pads", "Wipers", "Light bulb (N/S front)"]} />
 */

interface PassbackBadgeProps {
  /** Optional pass-back checklist items — renders as a tooltip list. */
  items?: string[];
  /** Optional free-text note accompanying the pass-back. */
  note?: string;
  className?: string;
}

export function PassbackBadge({ items, note, className }: PassbackBadgeProps) {
  const chip = (
    <span
      data-slot="passback-badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-warning px-3 py-1 text-xs font-medium text-warning-foreground",
        className,
      )}
    >
      <ArrowRightLeft className="h-3.5 w-3.5" />
      Passed back
    </span>
  );

  const hasDetails = (items && items.length > 0) || Boolean(note);
  if (!hasDetails) return chip;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {chip}
            </button>
          }
        />
        <TooltipContent side="bottom" className="max-w-xs">
          {items && items.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-xs">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {note ? (
            <p
              className={cn(
                "text-xs",
                items && items.length > 0 ? "mt-2" : undefined,
              )}
            >
              {note}
            </p>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
