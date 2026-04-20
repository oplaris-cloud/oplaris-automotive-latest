/** Phase 3 > V3 — illustration primitives.
 *
 *  Every illustration in this folder paints itself through CSS custom
 *  properties set by the V1 brand loader (`brandStyleBlock`). No hex
 *  values live in component code — the palette changes per garage
 *  without touching a line of JSX.
 *
 *  Token → role
 *    var(--primary)            hero strokes, main metal, key fills
 *    var(--primary-foreground) text/lines on top of a primary fill
 *    var(--accent)              secondary shapes, highlights, glints
 *    var(--muted)               soft background wash behind the scene
 *    var(--muted-foreground)    supporting line-work, shadows
 *    var(--border)              frames, outlines, reticles
 *    var(--card)                "paper" surfaces inside the scene
 *    var(--foreground)          ink/type inside the scene
 */
export interface IllustrationProps {
  /** Applied to the root <svg>. */
  className?: string;
  /** Optional aria-label — set to "" for decorative use. */
  title?: string;
  /** Width/height fallback for non-Tailwind consumers. Defaults to responsive. */
  size?: number | string;
}

/** Shared <svg> boilerplate. Keeps viewBox + a11y consistent. */
export function svgProps(
  title: string | undefined,
  viewBox: string,
  size: number | string | undefined,
  className: string | undefined,
) {
  const isDecorative = title === "" || title === undefined;
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox,
    width: size,
    height: size,
    role: isDecorative ? ("presentation" as const) : ("img" as const),
    "aria-label": isDecorative ? undefined : title,
    "aria-hidden": isDecorative ? true : undefined,
    className,
  };
}
