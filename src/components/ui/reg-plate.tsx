"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

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
        {/* Blue side strip */}
        <div className="flex w-10 flex-shrink-0 flex-col items-center justify-center bg-[#003da5] py-2">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
          >
            <circle cx="12" cy="12" r="10" fill="#003da5" />
            {/* EU/UK stars circle */}
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30 - 90) * (Math.PI / 180);
              const cx = 12 + 8 * Math.cos(angle);
              const cy = 12 + 8 * Math.sin(angle);
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={0.8}
                  fill="#FFD700"
                />
              );
            })}
          </svg>
          <span className="mt-1 text-[9px] font-bold leading-none text-white">
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
