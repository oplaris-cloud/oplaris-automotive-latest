import * as React from "react";

import { cn } from "@/lib/utils";

/** P56.0 (S-H1, S-M2) — Vertical stack with canonical gaps.
 *
 *  Every list of siblings should go through `<Stack>` so the audit's
 *  `space-y-*` drift (mixed with `mt-*` on children) dies at the
 *  primitive level. Three gap sizes map directly to DESIGN_SYSTEM §1.3:
 *
 *    sm  → space-y-2   (8 px)  — dense rows
 *    md  → space-y-4   (16 px) — standard lists / form-field rhythm
 *    lg  → space-y-6   (24 px) — section-internal loose rhythm
 *
 *  Renders as `<div>` by default; pass `as="ul"` for list semantics
 *  (the audit finder will likely flag a few `<ul>` call-sites).
 */

type StackGap = "sm" | "md" | "lg";

type StackAs = "div" | "ul" | "ol";

interface StackProps {
  gap?: StackGap;
  /** Render-as shim so `<Stack as="ul">` produces `<ul>` while
   *  keeping all the stack semantics. */
  as?: StackAs;
  className?: string;
  children?: React.ReactNode;
}

const STACK_GAP: Record<StackGap, string> = {
  sm: "space-y-2",
  md: "space-y-4",
  lg: "space-y-6",
};

export function Stack({
  gap = "md",
  as: Tag = "div",
  className,
  children,
}: StackProps) {
  return (
    <Tag
      data-slot="stack"
      data-gap={gap}
      className={cn(STACK_GAP[gap], className)}
    >
      {children}
    </Tag>
  );
}
