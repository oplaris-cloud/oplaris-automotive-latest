"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Calendar as CalendarIcon, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * B5.1 — Shared in-page search primitive.
 *
 * Reads/writes URL searchParams so results are deep-linkable and the
 * page (a Server Component) re-runs against the new query without a
 * client refetch. Debounced 200ms — matches the audit's "feels live
 * but doesn't hammer the DB" target. Falls back to native form-submit
 * when JS is off (the input is wrapped in a real `<form>`).
 *
 * The primitive owns ONLY the input + (optional) date range. The list
 * filter chips ("Has open job", message_type, etc.) are page-specific
 * and live next to <ListSearch> in the page.
 *
 * @example
 * <ListSearch placeholder="Search jobs…" dateRange />
 */
export interface ListSearchProps {
  /** URL param name for the text query — defaults to "q". */
  paramName?: string;
  placeholder?: string;
  /** Show the date-range popover. Default false. */
  dateRange?: boolean;
  /** Param names for the date range — defaults to from/to. */
  fromParam?: string;
  toParam?: string;
  className?: string;
}

const DEBOUNCE_MS = 200;

export function ListSearch({
  paramName = "q",
  placeholder = "Search…",
  dateRange = false,
  fromParam = "from",
  toParam = "to",
  className,
}: ListSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [value, setValue] = React.useState(
    () => searchParams.get(paramName) ?? "",
  );
  const [from, setFrom] = React.useState(
    () => searchParams.get(fromParam) ?? "",
  );
  const [to, setTo] = React.useState(() => searchParams.get(toParam) ?? "");

  // Re-sync local state when the URL changes via back/forward navigation.
  React.useEffect(() => {
    setValue(searchParams.get(paramName) ?? "");
    setFrom(searchParams.get(fromParam) ?? "");
    setTo(searchParams.get(toParam) ?? "");
  }, [searchParams, paramName, fromParam, toParam]);

  const pushParams = React.useCallback(
    (q: string, f: string, t: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) params.set(paramName, q);
      else params.delete(paramName);
      if (f) params.set(fromParam, f);
      else params.delete(fromParam);
      if (t) params.set(toParam, t);
      else params.delete(toParam);
      // Reset pagination when the filter shifts.
      params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, paramName, fromParam, toParam],
  );

  // Debounce the text input. The date-range popover writes synchronously
  // since it's already gated by an explicit "Apply" click.
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((searchParams.get(paramName) ?? "") !== value) {
        pushParams(value, from, to);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const hasDateRange = Boolean(from || to);

  function applyDateRange() {
    pushParams(value, from, to);
  }

  function clearDateRange() {
    setFrom("");
    setTo("");
    pushParams(value, "", "");
  }

  return (
    <form
      className={cn("flex flex-wrap items-center gap-2", className)}
      action={pathname}
      onSubmit={(e) => {
        // JS-on path: the debounced effect already wrote the URL. Stop
        // the native submit so we don't race a full page reload.
        e.preventDefault();
        pushParams(value, from, to);
      }}
    >
      <div className="relative max-w-sm flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name={paramName}
          aria-label={placeholder}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="pl-9"
        />
      </div>

      {dateRange ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant={hasDateRange ? "default" : "outline"}
                size="sm"
                aria-label="Date range"
              />
            }
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {hasDateRange ? formatRange(from, to) : "Date range"}
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ls-from">From</Label>
                <Input
                  id="ls-from"
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ls-to">To</Label>
                <Input
                  id="ls-to"
                  type="datetime-local"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearDateRange}
                >
                  <X className="mr-1 h-3 w-3" /> Clear
                </Button>
                <Button type="button" size="sm" onClick={applyDateRange}>
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      {/* Hidden no-JS submit. Visually nothing — pressing Enter in the
          input fires the form's onSubmit which we already handle. */}
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  );
}

function formatRange(from: string, to: string): string {
  if (from && to) return `${shortLabel(from)} → ${shortLabel(to)}`;
  if (from) return `From ${shortLabel(from)}`;
  if (to) return `Until ${shortLabel(to)}`;
  return "Date range";
}

function shortLabel(iso: string): string {
  // datetime-local is "YYYY-MM-DDTHH:MM" — render compactly for the chip.
  if (!iso) return "";
  const [date = "", time = ""] = iso.split("T");
  const [, m = "", d = ""] = date.split("-");
  return `${d}/${m}${time ? ` ${time}` : ""}`;
}
