// lib/dev/devControls.ts
//
// THE gate for developer-only controls (a "[DEV] …" button, a debug opener).
// They render in a development build only — never in production, whoever is
// signed in. An admin check is not this gate: on 2026-10-01 a production check
// signed in as an admin saw "[DEV] Open study session in window panel" on the
// deck page because the trigger was gated on the admin-debugger flag alone.
// Guard: lib/dev/__tests__/dev-controls-gate.test.ts fails on any source file
// that renders a "[DEV]" label without reading this constant.

export const SHOW_DEV_CONTROLS = process.env.NODE_ENV === "development";
