/**
 * P53 — Pure derivation helpers for the Change Handler palette + dialog.
 *
 * Split out of the client component so the decision tables are unit-tested
 * without pulling React or server wiring in. The shapes here are the
 * minimum the logic needs; the UI component extends them with display
 * fields.
 */

export type HandlerRole = "mot_tester" | "mechanic" | "manager";

export interface AssigneeInfo {
  id: string;
  full_name: string;
  roles: readonly string[];
  /** True if this staff member has an open work_logs row on the job. */
  hasActiveTimer: boolean;
}

export interface EligibleStaffInfo {
  id: string;
  full_name: string;
  roles: readonly string[];
  isBusy: boolean;
  currentJobNumber: string | null;
  currentJobId: string | null;
}

export type PaletteSelection =
  | { kind: "queue"; targetRole: Exclude<HandlerRole, "manager"> }
  | { kind: "person"; staffId: string };

export type PaletteDecision =
  | {
      kind: "ambiguous";
      staffId: string;
      full_name: string;
      roles: readonly string[];
      currentRole: HandlerRole | null;
    }
  | {
      kind: "confirm";
      targetRole: HandlerRole;
      removeStaffIds: string[];
      assignStaffId: string | null;
      /** First name of the direct-assignee, or null. Used for button label. */
      assignFirstName: string | null;
    };

function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/**
 * Given the job's current role and its current assignees, compute which
 * of the assignees should be pre-ticked for removal when the manager
 * returns the job to the `targetRole` queue.
 *
 * Rule: pre-tick a staff member iff NONE of their roles covers the new
 * target role. Multi-role staff who still hold the target role stay
 * (and hence keep any running timer).
 */
export function computeDefaultRemovals(
  assignees: readonly AssigneeInfo[],
  targetRole: HandlerRole,
): string[] {
  return assignees
    .filter((a) => !a.roles.includes(targetRole))
    .map((a) => a.id);
}

/**
 * Translate a palette selection into either a confirm-dialog seed or a
 * UX-level error for a multi-role ambiguous pick.
 *
 * Matrix for `kind: "person"`:
 *   - staff.roles ∋ currentRole      → target = currentRole, removals = none
 *                                      (straight-forward reassign; we still
 *                                       open confirm so the manager can
 *                                       review + add a note).
 *   - staff.roles.length === 1       → target = staff.roles[0], removals =
 *                                      assignees missing that role.
 *   - staff.roles.length  >  1 AND
 *     no overlap with currentRole    → ambiguous. Manager must pick the
 *                                      queue option first.
 */
export function decidePaletteSelection(params: {
  selection: PaletteSelection;
  currentRole: HandlerRole | null;
  assignees: readonly AssigneeInfo[];
  eligibleStaff: readonly EligibleStaffInfo[];
}): PaletteDecision {
  const { selection, currentRole, assignees, eligibleStaff } = params;

  if (selection.kind === "queue") {
    return {
      kind: "confirm",
      targetRole: selection.targetRole,
      removeStaffIds: computeDefaultRemovals(assignees, selection.targetRole),
      assignStaffId: null,
      assignFirstName: null,
    };
  }

  const person = eligibleStaff.find((s) => s.id === selection.staffId);
  if (!person) {
    // Shouldn't happen in a live UI but failing closed is safer than
    // inventing a target role.
    return {
      kind: "ambiguous",
      staffId: selection.staffId,
      full_name: "Unknown",
      roles: [],
      currentRole,
    };
  }

  const personRoles = person.roles;
  const assignFirstName = firstNameOf(person.full_name);

  if (currentRole && personRoles.includes(currentRole)) {
    return {
      kind: "confirm",
      targetRole: currentRole,
      removeStaffIds: [],
      assignStaffId: person.id,
      assignFirstName,
    };
  }

  const concreteRoles = personRoles.filter(
    (r): r is HandlerRole =>
      r === "mot_tester" || r === "mechanic" || r === "manager",
  );

  if (concreteRoles.length === 1) {
    const target = concreteRoles[0]!;
    return {
      kind: "confirm",
      targetRole: target,
      removeStaffIds: computeDefaultRemovals(assignees, target),
      assignStaffId: person.id,
      assignFirstName,
    };
  }

  return {
    kind: "ambiguous",
    staffId: person.id,
    full_name: person.full_name,
    roles: personRoles,
    currentRole,
  };
}

/**
 * Live submit button label. Composite when a direct-assignee is picked
 * — saves the manager from guessing what clicking "Return to queue"
 * will do after they ticked an assignee.
 */
export function composeSubmitLabel(params: {
  targetRole: HandlerRole;
  assignFirstName: string | null;
}): string {
  const queueLabel =
    params.targetRole === "mot_tester"
      ? "Return to MOT tester queue"
      : params.targetRole === "mechanic"
        ? "Return to mechanic queue"
        : "Override to manager";
  if (!params.assignFirstName) return queueLabel;
  return `${queueLabel} · assign ${params.assignFirstName}`;
}
