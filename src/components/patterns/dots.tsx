import type { CSSProperties } from "react";

interface PatternProps {
  className?: string;
  color?: string;
  opacity?: number;
  /** Cell size. Default 20. */
  size?: number;
  /** Dot radius. Default 1.2. */
  radius?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
}

/** Neutral dot-matrix — benign background for cards, empty states, and
 *  large neutral surfaces. Paints via `currentColor`. */
export function DotsPattern({
  className,
  color = "var(--muted-foreground)",
  opacity = 0.18,
  size = 20,
  radius = 1.2,
  style,
  children,
}: PatternProps) {
  const id = `dots-${size}-${radius}`;
  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
        style={{ color, opacity }}
      >
        <defs>
          <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
            <circle cx={size / 2} cy={size / 2} r={radius} fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      {children}
    </div>
  );
}
