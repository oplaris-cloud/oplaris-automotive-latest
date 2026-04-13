"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface StaffAvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}

/**
 * Staff profile picture with person-silhouette fallback.
 * Colour inherits from parent (use border colour to indicate busy/free).
 */
export function StaffAvatar({ src, name, size = 80, className }: StaffAvatarProps) {
  const [error, setError] = useState(false);

  if (src && !error) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setError(true)}
        className={cn("rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  // Fallback: person silhouette SVG (matches the mockup)
  return (
    <div
      className={cn("flex items-center justify-center rounded-full", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: size * 0.5, height: size * 0.5 }}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </svg>
    </div>
  );
}
