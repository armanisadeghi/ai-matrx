// components/diff/text/diffColors.ts
//
// THE single source of truth for text/markdown diff colors across the app.
// Every light-engine renderer (TextDiff, InlineTextDiff, DiffCanvas, …) imports
// these — so "the diff colors are unreadable" is structurally impossible to
// reintroduce in one renderer while the others are fine.
//
// GitHub-style palette — the de-facto enterprise standard, legible in both
// light and dark. Three intensities per color, layered:
//   LINE_BG  — the whole changed line, the faintest tint.
//   WORD_BG  — the exact changed words, layered on top of LINE_BG so the edit
//              pops out of the line.
//   GUTTER   — the +/- markers and other foreground accents.
// Reds = removed (old-only), greens = added (new-only). Dark mode uses a bright
// hue at low opacity (green-500/15) rather than a near-black 950 shade, which
// is what made the old scheme invisible.

import type { LineChangeType } from "./engine/types";

export const LINE_BG = {
  added: "bg-green-100 dark:bg-green-500/15",
  removed: "bg-red-100 dark:bg-red-500/15",
} as const;

export const WORD_BG = {
  added: "bg-green-300 dark:bg-green-500/40",
  removed: "bg-red-300 dark:bg-red-500/40",
} as const;

export const GUTTER = {
  added: "text-green-700 dark:text-green-400",
  removed: "text-red-700 dark:text-red-400",
} as const;

/** Inline (unified) line background, keyed by the line's own type. Inline never
 * emits "modified" — a change becomes a removed line then an added line. */
export const INLINE_BG: Record<"added" | "removed" | "unchanged", string> = {
  added: LINE_BG.added,
  removed: LINE_BG.removed,
  unchanged: "",
};

/** Per-side tint for a split (side-by-side) row: the OLD column reads red on
 * removed/modified rows, the NEW column reads green on added/modified rows.
 * An absent cell (line exists only on the other side) gets a neutral fill. */
export function splitSideTint(
  type: LineChangeType,
  side: "left" | "right",
  isEmpty: boolean,
): string {
  if (isEmpty) return "bg-muted/40";
  if (side === "left" && (type === "removed" || type === "modified"))
    return LINE_BG.removed;
  if (side === "right" && (type === "added" || type === "modified"))
    return LINE_BG.added;
  return "";
}

/** Word-segment highlight class for a kept (changed) intra-line segment. */
export function wordSegmentClass(side: "left" | "right"): string {
  return side === "left" ? WORD_BG.removed : WORD_BG.added;
}
