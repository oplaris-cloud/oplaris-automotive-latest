/** Phase 3 > V4 — pattern primitives.
 *
 *  Five self-tiling background patterns, all painted through CSS
 *  custom properties so they reskin per garage. Use them sparingly —
 *  large surfaces only (kiosk, status page, empty hero panels, auth
 *  screens). Never put a pattern behind body copy.
 *
 *    <HexGridPattern className="rounded-lg p-8 border">
 *      … content …
 *    </HexGridPattern>
 *
 *  All accept `color` / `opacity` / `size` so they can be tuned per
 *  surface without forking the component.
 */
export { HexGridPattern } from "./hex-grid";
export { DiagonalStripesPattern, HazardStripe } from "./diagonal-stripes";
export { DotsPattern } from "./dots";
export { ChevronPattern, TopoPattern } from "./chevron";
export { CircuitBoardPattern } from "./circuit-board";
export { DiamondsPattern } from "./diamonds";
export { EndlessCloudsPattern } from "./endless-clouds";
