import * as React from "react";

import { cn } from "@/lib/utils";

/** P56.0 (S-H1, S-H5, S-H8) — Canonical section wrapper.
 *
 *  Owns the `mt-8 first:mt-0` rhythm between named sections + an
 *  optional `<PageSectionHeader>` row (title + description + right-
 *  aligned actions slot). Body is rendered with a `mt-3` gap so every
 *  section on the app has identical heading-to-content spacing —
 *  killing the `mt-3 / mt-4` drift the audit flagged.
 *
 *  Pair with `<Stack gap="sm|md|lg">` for the children so the entire
 *  spacing chain is token-driven. DESIGN_SYSTEM §1.3 is authoritative.
 */

type SectionGap = "sm" | "md" | "lg";

interface SectionProps extends Omit<React.ComponentPropsWithoutRef<"section">, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned slot in the header — primary CTAs, filter pills, etc. */
  actions?: React.ReactNode;
  /** Controls the gap between consecutive sections. `md` (32 px) is
   *  the spec default — only bump to `lg` for landing-page-scale
   *  separation. `sm` (16 px) is for sub-sections inside a larger
   *  container where `<Section>` nests inside another `<Section>`. */
  gap?: SectionGap;
}

const SECTION_GAP: Record<SectionGap, string> = {
  sm: "mt-4 first:mt-0", // 16 px — nested
  md: "mt-8 first:mt-0", // 32 px — default
  lg: "mt-12 first:mt-0", // 48 px — between unrelated panels
};

export function Section({
  title,
  description,
  actions,
  gap = "md",
  className,
  children,
  ...props
}: SectionProps) {
  const hasHeader = title || description || actions;
  return (
    <section
      data-slot="section"
      data-gap={gap}
      className={cn(SECTION_GAP[gap], className)}
      {...props}
    >
      {hasHeader ? (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-heading text-lg font-semibold leading-tight">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className={cn(hasHeader && "mt-3")}>{children}</div>
    </section>
  );
}
