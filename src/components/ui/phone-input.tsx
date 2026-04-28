"use client";

import { useEffect, useMemo } from "react";
import { AsYouType } from "libphonenumber-js/core";
import metadata from "libphonenumber-js/metadata.min.json";

import { Input } from "@/components/ui/input";
import { isValidPhoneNumberInput } from "@/lib/validation/phone";
import { cn } from "@/lib/utils";

// P2.1 — phone-number primitive used by the kiosk + customer status
// page (and any future place we collect a UK phone number). Wraps a
// libphonenumber-js `AsYouType` formatter so the user sees their digits
// reflow into "07911 123 456" as they type, plus a fixed `+44` prefix
// that documents the assumed region without bothering the user with a
// country picker (UK-only v1 — see TODO at the bottom for the multi-
// country swap when a non-GB garage onboards).
//
// The component is fully controlled: the parent owns the canonical
// string. Validity is reported up via `onValidChange` so the parent's
// Submit button can read a single boolean instead of re-deriving the
// gate. `name` lets the field round-trip through native FormData on
// uncontrolled forms.

interface PhoneInputProps {
  id: string;
  name?: string;
  /** Canonical raw value (whatever the user has typed; not yet
   *  normalised to E.164). Parent updates this on every keystroke. */
  value: string;
  onChange: (next: string) => void;
  /** Fires whenever validity flips. Use it to gate Submit. */
  onValidChange?: (isValid: boolean) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Tailwind classes applied to the inner <Input>. The prefix wrapper
   *  has its own layout responsibility — caller styling shouldn't touch
   *  it without a reason. */
  className?: string;
  autoComplete?: string;
  /** Optional override for the larger touch-friendly variant used on
   *  the kiosk (text-lg + py-3). Default is the standard input size. */
  inputClassName?: string;
}

export function PhoneInput({
  id,
  name,
  value,
  onChange,
  onValidChange,
  required,
  disabled,
  placeholder = "07700 900 123",
  className,
  autoComplete = "tel-national",
  inputClassName,
}: PhoneInputProps) {
  // Display is derived from `value` on every render — the parent owns
  // the raw user-typed string, we re-format it through AsYouType for
  // visual feedback. AsYouType is stateful within a single .input()
  // sequence, so we instantiate fresh inside `formatForDisplay` per
  // call to avoid sticky formatting on deletions. No local state +
  // sync-effect dance because the parent's setState already triggers
  // a re-render with the new value, and the formatter is pure.
  const display = useMemo(() => formatForDisplay(value), [value]);

  // Validity is reported up so the parent's Submit gate can mirror it.
  const isValid = useMemo(() => isValidPhoneNumberInput(value), [value]);
  useEffect(() => {
    onValidChange?.(isValid);
  }, [isValid, onValidChange]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Pass the raw user-typed value up — that's what gets normalised
    // server-side. The next render derives `display` from it.
    onChange(e.target.value);
  }

  return (
    <div className={cn("flex w-full", className)}>
      <span
        className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm font-medium text-muted-foreground"
        aria-hidden="true"
      >
        +44
      </span>
      <Input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={display}
        onChange={handleChange}
        className={cn("rounded-l-none", inputClassName)}
        aria-describedby={`${id}-prefix-hint`}
      />
      {/* Visually hidden — screen readers announce the prefix in context
       *  with the input. Sighted users see the +44 pill above. */}
      <span id={`${id}-prefix-hint`} className="sr-only">
        UK phone number, country code +44
      </span>
    </div>
  );
}

/**
 * Run an AsYouType formatter over the input. The formatter is stateful
 * within a single .input(...) call sequence; we reset it per call so
 * deletions reformat correctly (a sticky formatter would keep "07911 1"
 * as "07911 1" even after the user types more, accruing format
 * corruption).
 */
function formatForDisplay(raw: string): string {
  if (!raw) return "";
  const formatter = new AsYouType("GB", metadata);
  return formatter.input(raw);
}

// TODO (post-v1): when a non-GB garage onboards, lift the hardcoded
// "GB" + "+44" out of this component and accept a `country` prop with
// a CountryCode union. The AsYouType + isValidPhoneNumberInput calls
// already accept a country — only the visual prefix is GB-specific.
