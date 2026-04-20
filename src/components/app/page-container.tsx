import * as React from "react";

import { cn } from "@/lib/utils";

/** P56.3 (UI-H1, UI-H10, UI-H13) — Canonical page-level width wrapper.
 *
 *  Kills the 10 ad-hoc `max-w-*` values that drifted across `src/app`.
 *  Every page-level `page.tsx` renders its root content through
 *  `<PageContainer width="...">`; internal sections stay flexible.
 *
 *  | width    | max-width          | intent                              |
 *  |----------|--------------------|-------------------------------------|
 *  | full     | no cap             | lists, bay-board, kanban, tables    |
 *  | default  | max-w-5xl (1024px) | detail pages, Today dashboard       |
 *  | narrow   | max-w-3xl (768px)  | tech surfaces, settings sub-pages   |
 *  | form     | max-w-xl (576px)   | single-column create/edit forms     |
 *
 *  Owns: horizontal padding (`px-4 sm:px-6`), mobile safe-area bottom
 *  padding (`pb-[max(2rem,env(safe-area-inset-bottom))]`), and the
 *  `mx-auto` centering. Pages must not add their own `max-w-*`.
 */

type PageContainerWidth = "full" | "default" | "narrow" | "form";

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: PageContainerWidth;
}

const WIDTH_CLASS: Record<PageContainerWidth, string> = {
  full: "",
  default: "max-w-5xl",
  narrow: "max-w-3xl",
  form: "max-w-xl",
};

/** Horizontal & vertical padding lives on `<main>` in `AppShell`; this
 *  primitive only owns width containment + centering. Keeping them
 *  separate means public surfaces (kiosk, status) can use PageContainer
 *  without inheriting the app-shell padding. */
export function PageContainer({
  width = "default",
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      data-slot="page-container"
      data-width={width}
      className={cn("mx-auto w-full", WIDTH_CLASS[width], className)}
      {...props}
    >
      {children}
    </div>
  );
}
