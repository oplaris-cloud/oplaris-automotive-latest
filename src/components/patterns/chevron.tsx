import type { CSSProperties } from "react";

interface PatternProps {
  className?: string;
  color?: string;
  opacity?: number;
  /** Cell size. Default 18. */
  size?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
}

/** Chevron arrow tile — motion / progression motif. Good for tech
 *  mobile hero strips ("in progress") and customer status banners. */
export function ChevronPattern({
  className,
  color = "var(--primary)",
  opacity = 0.14,
  size = 18,
  style,
  children,
}: PatternProps) {
  const id = `chevron-${size}`;
  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
        style={{ color, opacity }}
      >
        <defs>
          <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
            <path
              d={`M 0 ${size * 0.25}
                  L ${size * 0.5} ${size * 0.75}
                  L ${size} ${size * 0.25}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      {children}
    </div>
  );
}

/** Topographic contour lines — softer, "map-like" background for
 *  quiet surfaces: auth screens, 403/404 pages, the status page. */
export function TopoPattern({
  className,
  color = "var(--primary)",
  opacity = 0.08,
  style,
  children,
}: PatternProps) {
  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
        preserveAspectRatio="none"
        viewBox="0 0 600 400"
        style={{ color, opacity }}
      >
        {[0, 30, 60, 90, 120, 150, 180].map((offset) => (
          <path
            key={offset}
            d={`M -50 ${200 + offset}
                C 100 ${150 + offset * 0.4}, 200 ${260 + offset * 0.6}, 300 ${200 + offset}
                S 520 ${150 + offset * 0.4}, 650 ${210 + offset}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        ))}
      </svg>
      {children}
    </div>
  );
}
