import * as React from "react";

import { cn } from "@/lib/utils";

/** P56.3 (UI-H5, UI-M1) — Canonical page title.
 *
 *  Renders an `<h1>` at `text-2xl font-heading font-semibold`. Optional
 *  `description` subtitle and `actions` slot (right-aligned CTA row).
 *  Owns the `mb-6` gap to the first content block — drop any surrounding
 *  `mt-*` / `mb-*` tokens at the call-site.
 *
 *  Usage:
 *    <PageTitle
 *      title="Customers"
 *      description="All records in this garage."
 *      actions={<Button>Add customer</Button>}
 *    />
 */

type PageTitleGap = "sm" | "md" | "lg";

interface PageTitleProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Bottom gap to the first content block. Default `md` = 24 px. */
  gap?: PageTitleGap;
  className?: string;
}

const TITLE_GAP: Record<PageTitleGap, string> = {
  sm: "mb-4",
  md: "mb-6",
  lg: "mb-8",
};

export function PageTitle({
  title,
  description,
  actions,
  gap = "md",
  className,
}: PageTitleProps) {
  return (
    <header
      data-slot="page-title"
      className={cn(
        "flex flex-wrap items-end justify-between gap-3",
        TITLE_GAP[gap],
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
