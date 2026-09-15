/**
 * canvasSwitcher — WHEN the canvas shows its item switcher.
 *
 * Pulled out of `CanvasPane` so the rule is a fact a guard can assert rather
 * than a boolean buried in a 500-line component. An independent review on
 * 2026-09-15 reported "with one item no switcher control exists at all", and
 * the answer had to be a decision, not an accident.
 *
 * THE DECISION: the switcher appears the moment there are TWO items, and not
 * before — the same as Claude.ai's artifact switcher. With one item there is
 * nothing to switch to; a `1/1` control that goes nowhere is the dead
 * affordance the no-dead-ends law forbids, and the pane header already names
 * the one item.
 */

export type CanvasPaneRole = "single" | "top" | "bottom";

export interface CanvasSwitcherVisibilityInput {
  paneRole: CanvasPaneRole;
  /** How many items the canvas holds right now. */
  itemCount: number;
  /** Is the canvas showing two panes at once? */
  isSplit: boolean;
}

export function shouldShowCanvasSwitcher({
  paneRole,
  itemCount,
  isSplit,
}: CanvasSwitcherVisibilityInput): boolean {
  // The bottom pane never owns a history picker — two of them on one surface
  // compete for the same job.
  if (paneRole === "bottom") return false;
  // Split already has both items on screen; switching is what split replaced.
  if (isSplit) return false;
  return itemCount > 1;
}
