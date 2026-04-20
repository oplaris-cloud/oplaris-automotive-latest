"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** P56.8 (UX-C1) — Single-select Combobox for searchable lists.
 *
 *  Wraps the existing cmdk `<Command>` palette + `<Popover>` so any
 *  >10-option picker (supplier, customer, vehicle) gets instant
 *  type-to-filter, keyboard nav, and dark-mode support without us
 *  introducing a second combobox library.
 *
 *  For specialised pickers (CustomerPicker, VehiclePicker) build a
 *  thin wrapper that pre-shapes the items + label render — see
 *  `customer-picker.tsx` for the canonical pattern.
 *
 *  Usage:
 *    <Combobox
 *      value={supplierId}
 *      onChange={setSupplierId}
 *      options={suppliers}
 *      getValue={(s) => s.id}
 *      getLabel={(s) => s.name}
 *      placeholder="Pick a supplier…"
 *      searchPlaceholder="Search suppliers…"
 *      emptyLabel="No suppliers."
 *    />
 */

interface ComboboxProps<T> {
  options: readonly T[];
  value: string;
  onChange: (value: string) => void;
  getValue: (option: T) => string;
  getLabel: (option: T) => React.ReactNode;
  /** Optional secondary line under the label inside the popover row. */
  getDescription?: (option: T) => React.ReactNode;
  /** Optional searchable haystack — when omitted, cmdk searches the
   *  rendered label string. Override when you want to match across
   *  multiple fields (e.g. customer name + phone + reg). */
  getSearchKeywords?: (option: T) => string[];
  /** What renders inside the trigger when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Optional id forwarded to the trigger Button — pair with `<Label htmlFor>`. */
  id?: string;
  /** Optional `name` so the value participates in native FormData
   *  submission (no extra `useState` round-trip). */
  name?: string;
  /** Optional `aria-invalid` for inline form-level error display. */
  "aria-invalid"?: boolean;
}

export function Combobox<T>({
  options,
  value,
  onChange,
  getValue,
  getLabel,
  getDescription,
  getSearchKeywords,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "Nothing found.",
  disabled = false,
  className,
  id,
  name,
  ...rest
}: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(
    () => options.find((o) => getValue(o) === value),
    [options, value, getValue],
  );

  return (
    <>
      {/* Hidden input lets <form FormData> see the value without an
          extra controlled-state shuffle in callers. */}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-invalid={rest["aria-invalid"]}
              disabled={disabled}
              className={cn(
                "w-full justify-between font-normal",
                !selected && "text-muted-foreground",
                className,
              )}
            />
          }
        >
          <span className="truncate">
            {selected ? getLabel(selected) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--anchor-width)] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const v = getValue(opt);
                  const keywords = getSearchKeywords?.(opt);
                  return (
                    <CommandItem
                      key={v}
                      value={v}
                      keywords={keywords}
                      onSelect={(picked) => {
                        onChange(picked === value ? "" : picked);
                        setOpen(false);
                      }}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{getLabel(opt)}</span>
                        {getDescription ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {getDescription(opt)}
                          </span>
                        ) : null}
                      </div>
                      <Check
                        className={cn(
                          "ml-auto h-4 w-4",
                          v === value ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
