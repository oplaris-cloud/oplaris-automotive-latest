/**
 * Bug-6 — Window event the SpotlightModal listens for so an external
 * trigger (the top-bar Global Search button) can open the modal
 * without sharing component state.
 *
 * Plain string constant; consumers `dispatchEvent(new CustomEvent(...))`
 * and `window.addEventListener(...)` against this name.
 */
export const SPOTLIGHT_OPEN_EVENT = "oplaris-spotlight-open";
