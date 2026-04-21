/**
 * P56.1.d — FOUC-prevention script for the theme provider.
 *
 *  Server-only RSC. Mounts ONCE at the top of `<body>` in
 *  `src/app/layout.tsx` and writes the persisted (or system-preferred)
 *  theme class onto `<html>` before first paint, blocking on the
 *  inline script so the document never flashes the wrong theme.
 *
 *  Lives in its own RSC file so the inline `<script>` is rendered
 *  server-side ONLY — no client component re-renders it on hydration.
 *  That's what silences React 19 + Turbopack's
 *  "Encountered a script tag while rendering React component" warning
 *  that next-themes 0.4.6 trips. See `theme-provider.tsx` header for
 *  the full reasoning.
 *
 *  Storage key + class names + colorScheme behaviour mirror what
 *  `theme-provider.tsx` writes at runtime, so SSR and client agree.
 */

const SCRIPT = `
(function(){
  try {
    var s = window.localStorage.getItem("theme");
    var t = (s === "light" || s === "dark" || s === "system") ? s : "system";
    var resolved = t === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : t;
    var root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  } catch (e) {
    /* localStorage may throw in privacy mode — leave the default light theme. */
  }
})();
`;

export function ThemeScript() {
  return (
    <script
      // suppressHydrationWarning is required because the script mutates
      // the <html> class before React hydrates, which would otherwise
      // trip the hydration mismatch guard.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: SCRIPT }}
    />
  );
}
