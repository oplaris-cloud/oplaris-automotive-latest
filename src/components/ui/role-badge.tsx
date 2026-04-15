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
    className:
      "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
    icon: ShieldCheck,
  },
  mechanic: {
    label: "With mechanic",
    className:
      "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
    icon: Wrench,
  },
  manager: {
    label: "With manager",
    className:
      "border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-200",
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
