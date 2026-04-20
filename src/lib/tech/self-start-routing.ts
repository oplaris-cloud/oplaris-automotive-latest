import type { StaffRole } from "@/lib/auth/session";

/**
 * Picks the post-action destination for a self-started check-in.
 *
 * Rule (audit finding F1, 2026-04-20): a mot_tester or mechanic who
 * hits "Start MOT" / "Start work" on a check-in should land on the
 * tech mobile UI (`/app/tech/job/[id]`), not the manager job-detail
 * view (`/app/jobs/[id]`). Manager-ONLY staff — no tech hat at all —
 * keep the manager route.
 *
 * A multi-role manager who also wears mechanic or mot_tester falls
 * through to the tech UI: they're acting as a tech in that moment,
 * so the tech surface is the right destination.
 *
 * Empty-roles input (broken session / JWT parse failure) defaults to
 * the tech UI — the safer surface, since tech views are strictly
 * more restricted than the manager surface.
 */
export function pickStartDestination(
  roles: readonly StaffRole[],
  jobId: string,
): string {
  const isManagerOnly =
    roles.includes("manager") &&
    !roles.includes("mot_tester") &&
    !roles.includes("mechanic");
  return isManagerOnly ? `/app/jobs/${jobId}` : `/app/tech/job/${jobId}`;
}
