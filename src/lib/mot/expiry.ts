// Pure MOT-expiry predicates. `now` is injected so the helpers stay
// impurity-free from React's point of view — callers pass a stable
// reference (a `new Date()` captured in a parent server component, a
// `useState(() => new Date())`, etc.) and the helpers themselves never
// reach out to the clock. Keeps `react-hooks/purity` happy and the
// boundary testable.
//
// `expiryDate` accepts either a `Date` or an ISO string because the
// upstream DVSA payload surfaces it as a string while some callers
// have already parsed it.

function toDate(input: Date | string): Date {
  return input instanceof Date ? input : new Date(input);
}

export function isMotExpired(
  expiryDate: Date | string,
  now: Date,
): boolean {
  return toDate(expiryDate).getTime() < now.getTime();
}

export function isMotExpiringSoon(
  expiryDate: Date | string,
  now: Date,
  withinDays = 30,
): boolean {
  const expiry = toDate(expiryDate).getTime();
  const cutoff = now.getTime();
  if (expiry < cutoff) return false;
  return expiry - cutoff < withinDays * 86_400_000;
}
