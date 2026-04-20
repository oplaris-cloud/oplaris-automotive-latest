import type { CSSProperties } from "react";

interface PatternProps {
  className?: string;
  /** Cloud stroke colour. Defaults to `var(--primary)`. */
  color?: string;
  /** 0–1. Default 0.06. Use 0.04 if body text overlays the surface. */
  opacity?: number;
  /** Cloud tile size in px. Default 56. */
  size?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
}

/** V4 — Endless Clouds (Hero Patterns port).
 *
 *  Semantic: "calm / soft / approachable" — fits the customer-facing
 *  status-page banner where we want to deflate anxiety ("is my car
 *  ready?"). Source: heropatterns.com.
 *
 *  UX-audit caveat: only use as a **header band**, not a full-page
 *  background. The status page renders dense status copy below the
 *  banner; tiling clouds across that copy hurts scannability and
 *  drops contrast under 4.5:1 at the edge of "y" / "g" descenders.
 */
export function EndlessCloudsPattern({
  className,
  color = "var(--primary)",
  opacity = 0.06,
  size = 56,
  style,
  children,
}: PatternProps) {
  const id = `clouds-${size}`;
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
              d="M28 0c2.2 4.5 5 8.7 8.4 12.5 3.5 4 7.7 7.5 12.5 10.4-4.8 2.9-9 6.4-12.5 10.4-3.4 3.8-6.2 8-8.4 12.5-2.2-4.5-5-8.7-8.4-12.5C16.1 29.3 11.9 25.8 7 22.9c4.9-2.9 9.1-6.4 12.6-10.4C23 8.7 25.8 4.5 28 0z"
              fill="currentColor"
              fillOpacity="0.8"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      {children}
    </div>
  );
}
