// P46 — pure helper, lives outside the "use server" actions module so it
// can be imported by client components AND covered by unit tests without
// dragging in the server-only Supabase wiring. Splits a flat
// StaffAvailability list into Available (rendered first) and Busy
// (rendered under a divider, with current-job link) groups, preserving
// the inbound full_name ordering within each group.

import type { StaffAvailability } from "./actions";

export function groupTechsByAvailability(
  techs: StaffAvailability[],
): { available: StaffAvailability[]; busy: StaffAvailability[] } {
  const available: StaffAvailability[] = [];
  const busy: StaffAvailability[] = [];
  for (const t of techs) (t.isBusy ? busy : available).push(t);
  return { available, busy };
}
