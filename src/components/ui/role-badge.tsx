import { ShieldCheck, UserCheck, Wrench, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// P51/P52 — "whose court is the ball in" chip. Driven by jobs.current_role.
// Always informational — never a button. Managers change current_role via
// the overflow-menu "Override role" action, not by clicking the chip.

export type CurrentRole = "mot_tester" | "mechanic" | "manager";

const ROLE_CONFIG: Record<
  CurrentRole,
  { label: string; className: string; icon: LucideIcon }
> = {
  mot_tester: {
    label: "With MOT tester",
    className: "border-info/40 bg-info/10 text-info",
    icon: ShieldCheck,
  },
  mechanic: {
    label: "With mechanic",
    className: "border-warning/40 bg-warning/10 text-warning",
    icon: Wrench,
  },
  manager: {
    label: "With manager",
    className: "border-primary/40 bg-primary/10 text-primary",
    icon: UserCheck,
  },
};

interface RoleBadgeProps {
  role: CurrentRole | null | undefined;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  if (!role) return null;
  const config = ROLE_CONFIG[role];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold",
        config.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
