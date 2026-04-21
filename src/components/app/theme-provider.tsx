"use client";

import * as React from "react";

/** P56.1.d — In-repo theme provider, replaces `next-themes` v0.4.6.
 *
 *  next-themes 0.4.6 renders an inline `<script>` tag inside its
 *  client `<ThemeProvider>` to prevent FOUC. React 19 + Turbopack
 *  (Next 16+) emit a console warning every render of that path:
 *  "Encountered a script tag while rendering React component.
 *   Scripts inside React components are never executed when
 *   rendering on the client." The script DID execute server-side on
 *   first paint, but React's stricter check still warns on every
 *   client re-render. Upstream next-themes has no toggle to suppress
 *   it (as of 0.4.6); the 1.0.0-beta is not yet stable.
 *
 *  Fix: render the FOUC-prevention `<script>` server-side ONCE via
 *  `<ThemeScript />` (`./theme-script.tsx`, RSC), and ship a tiny
 *  client-side React Context here for the runtime `useTheme()` API.
 *  No client component renders the `<script>`, so the warning is
 *  silenced at the source rather than suppressed.
 *
 *  API surface intentionally matches the slice of `next-themes` we
 *  actually use:
 *    - `theme: "light" | "dark" | "system"`
 *    - `resolvedTheme: "light" | "dark"`  (system → matchMedia)
 *    - `setTheme(value)` — persists to localStorage + writes
 *      `class="light|dark"` + `style.colorScheme` on `<html>`.
 *    - `useTheme()` hook with a graceful fallback when used outside
 *      the provider (matches next-themes' permissive behaviour for
 *      consumers like `sonner.tsx` that may render very early).
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage may throw under privacy modes — fall through to default.
  }
  return "system";
}

function systemPrefers(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme === "system") return systemPrefers();
  return theme;
}

function applyToDocument(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initial state mirrors what `<ThemeScript />` already wrote onto
  // `<html>` server-side, so there is no class flash here. Reading
  // localStorage in the initialiser keeps SSR (`window === undefined`)
  // returning `"system"`; the client lazily corrects on first render.
  const [theme, setThemeState] = React.useState<Theme>(() => readStored());
  const [resolvedTheme, setResolved] = React.useState<ResolvedTheme>(() =>
    resolve(theme),
  );

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Same privacy-mode fallback as readStored.
    }
    const r = resolve(next);
    setResolved(r);
    applyToDocument(r);
  }, []);

  // Keep the resolved theme in sync with system preference when the user
  // has chosen "system". Listener also covers the cross-tab `storage`
  // event so a theme change in one tab propagates to others.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystem = () => {
      if (theme !== "system") return;
      const r = systemPrefers();
      setResolved(r);
      applyToDocument(r);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const v = event.newValue;
      if (v === "light" || v === "dark" || v === "system") {
        setThemeState(v);
        const r = resolve(v);
        setResolved(r);
        applyToDocument(r);
      }
    };
    mq.addEventListener("change", handleSystem);
    window.addEventListener("storage", handleStorage);
    return () => {
      mq.removeEventListener("change", handleSystem);
      window.removeEventListener("storage", handleStorage);
    };
  }, [theme]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Hook with a permissive fallback (matches next-themes behaviour). */
export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (ctx) return ctx;
  return {
    theme: "system",
    resolvedTheme: "light",
    setTheme: () => {
      // No-op outside provider — kept silent to match next-themes.
    },
  };
}
