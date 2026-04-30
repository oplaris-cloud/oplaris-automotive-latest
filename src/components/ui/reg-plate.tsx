"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** P56.3 (UI-C4) — Static UK reg-plate display primitive.
 *
 *  Three sizes so the same vehicle plate renders consistently across
 *  dense tables, cards, and hero surfaces. Uses the same yellow (rear)
 *  / white (front) colour convention as the input variant.
 *
 *  B3.3 (2026-04-30) — when a `vehicleId` prop is passed, the plate
 *  becomes a Link to `/app/vehicles/[id]`. Without it, render as today
 *  (static `<span>`). Public surfaces (kiosk, status, /approve) never
 *  pass it — the staff app does where the vehicle id is in scope.
 *
 *  `py-0.5` is the single off-grid exception in `DESIGN_SYSTEM.md §1.3`
 *  — plates need the tight vertical aspect to look like real plates
 *  (and `py-1` makes the glyph row look gappy). The spacing lint
 *  allow-lists `py-0.5` inside `src/components/ui/reg-plate.tsx`.
 */

type RegPlateSize = "sm" | "default" | "lg";
type RegPlateVariant = "front" | "rear";

interface RegPlateProps {
  reg: string;
  size?: RegPlateSize;
  variant?: RegPlateVariant;
  /** When set, the plate becomes a link to /app/vehicles/[id]. Omit
   *  on public surfaces (kiosk, status, /approve) where the staff
   *  app routes are not reachable. */
  vehicleId?: string | null;
  className?: string;
}

const SIZE_CLASS: Record<RegPlateSize, string> = {
  sm: "px-2 py-0.5 text-xs tracking-[0.1em]",
  default: "px-2 py-0.5 text-sm tracking-[0.12em]",
  lg: "px-3 py-1 text-xl tracking-[0.15em]",
};

const SHARED_CLASSES =
  "inline-flex items-center rounded-[3px] border border-black font-mono font-black uppercase leading-none";

const LINK_AFFORDANCE =
  "transition-shadow hover:ring-2 hover:ring-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function RegPlate({
  reg,
  size = "default",
  variant = "rear",
  vehicleId,
  className,
}: RegPlateProps) {
  const isRear = variant === "rear";
  const baseClasses = cn(
    SHARED_CLASSES,
    isRear ? "bg-[#FFD307] text-black" : "bg-white text-black",
    SIZE_CLASS[size],
    className,
  );

  if (vehicleId) {
    return (
      <Link
        data-slot="reg-plate"
        data-size={size}
        href={`/app/vehicles/${vehicleId}`}
        className={cn(baseClasses, LINK_AFFORDANCE)}
        aria-label={`View vehicle ${reg}`}
      >
        {reg}
      </Link>
    );
  }

  return (
    <span data-slot="reg-plate" data-size={size} className={baseClasses}>
      {reg}
    </span>
  );
}

interface RegPlateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Show as rear plate (yellow) or front plate (white). Default: front (white). */
  variant?: "front" | "rear";
}

/**
 * Gov.uk-style UK number plate input.
 *
 * Mimics the visual style of a real UK registration plate:
 * - Charles Wright font approximated with system monospace + bold + letter-spacing
 * - Blue side strip with GB / UK badge
 * - Yellow background for rear plates, white for front
 * - Rounded corners matching real plate proportions
 */
export const RegPlateInput = forwardRef<HTMLInputElement, RegPlateInputProps>(
  function RegPlateInput({ variant = "front", className, ...props }, ref) {
    const isRear = variant === "rear";

    return (
      <div
        className={cn(
          "flex items-stretch overflow-hidden rounded-md border-2 border-black",
          className,
        )}
      >
        {/* Blue side strip — modern post-2021 UK plate spec: Union Jack
            mini-flag + "UK" wordmark in white. The previous SVG drew a
            blue-on-blue circle (invisible) with sub-pixel "EU stars"
            (also invisible), leaving the strip looking like a flat
            blue void. */}
        <div className="flex w-10 flex-shrink-0 flex-col items-center justify-center bg-[#003da5] py-2">
          <svg
            viewBox="0 0 60 36"
            className="h-3 w-5"
            aria-hidden="true"
          >
            <rect width="60" height="36" fill="#012169" />
            <path d="M0,0 L60,36 M60,0 L0,36" stroke="#FFFFFF" strokeWidth="6" />
            <path d="M0,0 L60,36" stroke="#C8102E" strokeWidth="3" />
            <path d="M60,0 L0,36" stroke="#C8102E" strokeWidth="3" />
            <path d="M30,0 V36 M0,18 H60" stroke="#FFFFFF" strokeWidth="10" />
            <path d="M30,0 V36 M0,18 H60" stroke="#C8102E" strokeWidth="6" />
          </svg>
          <span className="mt-1 text-xs font-bold leading-none tracking-wider text-white">
            UK
          </span>
        </div>
        {/* Plate input */}
        <input
          ref={ref}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          {...props}
          className={cn(
            "flex-1 border-none px-3 py-3 text-center font-mono text-2xl font-black uppercase tracking-[0.15em] outline-none placeholder:text-gray-400 placeholder:font-normal placeholder:text-base placeholder:tracking-normal",
            isRear ? "bg-[#FFD307] text-black" : "bg-white text-black",
          )}
        />
      </div>
    );
  },
);
