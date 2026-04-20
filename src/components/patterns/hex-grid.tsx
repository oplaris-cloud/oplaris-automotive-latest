import type { CSSProperties } from "react";

interface PatternProps {
  className?: string;
  /** Pattern colour. Defaults to `var(--primary)`. */
  color?: string;
  /** Stroke opacity (0–1). Default 0.1. */
  opacity?: number;
  /** Pattern cell size in px. Default 24. */
  size?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
}

/** Hex-grid pattern — reads as "mechanical" / "engineered." Good for
 *  large headers, auth/login splits, kiosk idle screens. */
export function HexGridPattern({
  className,
  color = "var(--primary)",
  opacity = 0.1,
  size = 24,
  style,
  children,
}: PatternProps) {
  const id = `hex-${size}`;
  const w = size;
  const h = size * 0.866; // cos(30°)
  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
        style={{ color, opacity }}
      >
        <defs>
          <pattern id={id} width={w * 3} height={h * 2} patternUnits="userSpaceOnUse">
            <path
              d={`M 0 ${h}
                  L ${w * 0.5} 0
                  L ${w * 1.5} 0
                  L ${w * 2} ${h}
                  L ${w * 1.5} ${h * 2}
                  L ${w * 0.5} ${h * 2} Z
                  M ${w * 2} ${h}
                  L ${w * 2.5} 0
                  L ${w * 3} 0`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      {children}
    </div>
  );
}
