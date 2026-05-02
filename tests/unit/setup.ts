import "@testing-library/jest-dom/vitest";

// jsdom doesn't ship ResizeObserver — cmdk + base-ui need it. The
// no-op stub is enough for component tests that never inspect the
// observer's measurements.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}
