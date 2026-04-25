import {
  parsePhoneNumberWithError as parseCore,
  type PhoneNumber,
} from "libphonenumber-js/core";
import metadata from "libphonenumber-js/metadata.min.json";

/**
 * Typed phone-parse failure. Callers can `instanceof PhoneParseError`
 * to map this to a `fieldError.phone` or a 400 response without
 * blanket-catching every Error and masking unrelated bugs (RLS denials,
 * Supabase outages, etc.).
 */
export class PhoneParseError extends Error {
  /** The raw input the caller passed in — useful for logging without
   *  having to re-pass the unparsed value through the throw site. */
  readonly raw: string;

  constructor(raw: string, reason: string) {
    super(`Invalid phone number "${raw}": ${reason}`);
    this.name = "PhoneParseError";
    this.raw = raw;
  }
}

/**
 * Normalise a phone number to E.164 format using GB as the default region.
 * Throws PhoneParseError if the number is unparseable or invalid — both
 * libphonenumber's own ParseError and a failed `isValid()` collapse into
 * a single typed error so callers don't have to reason about either.
 *
 * We import from `libphonenumber-js/core` + pass metadata explicitly to
 * avoid the ESM↔CJS interop bug where the default metadata wrapper
 * resolves to `{ default: ... }` instead of the raw JSON object.
 *
 * Examples:
 *   "07911 123456"    → "+447911123456"
 *   "+44 7911 123456" → "+447911123456"
 *   "01onal"          → throws PhoneParseError
 */
export function normalisePhone(raw: string): string {
  let phone: PhoneNumber;
  try {
    phone = parseCore(raw.trim(), "GB", metadata);
  } catch (e) {
    throw new PhoneParseError(
      raw,
      e instanceof Error ? e.message : "unparseable",
    );
  }
  if (!phone.isValid()) {
    throw new PhoneParseError(raw, "not a valid number");
  }
  return phone.format("E.164");
}

/**
 * Non-throwing variant — returns the normalised E.164 string on success
 * or `null` on any parse/validity failure. Use at the status-page entry
 * where the anti-enumeration contract requires the same response shape
 * regardless of whether the number is well-formed.
 */
export function normalisePhoneSafe(raw: string): string | null {
  try {
    return normalisePhone(raw);
  } catch {
    return null;
  }
}

/**
 * Client-side gate for "Submit" buttons. Returns true iff the input
 * parses as a valid GB phone. Same metadata path as normalisePhone, so
 * the gate matches what the server will accept.
 */
export function isValidPhoneNumberInput(raw: string): boolean {
  if (!raw || raw.trim().length === 0) return false;
  try {
    const phone = parseCore(raw.trim(), "GB", metadata);
    return phone.isValid();
  } catch {
    return false;
  }
}
