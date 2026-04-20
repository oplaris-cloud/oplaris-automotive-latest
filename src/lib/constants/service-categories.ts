// Single source of truth for "what kind of work is this" visual styling.
// MOT (regulatory / tester work) reads as info-blue; electrical +
// maintenance collapse into a single "mechanical" category (primary)
// because they route to the same queue and the same button. "Urgent"
// (passbacks + any priority > 0) overrides the service colour with
// warning-amber, because urgency beats category at glance time.
//
// Consumed by the bookings page (manager garage-wide view) and by the
// My Work page (all roles). Consistent colour across both pages means
// the same left-border always means the same thing.

export type ServiceKind = "mot" | "electrical" | "maintenance";

export type CategoryKind = "mot" | "mechanical" | "urgent";

export interface CategoryStyles {
  /** Left-border class applied to the row/card. */
  border: string;
  /** Badge class pair for the service chip — background + text tone. */
  badge: string;
  /** Button className override for the primary "start" button. */
  button: string;
  /** Human-readable label (used in tooltips / aria-labels). */
  label: string;
  /** Stable kind — useful if a caller needs to branch logic. */
  kind: CategoryKind;
}

export function getCategoryStyles(
  service: ServiceKind,
  opts: { isPassback?: boolean; priority?: number } = {},
): CategoryStyles {
  const isUrgent = !!opts.isPassback || (opts.priority ?? 0) > 0;

  if (isUrgent) {
    return {
      kind: "urgent",
      label: opts.isPassback ? "Passback" : "Urgent",
      border: "border-l-4 border-l-warning",
      badge: "border-warning bg-warning text-warning-foreground",
      button:
        "bg-warning text-warning-foreground hover:bg-warning/90 focus-visible:ring-warning/50",
    };
  }

  if (service === "mot") {
    return {
      kind: "mot",
      label: "MOT",
      border: "border-l-4 border-l-info",
      badge: "border-info/40 bg-info/10 text-info",
      button:
        "bg-info text-info-foreground hover:bg-info/90 focus-visible:ring-info/50",
    };
  }

  // electrical + maintenance — collapse into one "mechanical" look.
  return {
    kind: "mechanical",
    label: "Mechanical",
    border: "border-l-4 border-l-primary",
    badge: "border-primary/40 bg-primary/10 text-primary",
    button: "bg-primary text-primary-foreground hover:bg-primary/90",
  };
}
