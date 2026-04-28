"use client";

import { useState } from "react";

import { MotTesterIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface StaffAvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  /** P1.2 followup — staff roles array. When present and includes
   *  `mot_tester`, a small MOT-logo badge is overlaid at the top-right
   *  of the avatar circle so every avatar surface (TechAssignmentModal,
   *  /app/settings/staff, future /app/staff list) gets the
   *  qualification cue for free. Omit on surfaces where the badge
   *  would be self-referential (e.g. the user editing their own
   *  profile picture). */
  roles?: readonly string[] | null;
  className?: string;
}

/**
 * Staff profile picture with person-silhouette fallback.
 * Colour inherits from parent (use border colour to indicate busy/free).
 */
export function StaffAvatar({
  src,
  name,
  size = 80,
  roles,
  className,
}: StaffAvatarProps) {
  const [error, setError] = useState(false);
  const showMotBadge = roles?.includes("mot_tester") ?? false;
  // Badge sits at ~30% of the avatar's diameter — small enough to
  // read as a corner-piece, large enough for the MOT logo to remain
  // legible. Floored at 16 px so it stays visible on the smallest
  // 52 px settings/staff avatar.
  const badgeSize = Math.max(16, Math.round(size * 0.32));

  const inner =
    src && !error ? (
      <img
        src={src}
        alt={name}
        onError={() => setError(true)}
        className={cn("rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    ) : (
      <div
        className={cn(
          "flex items-center justify-center rounded-full",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ width: size * 0.5, height: size * 0.5 }}
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      </div>
    );

  if (!showMotBadge) return inner;

  return (
    <span
      className="relative inline-block"
      style={{ width: size, height: size }}
    >
      {inner}
      <span
        title="MOT tester"
        className="absolute right-0 top-0 inline-flex items-center justify-center rounded-full bg-background ring-2 ring-background"
        style={{ width: badgeSize, height: badgeSize }}
      >
        <MotTesterIcon className="h-full w-full" />
        <span className="sr-only">MOT tester</span>
      </span>
    </span>
  );
}
