"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

/** P56.1.d — Thin wrapper around next-themes so the provider stays a
 *  client component while `src/app/layout.tsx` remains an RSC. The
 *  FOUC-prevention script ships out of the library itself when
 *  `attribute="class"` is set — it injects a blocking `<script>` that
 *  reads the persisted preference and writes the `.dark` class onto
 *  `<html>` before first paint. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
