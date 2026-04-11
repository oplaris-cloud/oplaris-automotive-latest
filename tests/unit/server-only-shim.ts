// Empty shim for `server-only`. The real package throws on import in a
// client bundle; for tests we want server modules to load as plain ESM.
export {};
