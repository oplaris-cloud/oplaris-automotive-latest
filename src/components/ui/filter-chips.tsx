"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * B5.2 — multi-select toggle-chip group, URL-state-backed.
 *
 * Mirrors the shape of `<ListSearch>` so chip-and-search rows can sit
 * side by side on the same page. Selected values are encoded as a
 * comma-separated list under a single param so the URL stays tidy
 * even with 5 chips active. shadcn doesn't ship a ToggleGroup in this
 * project, but the existing rounded-full chip variant on
 * `customers/page.tsx` is the established vocabulary — we lean into
 * it rather than introduce a second one.
 *
 * @example
 * <FilterChips
 *   paramName="repair"
 *   options={[
 *     { value: "mot", label: "MOT" },
 *     { value: "electrical", label: "Electrical" },
 *     { value: "maintenance", label: "Maintenance" },
 *   ]}
 * />
 */
export interface FilterChipOption {
  value: string;
  label: string;
}

export interface FilterChipsProps {
  paramName: string;
  options: readonly FilterChipOption[];
  /** Optional aria-label for the chip group (default: "Filters"). */
  ariaLabel?: string;
  className?: string;
}

export function FilterChips({
  paramName,
  options,
  ariaLabel = "Filters",
  className,
}: FilterChipsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selected = React.useMemo(
    () => parseChipParam(searchParams.get(paramName)),
    [searchParams, paramName],
  );

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);

    const params = new URLSearchParams(searchParams.toString());
    if (next.size === 0) params.delete(paramName);
    else params.set(paramName, Array.from(next).join(","));
    params.delete("page");

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {options.map((opt) => {
        const active = selected.has(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => toggle(opt.value)}
            className={cn(
              "rounded-full border px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-accent",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Parse a comma-separated chip-value list. Empty / null input → empty
 * Set. Whitespace and empty segments are ignored, so a stale URL like
 * `?repair=mot,,` doesn't crash the page.
 */
export function parseChipParam(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}
