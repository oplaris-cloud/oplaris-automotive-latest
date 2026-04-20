import * as React from "react";
import { Inbox, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** V3 — Empty-state surface.
 *
 *  Two presentation modes:
 *    - `icon`         (default): a 24-px Lucide glyph in a muted circle.
 *      Used for terse panels (sub-sections, dropdown surfaces, dialogs).
 *    - `illustration` (preferred for primary list pages): a themed
 *      illustration component from `@/components/illustrations` whose
 *      palette is wired through the V1 brand CSS variables. Renders at
 *      ~160 px tall on mobile, ~240 px on `sm+`.
 *
 *  Pick `illustration` for top-of-page list emptiness; pick `icon` for
 *  any inline / dense / secondary surface where a hero illustration
 *  would feel overweight.
 */

interface EmptyStateProps {
  icon?: LucideIcon;
  /** Themed illustration component. Wins over `icon` when both supplied. */
  illustration?: React.ComponentType<{ className?: string; title?: string }>;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  illustration: Illustration,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center",
        className,
      )}
    >
      {Illustration ? (
        <Illustration
          title=""
          className="h-40 w-40 sm:h-60 sm:w-60 text-muted-foreground"
        />
      ) : (
        <div className="rounded-full bg-muted p-3">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <h3 className={cn("text-base font-semibold", Illustration ? "mt-2" : "mt-4")}>
        {title}
      </h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel ? (
        actionHref ? (
          <a href={actionHref}>
            <Button className="mt-4" size="sm">
              {actionLabel}
            </Button>
          </a>
        ) : (
          <Button className="mt-4" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        )
      ) : null}
    </div>
  );
}
