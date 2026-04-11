import {
  parsePhoneNumberWithError as parseCore,
  type PhoneNumber,
} from "libphonenumber-js/core";
import metadata from "libphonenumber-js/metadata.min.json";

/**
 * Normalise a phone number to E.164 format using GB as the default region.
 * Throws if the number is unparseable or invalid.
 *
 * We import from `libphonenumber-js/core` + pass metadata explicitly to
 * avoid the ESM↔CJS interop bug where the default metadata wrapper
 * resolves to `{ default: ... }` instead of the raw JSON object.
 *
 * Examples:
 *   "07911 123456"    → "+447911123456"
 *   "+44 7911 123456" → "+447911123456"
 *   "01onal"          → throws
 */
export function normalisePhone(raw: string): string {
  const phone: PhoneNumber = parseCore(raw.trim(), "GB", metadata);
  if (!phone.isValid()) {
    throw new Error(`Invalid phone number: ${raw}`);
  }
  return phone.format("E.164");
}
