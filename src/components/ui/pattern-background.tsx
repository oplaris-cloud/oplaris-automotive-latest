import * as React from "react";

import { cn } from "@/lib/utils";

/** V4.1 — Bespoke car-part seamless pattern background.
 *
 *  Replaces the generic Hero Patterns approach with a single bespoke
 *  hand-drawn SVG sourced from the same artist as the empty-state
 *  illustration kit, so the whole app reads as one design language.
 *
 *  Source: `public/pattern/pattern.svg` — monochrome line art, so the
 *  pattern stays neutral regardless of which garage's brand colours
 *  apply. `dark:invert` flips the strokes to white on dark mode.
 *
 *  Why it's a wrapper (not a Tailwind utility): opacity has to go on
 *  the pattern layer ONLY, never on the children. A plain
 *  `opacity-5` class on the wrapper would fade the real content too.
 *  The pseudo layer + pointer-events-none idiom also keeps the
 *  wrapper click-transparent so links underneath work.
 *
 *  UX-audit-driven opacity caps (per `VISUAL_IMPLEMENTATION_PLAN.md §V4.2`):
 *    - 0.04 (4%) — hero surfaces (login, kiosk welcome)
 *    - 0.03 (3%) — background to data (bay-board, status, empty states)
 *    - 0.02 (2%) — watermark (PDF header, print)
 *  Opacities above 0.06 start competing with body text contrast.
 *
 *  Usage:
 *    <PatternBackground opacity={0.04} className="rounded-xl p-8">
 *      {content}
 *    </PatternBackground>
 */

interface PatternBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–1. Defaults to 0.04 — the UX-audit hero-surface cap. */
  opacity?: number;
  /** Tile size in px. Default 480 (image is 2000×2000, this keeps the
   *  strokes readable at screen scale without tiling lines looking
   *  repetitive). */
  size?: number;
  /** Image path. Default `/pattern/pattern.svg`. Override if a garage
   *  ships their own seamless tile. */
  src?: string;
  /** When true, skip the dark-mode invert filter. Useful when the
   *  surface is already rendered on top of a fixed-dark panel and
   *  should stay grey regardless of user theme. */
  preserveContrast?: boolean;
}

export function PatternBackground({
  opacity = 0.04,
  size = 480,
  src = "/pattern/pattern.svg",
  preserveContrast = false,
  className,
  children,
  ...props
}: PatternBackgroundProps) {
  return (
    <div
      data-slot="pattern-background"
      className={cn("relative", className)}
      {...props}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 bg-repeat",
          !preserveContrast && "dark:invert",
        )}
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: `${size}px`,
          opacity,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
