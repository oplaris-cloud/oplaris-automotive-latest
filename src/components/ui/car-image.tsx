"use client";

import { useState } from "react";

interface CarImageProps {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  colour?: string | null;
  className?: string;
  width?: number;
  /** Angle parameter for IMAGIN.studio (default: empty for 3/4 front) */
  angle?: string;
}

/**
 * Renders a vehicle image from IMAGIN.studio CDN.
 * Free tier: max 400px width, uses paintDescription for colour matching.
 * Falls back to a car silhouette placeholder if make is missing.
 */
export function CarImage({
  make,
  model,
  year,
  colour,
  className = "",
  width = 400,
  angle = "",
}: CarImageProps) {
  const [error, setError] = useState(false);

  if (!make || error) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/50 text-muted-foreground ${className}`}
        style={{ minHeight: 80 }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-16 w-16 opacity-30"
        >
          <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
          <path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
          <path d="M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2" />
          <path d="M9 17h6" />
          <path d="M14 7l-3-3H7" />
        </svg>
      </div>
    );
  }

  // Build IMAGIN.studio URL
  const params = new URLSearchParams({
    customer: "img", // public demo key; replace with real key for production
    make: make.toLowerCase(),
    zoomType: "fullscreen",
    width: String(Math.min(width, 400)), // Free tier caps at 400
  });

  if (model) params.set("modelFamily", model.toLowerCase());
  if (year) params.set("modelYear", String(year));
  if (colour) params.set("paintDescription", normaliseColour(colour));
  if (angle) params.set("angle", angle);

  const src = `https://cdn.imagin.studio/getImage?${params.toString()}`;

  return (
    <img
      src={src}
      alt={`${make} ${model ?? ""} ${year ?? ""}`.trim()}
      className={className}
      loading="lazy"
      onError={() => setError(true)}
      style={{ maxWidth: "100%", objectFit: "contain" }}
    />
  );
}

/**
 * Maps common UK vehicle colour descriptions to simpler paint descriptions
 * that IMAGIN.studio understands.
 */
function normaliseColour(colour: string): string {
  const lower = colour.toLowerCase().trim();
  const map: Record<string, string> = {
    white: "white",
    black: "black",
    silver: "silver",
    grey: "grey",
    gray: "grey",
    blue: "blue",
    red: "red",
    green: "green",
    yellow: "yellow",
    orange: "orange",
    brown: "brown",
    beige: "beige",
    gold: "gold",
    maroon: "red",
    burgundy: "red",
    cream: "beige",
    purple: "purple",
    bronze: "brown",
    turquoise: "blue",
    // Common compound descriptions
    "metallic blue": "blue",
    "metallic black": "black",
    "metallic silver": "silver",
    "metallic grey": "grey",
    "metallic red": "red",
  };

  // Try exact match first
  if (map[lower]) return map[lower];

  // Try partial match
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) return val;
  }

  return lower;
}
