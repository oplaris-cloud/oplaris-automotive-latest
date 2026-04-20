import * as React from "react";

import { cn } from "@/lib/utils";

/** P56.2 — Standardised form button row.
 *
 *  Every form's submit/cancel footer goes through `<FormActions>` so:
 *    - Buttons stack mobile-first (`flex-col-reverse` → secondary on top)
 *    - Buttons go inline on `sm:` breakpoint (`sm:flex-row sm:justify-end`)
 *    - Top margin is consistent (`mt-6`)
 *    - Full-width buttons on mobile (`w-full sm:w-auto`)
 *
 *  Convention: put the secondary (cancel/back) button first in source
 *  order, then the primary (submit). `flex-col-reverse` makes the
 *  primary appear on top on mobile (thumb-zone), while `sm:flex-row`
 *  keeps the standard left-secondary / right-primary desktop pattern.
 *
 *  Usage:
 *    <FormActions>
 *      <Button variant="outline" onClick={onCancel}>Cancel</Button>
 *      <Button type="submit" disabled={pending}>Save</Button>
 *    </FormActions>
 *
 *    // Full-width variant (kiosk / mobile-primary surfaces):
 *    <FormActions fullWidth>
 *      <Button type="submit">Continue</Button>
 *    </FormActions>
 */

interface FormActionsProps {
  /** When true, buttons stay full-width even on desktop. Use for kiosk
   *  and mobile-primary surfaces where single-column is always right. */
  fullWidth?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function FormActions({
  fullWidth = false,
  className,
  children,
}: FormActionsProps) {
  return (
    <div
      data-slot="form-actions"
      className={cn(
        "mt-6 flex gap-3",
        fullWidth
          ? "flex-col [&>*]:w-full"
          : "flex-col-reverse sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}
