import { cn } from "@/lib/utils";

/** Phase 3 > V1 — Brand display for the garage's logo + name.
 *
 *  When `logoUrl` is set, render a plain `<img>` (arbitrary Supabase
 *  Storage hosts don't get added to `next.config.images.domains`; the
 *  CSP `img-src` directive is already widened to the project host).
 *  When it isn't, fall back to the garage name typeset in the brand
 *  colour — the tokens already apply via `var(--primary)` because
 *  the app layout injected them.
 *
 *  Used in the sidebar header today; V5 wires the same component into
 *  the login hero, kiosk welcome, and the PDF job-sheet header so
 *  every surface re-themes from one source.
 */

interface GarageLogoProps {
  name: string;
  logoUrl?: string | null;
  /** Visual size. `md` (default) fits the 56-px sidebar header; `lg`
   *  is for hero surfaces (login, kiosk welcome, status page). */
  size?: "sm" | "md" | "lg";
  /** Suppress the name next to the mark — use when the logo itself is
   *  already a wordmark. */
  hideName?: boolean;
  className?: string;
}

/** Per-size token table. `img` = the height cap when the business
 *  name renders alongside the logo. `imgSolo` = the larger cap used
 *  when `hideName` is true so an uploaded wordmark fills the sidebar
 *  header (or login/kiosk hero) instead of shrinking to 24 px. */
const SIZES = {
  sm: { img: 20, imgSolo: 32, text: "text-xs" },
  md: { img: 24, imgSolo: 44, text: "text-sm" },
  lg: { img: 36, imgSolo: 72, text: "text-lg" },
} as const;

export function GarageLogo({
  name,
  logoUrl,
  size = "md",
  hideName = false,
  className,
}: GarageLogoProps): React.JSX.Element {
  const dims = SIZES[size];

  if (logoUrl) {
    const cap = hideName ? dims.imgSolo : dims.img;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2",
          hideName && "w-full justify-center",
          className,
        )}
      >
        { /* eslint-disable-next-line @next/next/no-img-element */ }
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className={cn("object-contain", hideName && "max-w-full")}
          style={{ maxHeight: cap, width: "auto", height: "auto" }}
        />
        {hideName ? null : (
          <span
            className={cn(
              "font-semibold tracking-tight text-sidebar-foreground",
              dims.text,
            )}
          >
            {name}
          </span>
        )}
      </span>
    );
  }

  // Text fallback — brand colour via `var(--primary)`, not a
  // hard-coded hex. The text is bold + slightly tighter letter-spacing
  // so it reads as a wordmark, not a plain run of characters.
  return (
    <span
      className={cn(
        "font-bold tracking-tight",
        dims.text,
        className,
      )}
      style={{ color: "var(--primary)" }}
    >
      {name}
    </span>
  );
}
