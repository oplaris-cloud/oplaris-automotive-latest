"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe `matchMedia` hook backed by `useSyncExternalStore` so we don't
 * trigger React 19's "set state in effect" lint rule. Returns `false`
 * during SSR + first hydration tick, then flips to the real value.
 *
 * Usage: `const isMobile = useMediaQuery("(max-width: 639px)")`.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => {
      if (typeof window === "undefined" || !window.matchMedia) return false;
      return window.matchMedia(query).matches;
    },
    () => false,
  );
}
