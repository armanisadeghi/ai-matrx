/**
 * THE panel motion, as Tailwind classes — the motion-standard law
 * (common-docs/policies/motion-standard.md).
 *
 * Every panel, sidebar, dock, drawer, sheet and the canvas column slides its
 * size or position on ONE pair, defined once in app/globals.css:
 * `--matrx-motion-duration-panel` (600ms; 0ms under reduced motion) and
 * `--matrx-motion-ease-panel` (cubic-bezier(0.4, 0, 0.2, 1), an even
 * ease-in-out — never the spring, which overshoots).
 *
 * Pair the timing with the property that moves, and drop the whole class while
 * the person drags a resize handle:
 *
 *   cn(!dragging && cn("transition-[width]", PANEL_MOTION_CLASS))
 *
 * Guard: `pnpm check:motion-standard` flags a panel slide that states its own
 * duration or curve instead.
 */
export const PANEL_MOTION_CLASS =
  "duration-(--matrx-motion-duration-panel) ease-(--matrx-motion-ease-panel) motion-reduce:transition-none";

/** CSS-in-JS form, for a `style` transition or a motion library. */
export const PANEL_MOTION_DURATION_VAR = "var(--matrx-motion-duration-panel)";
export const PANEL_MOTION_EASE_VAR = "var(--matrx-motion-ease-panel)";
