import type { CSSProperties } from "react";

interface PatternProps {
  className?: string;
  /** Trace colour. Defaults to `var(--primary)`. */
  color?: string;
  /** 0–1. Default 0.05 (per UX-audit max for surfaces under data). */
  opacity?: number;
  /** Cell size in px. Default 304 (heropatterns.com original tile). */
  size?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
}

/** V4 — Circuit Board (Hero Patterns port).
 *
 *  Semantic: "engineered / mechanical" — fits the bay board's
 *  workshop-floor identity. Source: heropatterns.com, MIT-licensed.
 *  Re-painted via `currentColor` so V1 brand tokens re-theme it.
 *
 *  UX-audit guardrails:
 *    - opacity defaults to 0.05 — anything above ~0.06 lowers card
 *      contrast on the surface to under WCAG AA at edges.
 *    - `pointer-events-none` so the SVG never intercepts clicks
 *      from descendants (drag handles, links).
 */
export function CircuitBoardPattern({
  className,
  color = "var(--primary)",
  opacity = 0.05,
  size = 304,
  style,
  children,
}: PatternProps) {
  const id = `circuit-${size}`;
  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
        style={{ color, opacity }}
      >
        <defs>
          <pattern
            id={id}
            width={size}
            height={size}
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M5 100l30-30 30 30 30-30 30 30 30-30M5 200l30-30 30 30 30-30 30 30 30-30M5 300l30-30 30 30 30-30 30 30 30-30M150 25v50M150 100v50M150 200v50M150 275v25M50 25v50M50 175v25M50 250v50M250 25v50M250 100v50M250 175v50M250 275v25"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="50" cy="100" r="4" fill="currentColor" />
            <circle cx="150" cy="100" r="4" fill="currentColor" />
            <circle cx="250" cy="100" r="4" fill="currentColor" />
            <circle cx="50" cy="200" r="4" fill="currentColor" />
            <circle cx="150" cy="200" r="4" fill="currentColor" />
            <circle cx="250" cy="200" r="4" fill="currentColor" />
            <rect x="40" y="40" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" />
            <rect x="240" y="240" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" />
            <rect x="140" y="140" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      {children}
    </div>
  );
}
