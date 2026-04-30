import { cn } from "@/lib/utils";

/** B4 — TRADER chip rendered next to a customer name on every staff
 *  surface. Uses the warning (amber) token so it stays visually
 *  distinct from primary/success/info/destructive — TRADER is neither
 *  a positive status (success) nor a problem (destructive); it's a
 *  business-context flag the manager wants to spot at a glance.
 *
 *  Renders nothing when `isTrader` is false so call sites can pass
 *  the boolean unconditionally and the JSX stays clean.
 */
interface TraderBadgeProps {
  isTrader: boolean | null | undefined;
  className?: string;
}

export function TraderBadge({ isTrader, className }: TraderBadgeProps) {
  if (!isTrader) return null;
  return (
    <span
      data-slot="trader-badge"
      className={cn(
        "ml-2 inline-flex items-center rounded-md bg-warning/15 px-2 py-1 text-[10px] font-bold uppercase leading-none tracking-wider text-warning ring-1 ring-inset ring-warning/30",
        className,
      )}
    >
      TRADER
    </span>
  );
}
