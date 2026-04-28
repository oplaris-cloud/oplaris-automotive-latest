/** V2 — Automotive icon set.
 *
 *  Lucide handles 95% of UI icons (chevrons, status, generic objects).
 *  Phosphor's `duotone`-style flat set fills the automotive-specific
 *  gap (Engine, CarBattery, GasPump, Wrench variants). Custom SVGs
 *  cover the long-tail (brake disc, oil drop, tyre, OBD, spark plug)
 *  where neither library has a clean glyph.
 *
 *  Convention: every export is a forwardRef-shaped React component
 *  that accepts a `className` prop and inherits `currentColor`.
 *  Default size is 16 px (matches Lucide's `size-4`); callers override
 *  with Tailwind `size-*` classes.
 */

import {
  Engine,
  CarBattery,
  GasPump,
  Wrench as PhWrench,
  CarSimple,
  Lightbulb,
  Lifebuoy,
} from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

// Re-export Phosphor automotive set with consistent default sizing.
const phosphorClass = "h-4 w-4";

export function EngineIcon({ className }: { className?: string }) {
  return <Engine className={cn(phosphorClass, className)} />;
}

export function CarBatteryIcon({ className }: { className?: string }) {
  return <CarBattery className={cn(phosphorClass, className)} />;
}

export function FuelPumpIcon({ className }: { className?: string }) {
  return <GasPump className={cn(phosphorClass, className)} />;
}

export function PhosphorWrenchIcon({ className }: { className?: string }) {
  return <PhWrench className={cn(phosphorClass, className)} />;
}

export function VehicleIcon({ className }: { className?: string }) {
  return <CarSimple className={cn(phosphorClass, className)} />;
}

export function ElectricalIcon({ className }: { className?: string }) {
  return <Lightbulb className={cn(phosphorClass, className)} />;
}

export function TyrePressureIcon({ className }: { className?: string }) {
  return <Lifebuoy className={cn(phosphorClass, className)} />;
}

// P1.2 followup — uses the canonical MOT logo Hossein supplied at
// public/MOT_Logo.svg (it's actually a PNG inside an .svg-named file
// — the browser content-sniffs and renders it as PNG regardless).
// Plain <img> rather than next/image because routing this through
// the optimiser would force `dangerouslyAllowSVG: true` in
// next.config.ts; for a 4 KB asset the optimisation upside doesn't
// pay for the security relaxation. Empty alt — the surrounding chip
// or avatar badge owns the accessible label, so the icon's
// contribution here is purely visual.
export function MotTesterIcon({ className }: { className?: string }) {
  return (
    <img
      src="/MOT_Logo.svg"
      alt=""
      width={16}
      height={16}
      className={cn("inline-block object-contain", phosphorClass, className)}
    />
  );
}

// ---------------------------------------------------------------------------
// Custom SVGs — long-tail automotive glyphs not in Lucide or Phosphor.
// All inherit `currentColor` so they re-tint per parent text colour.
// ---------------------------------------------------------------------------

interface IconProps {
  className?: string;
  title?: string;
}

function svgBase(className: string | undefined, title: string | undefined) {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: cn("h-4 w-4", className),
    role: title ? "img" : undefined,
    "aria-label": title,
    "aria-hidden": title ? undefined : true,
  };
}

/** Brake disc with caliper arc — used on brake-related job categories. */
export function BrakeDiscIcon({ className, title }: IconProps) {
  return (
    <svg {...svgBase(className, title)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M3 12c2.5-3 6.5-3 9-3" />
      <path d="M21 12c-2.5 3-6.5 3-9 3" />
    </svg>
  );
}

/** Single oil-drop glyph — used for oil change / fluid services. */
export function OilDropIcon({ className, title }: IconProps) {
  return (
    <svg {...svgBase(className, title)}>
      <path d="M12 3c-3.5 5-6 8-6 11a6 6 0 0 0 12 0c0-3-2.5-6-6-11Z" />
      <path d="M9 15a3 3 0 0 0 3 3" />
    </svg>
  );
}

/** Tyre with tread bands — used for tyres / wheels work. */
export function TyreIcon({ className, title }: IconProps) {
  return (
    <svg {...svgBase(className, title)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="M5.6 5.6l2.1 2.1" />
      <path d="M16.3 16.3l2.1 2.1" />
      <path d="M5.6 18.4l2.1-2.1" />
      <path d="M16.3 7.7l2.1-2.1" />
    </svg>
  );
}

/** OBD-II port — flat trapezoidal connector. */
export function ObdPortIcon({ className, title }: IconProps) {
  return (
    <svg {...svgBase(className, title)}>
      <path d="M5 9h14l-1.5 7H6.5Z" />
      <path d="M8 9V7a4 4 0 0 1 8 0v2" />
      {/* Pin grid */}
      <circle cx="9" cy="12" r="0.5" fill="currentColor" />
      <circle cx="11" cy="12" r="0.5" fill="currentColor" />
      <circle cx="13" cy="12" r="0.5" fill="currentColor" />
      <circle cx="15" cy="12" r="0.5" fill="currentColor" />
      <circle cx="10" cy="14" r="0.5" fill="currentColor" />
      <circle cx="12" cy="14" r="0.5" fill="currentColor" />
      <circle cx="14" cy="14" r="0.5" fill="currentColor" />
    </svg>
  );
}

/** Spark plug — electrode + ceramic insulator silhouette. */
export function SparkPlugIcon({ className, title }: IconProps) {
  return (
    <svg {...svgBase(className, title)}>
      <path d="M12 2v3" />
      <path d="M9 5h6v4l-1.5 2h-3L9 9Z" />
      <path d="M10 11v3h4v-3" />
      <path d="M11 14l-1 4" />
      <path d="M13 14l1 4" />
      <path d="M10 18h4" />
    </svg>
  );
}
