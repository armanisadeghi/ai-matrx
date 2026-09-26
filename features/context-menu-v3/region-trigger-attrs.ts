/**
 * The attributes ContextMenuV3 stamps onto every right-click REGION it wraps
 * (the chat composer textarea, every sidebar chat row, messages, table rows).
 *
 * ONE source: `ContextMenuV3.tsx` spreads this onto its trigger, and the real-
 * browser layout gate (`features/shell/layout-gate/shipped-css-region-triggers.spec.ts`)
 * renders its fixtures with the same object — so a stylesheet the app ships
 * that styles these attributes (the 2026-09-26 `[data-alchemy-trigger] {
 * width: 2rem }` collapse) is measured against exactly what production emits.
 *
 * Plain data, no React: the Playwright spec imports it directly.
 */
export const CONTEXT_REGION_TRIGGER_ATTRS = {
  "data-alchemy-trigger": "context",
} as const;
