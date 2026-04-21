// P44 — single source of truth for work-log time and duration rendering.
//
// Every human-facing time or duration in the app runs through one of these
// helpers so the display is consistent (HH:mm:ss for times, "Xh Ym Zs" for
// durations) and the format can evolve in one place.

/**
 * Format a timestamp as HH:mm:ss when it's today, or "DD MMM HH:mm:ss"
 * otherwise. Accepts a Date, an ISO string, or null/undefined.
 *
 * Locale is `en-GB` so the 24-hour clock and day-month order stay correct
 * for the Dudley workshop and future UK garages.
 */
export function formatWorkLogTime(input: Date | string | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";

  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  if (sameDay) return time;

  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
  return `${date} ${time}`;
}

/**
 * Format a duration in seconds as "Xh Ym Zs" with leading zero units
 * dropped (22m 14s, not 0h 22m 14s). Null / <0 render as an em dash.
 *
 * Used everywhere a work-log duration is shown: reports, manager job page,
 * tech mobile page, currently-working panel, CSV export.
 */
export function formatWorkLogDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Running-timer variant — monospaced H:MM:SS (or M:SS under an hour). Used
 * by the tech UI's active timer which ticks each second; the compact form
 * matches the single-glance expectation of a stopwatch.
 */
export function formatRunningTimer(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${m}:${ss}`;
}

/**
 * Format a UK phone number for display. Accepts either E.164
 * (`+447X…`) or local (`07X…`) and renders as `07XXX XXX XXX` —
 * the format Dudley + customers recognise from text messages.
 *
 * Falls back to the raw input for non-UK / unparseable strings so
 * the customer-facing display never goes blank. Used on tap-to-call
 * surfaces (My Work cards, tech job header, customer status page).
 */
export function formatPhone(input: string | null | undefined): string {
  if (!input) return "";
  const digits = input.replace(/[^\d+]/g, "");
  // Normalise +44 → 0 for the display form; keep the rest verbatim.
  let local = digits;
  if (local.startsWith("+44")) local = "0" + local.slice(3);
  else if (local.startsWith("44") && local.length === 12) local = "0" + local.slice(2);
  // UK mobile / landline lengths land at 11 digits with the leading 0.
  if (/^0\d{10}$/.test(local)) {
    return `${local.slice(0, 5)} ${local.slice(5, 8)} ${local.slice(8)}`;
  }
  return input;
}
