import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** P56.1 (UI-C1) — Button primitive size scale aligned to CLAUDE.md's
 *  44×44 px touch-target rule + WCAG 2.5.5. Retired `xs` and `icon-xs`
 *  (24 px) — there is no legitimate use case on a shop-floor app
 *  where mechanics interact with gloves on.
 *
 *  | size     | height | use case                                       |
 *  |----------|--------|------------------------------------------------|
 *  | default  | 44 px  | standard CTAs, toolbar buttons, dialog actions |
 *  | sm       | 36 px  | dense tables ONLY — opt-in, never for primary  |
 *  | lg       | 48 px  | primary CTA on mobile / tech surfaces          |
 *  | xl       | 64 px  | hero CTAs (replaces inline `h-16` overrides)   |
 *  | icon     | 44×44  | standalone icon buttons                         |
 *  | icon-sm  | 36×36  | dense-table icon actions                        |
 *  | icon-lg  | 48×48  | primary icon buttons on mobile                  |
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        sm:
          "h-9 gap-1.5 px-3 text-sm rounded-[min(var(--radius-md),12px)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg:
          "h-12 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xl:
          "h-16 gap-3 px-6 text-lg has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5 [&_svg:not([class*='size-'])]:size-5",
        icon: "size-11",
        "icon-sm":
          "size-9 rounded-[min(var(--radius-md),12px)] [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonBaseProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>

/** P56.1 — `asChild` gives the shadcn/Radix-style composition ergonomic
 *  on top of Base UI's `render` prop: when true, Button styling is
 *  applied to the single child element (e.g. an `<a>` acting as a
 *  primary button). This is what fixes UI-C2 (the tech "Call" link). */
interface ButtonProps extends ButtonBaseProps {
  asChild?: boolean
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  render,
  ...props
}: ButtonProps) {
  const mergedClassName = cn(buttonVariants({ variant, size, className }))

  if (asChild && React.isValidElement(children)) {
    // When asChild is set, route the single child through Base UI's
    // `render` prop so the outer element becomes the child (anchor,
    // Link, etc.) while still picking up the button styling + focus
    // + aria-* behaviour from ButtonPrimitive.
    //
    // `nativeButton={false}` is required here — Base UI defaults to
    // `true` and emits a dev-time warning when the rendered element
    // isn't a native <button>. We're intentionally rendering an <a>
    // (e.g. the "Download PDF" link on the status page + any
    // `<Button asChild><Link>…</Link></Button>` pattern), so the
    // warning is a false positive unless we opt out here.
    return (
      <ButtonPrimitive
        data-slot="button"
        nativeButton={false}
        className={mergedClassName}
        render={children as React.ReactElement}
        {...props}
      />
    )
  }

  return (
    <ButtonPrimitive
      data-slot="button"
      className={mergedClassName}
      render={render}
      {...props}
    >
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
