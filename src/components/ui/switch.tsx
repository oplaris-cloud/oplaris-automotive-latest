"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

/** B4 — Switch primitive built on base-ui to match the project's
 *  existing checkbox / radio pattern. Used for the TRADER toggle in
 *  the customer Edit + New forms. The track + thumb sizes give a
 *  44 px ÷ 24 px hit area when paired with the surrounding label
 *  (`<label class="flex items-center gap-3">`) so WCAG 2.5.5 holds.
 *
 *  States:
 *    * unchecked → muted track, thumb to the left
 *    * checked   → primary track, thumb to the right
 *    * disabled  → 50 % opacity, no pointer
 *    * focus     → ring on the track
 */
function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-checked:bg-primary",
        "data-unchecked:bg-input",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-sm ring-0 transition-transform",
          "data-checked:translate-x-5",
          "data-unchecked:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
