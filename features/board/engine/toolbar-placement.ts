/**
 * Where the floating selection toolbar goes (pure). It sits centred above the selection (below when
 * there is no room) and NEVER over board chrome: the minimap, the zoom HUD, the assists pill and any
 * other floating dock. A candidate that would touch chrome slides sideways past it, else the next
 * candidate is tried (FigJam keeps its toolbar inside the free canvas).
 */
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface ToolbarPlacementInput {
  /** The selection's bounds in board-screen px. */
  selection: Box;
  toolbar: { w: number; h: number };
  area: { w: number; h: number };
  insets: { top: number; right: number; bottom: number; left: number };
  /** Chrome the toolbar must stay clear of, board-screen px. */
  avoid: readonly Box[];
  gap?: number;
  edge?: number;
}

const touches = (a: Box, b: Box, pad: number) => a.l < b.r + pad && b.l < a.r + pad && a.t < b.b + pad && b.t < a.b + pad;

export function placeToolbar(input: ToolbarPlacementInput): { left: number; top: number } {
  const { selection: sel, toolbar, area, insets, avoid } = input;
  const gap = input.gap ?? 12;
  const edge = input.edge ?? 8;
  const minTop = insets.top + edge;
  const maxTop = area.h - insets.bottom - edge - toolbar.h;
  const clampLeft = (x: number) => Math.max(edge, Math.min(area.w - toolbar.w - edge, x));
  const centred = clampLeft((sel.l + sel.r) / 2 - toolbar.w / 2);
  const tops = [sel.t - gap - toolbar.h, sel.b + gap, maxTop, minTop];
  const clear = (left: number, top: number) => {
    const box = { l: left, t: top, r: left + toolbar.w, b: top + toolbar.h };
    return !avoid.some((a) => touches(box, a, 4));
  };
  for (const top of tops) {
    if (top < minTop || top > maxTop) continue;
    if (clear(centred, top)) return { left: centred, top };
    const box = { l: centred, t: top, r: centred + toolbar.w, b: top + toolbar.h };
    for (const a of avoid.filter((x) => touches(box, x, 4))) {
      for (const left of [clampLeft(a.l - gap - toolbar.w), clampLeft(a.r + gap)]) {
        if (clear(left, top)) return { left, top };
      }
    }
  }
  // Nothing is clear (a tiny board): the old rule, above else below, inside the area.
  const top = tops[0] >= minTop ? tops[0] : Math.min(tops[1], maxTop);
  return { left: centred, top: Math.max(edge, top) };
}
