"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"

/** P56.1.d — Three-option theme selector (light / dark / system),
 *  rendered inside the top-bar user dropdown. Uses the radio-item
 *  variant so the active mode gets a visible check mark — matches the
 *  Nielsen #6 "recognition over recall" cue the spec cites.
 *
 *  Renders a placeholder before hydration so SSR + client match. The
 *  `suppressHydrationWarning` on <html> covers the pre-paint class
 *  write; this component avoids rendering theme-dependent UI until
 *  mounted. */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const active = theme ?? "system"
  const resolvedLabel =
    !mounted
      ? "Theme"
      : active === "system"
        ? `Theme · system (${resolvedTheme ?? "light"})`
        : `Theme · ${active}`

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {resolvedLabel}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={active}
        onValueChange={(v) => setTheme(v)}
      >
        <DropdownMenuRadioItem value="light" className="gap-2">
          <Sun className="h-4 w-4" />
          Light
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark" className="gap-2">
          <Moon className="h-4 w-4" />
          Dark
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system" className="gap-2">
          <Monitor className="h-4 w-4" />
          System
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  )
}

/** Dropdown-item-free variant for debugging / fallback surfaces. */
export function ThemeToggleItem() {
  const { theme, setTheme } = useTheme()
  const next =
    theme === "light" ? "dark" : theme === "dark" ? "system" : "light"
  return (
    <DropdownMenuItem onClick={() => setTheme(next)}>
      Switch to {next}
    </DropdownMenuItem>
  )
}
