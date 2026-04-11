/**
 * Normalise a UK vehicle registration plate.
 * Strips whitespace and uppercases. No format validation beyond that —
 * UK regs can be classic (A123 ABC), new-style (AB12 CDE), or cherished.
 */
export function normaliseRegistration(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}
