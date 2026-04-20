import type { CSSProperties } from "react";

interface PatternProps {
  className?: string;
  /** Diamond stroke colour. Defaults to `var(--accent)` for hero
   *  surfaces; pass `var(--primary)` if you want the dominant tone. */
  color?: string;
  /** 0–1. Default 0.08. */
  opacity?: number;
  /** Diamond cell size in px. Default 40. */
  size?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
}

/** V4 — Diamonds (Hero Patterns port).
 *
 *  Semantic: "premium / quality" — interlocking diamond grid reads as
 *  craft + attention to detail. Good fit for kiosk confirmation
 *  ("we'll come find you") and the settings hero where the customer
 *  will read text only briefly. Source: heropatterns.com.
 */
export function DiamondsPattern({
  className,
  color = "var(--accent)",
  opacity = 0.08,
  size = 40,
  style,
  children,
}: PatternProps) {
  const id = `diamonds-${size}`;
  const half = size / 2;
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
              d={`M ${half} 0 L ${size} ${half} L ${half} ${size} L 0 ${half} Z`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      {children}
    </div>
  );
}
