import type { AgentSortOption } from "@/features/agents/redux/agent-consumers/slice";

export type RightPanel = "detail" | "sort" | "categories" | "tags" | null;

export const SORT_OPTIONS: { value: AgentSortOption; label: string }[] = [
  { value: "updated-desc", label: "Recent" },
  { value: "created-desc", label: "Created" },
  { value: "name-asc", label: "A \u2192 Z" },
  { value: "name-desc", label: "Z \u2192 A" },
  { value: "category-asc", label: "Category" },
];

export const PANEL_HEIGHT = "528px";

/**
 * 🚨 THE PANEL NEVER OUTGROWS THE SPACE IT HAS.
 *
 * The popover reserves a FIXED footprint on purpose (a resizing panel in a
 * narrow rail gets collision-shifted out from under the cursor). But a flat
 * 528px is taller than the room above a trigger sitting mid-page on a laptop,
 * and Radix cannot shift what does not fit either way — so the top of the
 * panel, which is the SEARCH BOX, was rendered off-screen. Measured 2026-09-08
 * on the mandate Holder screen at 1280x900: the popover sat at `top: -76`.
 *
 * Clamping to Radix's own measurement keeps the footprint fixed whenever there
 * IS room and merely shortens the list when there is not — the panel still
 * never resizes while open, because the available height does not change while
 * the popover is open.
 */
export const LIST_MAX_HEIGHT =
  "min(528px, var(--radix-popper-available-height, 528px))";
