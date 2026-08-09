/**
 * Color palette for annotation rectangles.
 *
 * Each `label_category` gets its own hue — the user can scan the page and
 * tell PII (red) from medical (purple) from legal (blue) at a glance.
 * Rendered PDF pages are effectively always light, so strokes are the
 * saturated 600-weight of each hue and fills sit around 20% alpha —
 * strong enough to read over dense page content (the old 12% fills were
 * confirmed near-invisible, handoff 2026-07-28) while the text underneath
 * stays legible.
 */

import type { RegionKind } from "./types";

const CATEGORY_COLORS: Record<string, { stroke: string; fill: string }> = {
  pii: { stroke: "rgb(220 38 38)", fill: "rgba(220, 38, 38, 0.20)" },
  medical: { stroke: "rgb(147 51 234)", fill: "rgba(147, 51, 234, 0.20)" },
  legal: { stroke: "rgb(37 99 235)", fill: "rgba(37, 99, 235, 0.20)" },
  workers_comp: { stroke: "rgb(13 148 136)", fill: "rgba(13, 148, 136, 0.20)" },
  financial: { stroke: "rgb(202 138 4)", fill: "rgba(202, 138, 4, 0.22)" },
  structure: { stroke: "rgb(71 85 105)", fill: "rgba(71, 85, 105, 0.20)" },
  custom: { stroke: "rgb(5 150 105)", fill: "rgba(16, 185, 129, 0.20)" },
};

const KIND_COLORS: Record<RegionKind, { stroke: string; fill: string }> = {
  annotation: { stroke: "rgb(5 150 105)", fill: "rgba(16, 185, 129, 0.20)" },
  candidate: { stroke: "rgb(217 119 6)", fill: "rgba(245, 158, 11, 0.18)" },
  search: { stroke: "rgb(202 138 4)", fill: "rgba(250, 204, 21, 0.35)" },
  selection: { stroke: "rgb(37 99 235)", fill: "rgba(59, 130, 246, 0.22)" },
  "page-overlay": {
    stroke: "rgb(219 39 119)",
    fill: "rgba(244, 114, 182, 0.22)",
  },
};

const FALLBACK = KIND_COLORS.annotation;

export function colorsFor(input: {
  category?: string | null;
  kind?: RegionKind;
}): { stroke: string; fill: string } {
  if (input.category && CATEGORY_COLORS[input.category]) {
    return CATEGORY_COLORS[input.category];
  }
  if (input.kind) return KIND_COLORS[input.kind] ?? FALLBACK;
  return FALLBACK;
}
