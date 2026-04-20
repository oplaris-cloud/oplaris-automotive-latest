import type { CSSProperties } from "react";

interface PatternProps {
  className?: string;
  /** Stripe colour. Default `var(--primary)`. */
  color?: string;
  /** 0–1. Default 0.12. */
  opacity?: number;
  /** Period between stripes in px. Default 10. */
  gap?: number;
  /** Stripe thickness in px. Default 2. */
  thickness?: number;
  /** Direction angle in deg. Default 45. */
  angle?: number;
  style?: CSSProperties;
  children?: React.ReactNode;
}

/** Diagonal racing stripes — workshop/automotive vernacular.
 *  Pure CSS (no SVG) so it tiles forever cheaply. Good behind hero
 *  panels, kiosk headers, and the public status-page banner. */
export function DiagonalStripesPattern({
  className,
  color = "var(--primary)",
  opacity = 0.12,
  gap = 10,
  thickness = 2,
  angle = 45,
  style,
  children,
}: PatternProps) {
  const stripeBg = `repeating-linear-gradient(
    ${angle}deg,
    ${color} 0 ${thickness}px,
    transparent ${thickness}px ${gap}px
  )`;
  return (
    <div
      className={className}
      style={{
        position: "relative",
        backgroundImage: stripeBg,
        backgroundAttachment: "fixed",
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          opacity,
          pointerEvents: "none",
        }}
      />
      {children}
    </div>
  );
}

/** Hazard-stripe variant — thick black-and-primary bars. Useful as
 *  a <HazardStripe /> accent band above/below a hero. */
export function HazardStripe({
  className,
  color = "var(--accent)",
  height = 8,
}: {
  className?: string;
  color?: string;
  height?: number;
}) {
  return (
    <div
      role="presentation"
      className={className}
      style={{
        height,
        backgroundImage: `repeating-linear-gradient(
          -45deg,
          ${color} 0 12px,
          var(--foreground) 12px 24px
        )`,
      }}
    />
  );
}
