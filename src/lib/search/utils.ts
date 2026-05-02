/**
 * B5.3 — shared helpers for in-page list search.
 *
 * Each page's predicate composer wants the same two utilities:
 *   - sanitise() to strip PostgREST-reserved chars from a free-text
 *     query (defence-in-depth around `.or()` injection).
 *   - buildPhonePatterns() to expand a UK phone query into the four
 *     storage variants we encounter — staff search by any of them.
 *
 * Pulled out of `src/lib/search/jobs.ts` so customers / vehicles /
 * stock / warranties / messages composers don't duplicate them.
 */
import { normalisePhoneSafe } from "@/lib/validation/phone";

/**
 * Strip chars that have meaning inside a PostgREST `.or()` filter
 * value (`,()*\\"'`). The replaced char becomes a space so a query
 * like `"Mr, Smith"` becomes `Mr  Smith` — still a valid ILIKE
 * substring. Empty / whitespace-only output collapses to "" upstream.
 */
export function sanitiseSearch(raw: string): string {
  return raw.replace(/[,()*\\"']/g, " ").trim();
}

/**
 * Build a set of patterns to ILIKE-match against a `phone` column.
 * UK numbers are stored E.164 (`+44…`) but staff may type any of
 * `07911 123456`, `+44 7911 123456`, `447911123456`, or just `7911`.
 * We expand the haystack so a single ILIKE round-trip catches all
 * common variants without forcing the user to format their input.
 */
export function buildPhonePatterns(q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const out = new Set<string>();
  out.add(trimmed);

  const normalised = normalisePhoneSafe(trimmed);
  if (normalised) {
    out.add(normalised);
    if (normalised.startsWith("+44")) {
      out.add(`0${normalised.slice(3)}`);
      out.add(normalised.slice(3));
      out.add(normalised.slice(1));
    }
  }
  return Array.from(out);
}
