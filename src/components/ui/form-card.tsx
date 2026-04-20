import * as React from "react";

import { cn } from "@/lib/utils";

/** P56.2 — Form container with standardised spacing.
 *
 *  Every form in the app should be wrapped in `<FormCard>` so:
 *    - The max-width is `form` (max-w-xl / 576 px) per DESIGN_SYSTEM §1.3
 *    - Internal field rhythm is `space-y-5` (20 px) — "comfortable"
 *    - Standalone forms get card styling; in-dialog forms go borderless
 *
 *  Usage:
 *    <FormCard title="New customer" description="Add a customer record.">
 *      <form onSubmit={…}>
 *        <FormCard.Fields>
 *          <Input … />
 *          <Input … />
 *        </FormCard.Fields>
 *        <FormActions>
 *          <Button variant="outline" onClick={onCancel}>Cancel</Button>
 *          <Button type="submit">Save</Button>
 *        </FormActions>
 *      </form>
 *    </FormCard>
 */

type FormCardVariant = "card" | "plain";

interface FormCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** `card` (default): rounded border + padding for standalone pages.
   *  `plain`: no border/bg — for use inside dialogs/sheets that already
   *  provide their own card chrome. */
  variant?: FormCardVariant;
  className?: string;
  children?: React.ReactNode;
}

export function FormCard({
  title,
  description,
  variant = "card",
  className,
  children,
}: FormCardProps) {
  const isCard = variant === "card";
  return (
    <div
      data-slot="form-card"
      data-variant={variant}
      className={cn(
        "mx-auto w-full max-w-xl",
        isCard && "rounded-xl border bg-card p-6 shadow-sm",
        className,
      )}
    >
      {(title || description) && (
        <div className="mb-6">
          {title && (
            <h2 className="font-heading text-lg font-semibold leading-tight">
              {title}
            </h2>
          )}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/** Wraps the field stack inside a form — owns the `space-y-5` rhythm
 *  (DESIGN_SYSTEM §1.3 `space-5` = 20 px = "form-field rhythm"). */
function FormFields({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div data-slot="form-fields" className={cn("space-y-5", className)}>
      {children}
    </div>
  );
}

FormCard.Fields = FormFields;
