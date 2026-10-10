/**
 * The PDF viewer toolbar's fold plan — which controls sit in the one row
 * and which fold into the `···` menu, for a given container width.
 *
 * The row is RENDERED from this plan with fixed-size parts (every width
 * below is the exact box the renderer draws), so "the plan fits" means
 * "the row fits". CSS container queries could not do this: they could not
 * see the pager or a host's docked chrome, and the row overlapped itself in
 * a 209px column (review of c66b1c9de19, 2026-10-10).
 *
 * Fold order (least to most used): rotate → actual size → fit width →
 * fit page → zoom − / % / + → the pager shrinks to a compact "3 / 12"
 * (previous / next move into the menu; swipe, arrow keys and wheel still
 * page). The `···` trigger never shrinks.
 *
 * Docked HOST chrome (a file tile's tab menu, kind actions, tile actions) is
 * measured into the row and folds too — it must never be clipped off-screen
 * (a focused Board PDF tile on a 390px phone drew "Extract text" at x=534).
 * `host` says how: "inline" (as drawn), "end-folded" (the end controls sit
 * behind one host trigger), "all-folded" (start + end behind one trigger).
 * Host folds sit between the view controls: the host's end folds before the
 * zoom steppers go, the whole host folds last.
 */

export const TOOLBAR_CONTROLS = [
  "zoom",
  "fitPage",
  "fitWidth",
  "actual",
  "rotate",
  "pager",
] as const;
export type PdfToolbarControl = (typeof TOOLBAR_CONTROLS)[number];

export interface PdfToolbarPlanInput {
  /** The viewer's measured width in CSS px (0 = not measured yet). */
  width: number;
  /** `pointer: coarse` — touch targets are 44px, otherwise 28px. */
  coarse: boolean;
  /** Pages in the document (0 while loading). */
  pages: number;
  /** Host wants the pager in the row at all (`pageNav`). */
  pageNav: boolean;
  /** Measured widths of host chrome docked at the row's ends (as drawn inline). */
  startWidth?: number;
  endWidth?: number;
}

/** How the host's docked chrome is drawn: inline, end behind one trigger, or both. */
export type PdfToolbarHostFold = "inline" | "end-folded" | "all-folded";

export interface PdfToolbarPlan {
  /** Square size of every icon button, px. */
  target: number;
  /** Controls drawn in the row (pager excluded — see `pager`). */
  row: PdfToolbarControl[];
  /** Controls reachable from the `···` menu. */
  menu: PdfToolbarControl[];
  pager: "full" | "compact" | "none";
  host: PdfToolbarHostFold;
  showMore: boolean;
  /** Width of the page counter text box, px. */
  counterWidth: number;
  /** Total drawn row width, px (≤ width whenever width > 0). */
  rowWidth: number;
}

/**
 * THE box sizes of the toolbar row. PdfDocumentRenderer draws every part
 * with these numbers (inline styles) — there is no second copy in Tailwind
 * classes for them to drift from (guard: toolbar-plan.test.ts).
 */
export const TOOLBAR_METRICS = {
  padding: 16, // inline padding, both sides together
  groupGap: 4, // between the left and right groups
  itemGap: 2, // between items in a group
  separator: 9, // 1px rule + 4px margin each side
  zoomLabel: 52, // the "Fit 75%" label
  targetCoarse: 44, // touch screens (pointer: coarse)
  targetFine: 28, // mouse / trackpad
} as const;

type FoldStep = PdfToolbarControl | "host-end" | "pager-compact" | "host-all";
const FOLD_ORDER: FoldStep[] = [
  "rotate",
  "actual",
  "fitWidth",
  "fitPage",
  "host-end",
  "zoom",
  "pager-compact",
  "host-all",
];

function groupWidth(parts: number[]): number {
  if (parts.length === 0) return 0;
  return parts.reduce((a, b) => a + b, 0) + TOOLBAR_METRICS.itemGap * (parts.length - 1);
}

export function measurePdfToolbar(
  input: PdfToolbarPlanInput,
  row: PdfToolbarControl[],
  menuCount: number,
  pager: PdfToolbarPlan["pager"],
  counterWidth: number,
  host: PdfToolbarHostFold = "inline",
): number {
  const t = input.coarse ? TOOLBAR_METRICS.targetCoarse : TOOLBAR_METRICS.targetFine;
  const m = TOOLBAR_METRICS;
  const left: number[] = [];
  if (host === "all-folded") {
    if (input.startWidth || input.endWidth) left.push(t, m.separator);
  } else if (input.startWidth) left.push(input.startWidth, m.separator);
  if (row.includes("zoom")) {
    left.push(t, m.zoomLabel, t);
    if (row.some((c) => c !== "zoom") || menuCount > 0) left.push(m.separator);
  }
  for (const c of ["fitPage", "fitWidth", "actual", "rotate"] as const) {
    if (row.includes(c)) left.push(t);
  }
  if (menuCount > 0) left.push(t);
  const right: number[] = [];
  if (pager === "full") right.push(t, counterWidth, t);
  if (pager === "compact") right.push(counterWidth);
  if (input.endWidth && host !== "all-folded") {
    if (right.length) right.push(m.separator);
    right.push(host === "end-folded" ? t : input.endWidth);
  }
  const l = groupWidth(left);
  const r = groupWidth(right);
  return m.padding + l + (l && r ? m.groupGap : 0) + r;
}

export function planPdfToolbar(input: PdfToolbarPlanInput): PdfToolbarPlan {
  const target = input.coarse ? TOOLBAR_METRICS.targetCoarse : TOOLBAR_METRICS.targetFine;
  const hasPager = input.pageNav && input.pages > 1;
  const counterWidth = input.pages >= 100 ? 64 : 48;
  let row: PdfToolbarControl[] = ["zoom", "fitPage", "fitWidth", "actual", "rotate"];
  const menu: PdfToolbarControl[] = [];
  let pager: PdfToolbarPlan["pager"] = hasPager ? "full" : "none";

  let host: PdfToolbarHostFold = "inline";

  const width = () =>
    measurePdfToolbar(input, row, menu.length, pager, counterWidth, host);
  if (input.width > 0) {
    for (const step of FOLD_ORDER) {
      if (width() <= input.width) break;
      if (step === "host-end") {
        if ((input.endWidth ?? 0) > target) host = "end-folded";
      } else if (step === "pager-compact") {
        if (pager === "full") {
          pager = "compact";
          menu.push("pager");
        }
      } else if (step === "host-all") {
        if ((input.startWidth ?? 0) + (input.endWidth ?? 0) > target) host = "all-folded";
      } else if (row.includes(step)) {
        row = row.filter((x) => x !== step);
        menu.unshift(step);
      }
    }
  }
  return {
    target,
    row,
    menu,
    pager,
    host,
    showMore: menu.length > 0,
    counterWidth,
    rowWidth: width(),
  };
}
