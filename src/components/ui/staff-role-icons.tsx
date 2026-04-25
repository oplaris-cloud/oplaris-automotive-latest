import { MotTesterIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

// P1.2 — render qualification icons inline next to a staff member's name.
// Today: only mot_tester. Add new role icons here (electrical specialist,
// senior mechanic, etc.) as the role taxonomy grows; the call sites stay
// untouched because they pass the full roles array through.
//
// Wraps every icon in a <span title=...> so a hover (desktop) or long-press
// (touch) reveals what the icon means — no dedicated tooltip primitive needed
// for a single-glyph affordance.

interface StaffRoleIconsProps {
  /** Roles array off the staff row. `null` is treated as no roles. */
  roles: readonly string[] | null | undefined;
  /** Tailwind size override; default is 12 px so the icons sit cleanly
   *  inside a Badge / chip without overpowering the name. */
  className?: string;
}

export function StaffRoleIcons({ roles, className }: StaffRoleIconsProps) {
  if (!roles || roles.length === 0) return null;
  const isMotTester = roles.includes("mot_tester");
  if (!isMotTester) return null;

  return (
    <span className="inline-flex items-center gap-1" aria-hidden={false}>
      {isMotTester && (
        <span title="MOT tester" className="inline-flex">
          <MotTesterIcon className={cn("h-3 w-3 text-info", className)} />
          <span className="sr-only">MOT tester</span>
        </span>
      )}
    </span>
  );
}
