/**
 * Color palette for annotation rectangles.
 *
 * Each `label_category` gets its own hue — the user can scan the page and
 * tell PII (red) from medical (purple) from legal (blue) at a glance.
 * Tone is intentionally muted so the rectangles don't overpower the text
 * layer underneath; the user is still reading the PDF, not the overlay.
 */

import type { RegionKind } from "./types";

const CATEGORY_COLORS: Record<string, { stroke: string; fill: string }> = {
  pii: { stroke: "rgb(220 38 38)", fill: "rgba(220, 38, 38, 0.12)" },
  medical: { stroke: "rgb(147 51 234)", fill: "rgba(147, 51, 234, 0.12)" },
  legal: { stroke: "rgb(37 99 235)", fill: "rgba(37, 99, 235, 0.12)" },
  workers_comp: { stroke: "rgb(13 148 136)", fill: "rgba(13, 148, 136, 0.12)" },
  financial: { stroke: "rgb(202 138 4)", fill: "rgba(202, 138, 4, 0.14)" },
  structure: { stroke: "rgb(100 116 139)", fill: "rgba(100, 116, 139, 0.12)" },
  custom: { stroke: "rgb(16 185 129)", fill: "rgba(16, 185, 129, 0.12)" },
};

const KIND_COLORS: Record<RegionKind, { stroke: string; fill: string }> = {
  annotation: { stroke: "rgb(16 185 129)", fill: "rgba(16, 185, 129, 0.12)" },
  candidate: { stroke: "rgb(245 158 11)", fill: "rgba(245, 158, 11, 0.10)" },
  search: { stroke: "rgb(250 204 21)", fill: "rgba(250, 204, 21, 0.30)" },
  selection: { stroke: "rgb(59 130 246)", fill: "rgba(59, 130, 246, 0.18)" },
  "page-overlay": {
    stroke: "rgb(244 114 182)",
    fill: "rgba(244, 114, 182, 0.18)",
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
