/**
 * Visual-viewport arithmetic: where the on-screen keyboard is, and how tall a terminal anchored
 * at `top` may be so its last row and the accessory bar sit exactly above the keyboard. iOS
 * Safari shrinks only the VISUAL viewport when the keyboard opens; the layout viewport (and every
 * `100dvh`) stays full height, so a `bottom: 0` element ends up behind the keyboard.
 */

export interface ViewportBox {
  height: number;
  offsetTop: number;
}

/**
 * Below this the difference is browser chrome (Safari's collapsing toolbar), not a keyboard.
 * The smallest phone keyboard (iPhone SE landscape) is ~160px.
 */
export const KEYBOARD_MIN_PX = 120;

/** Height the keyboard (or any bottom overlay) takes out of the layout viewport; 0 when closed. */
export function keyboardInset(layoutHeight: number, vv: ViewportBox | null): number {
  if (!vv) return 0;
  const inset = Math.round(layoutHeight - vv.height - vv.offsetTop);
  return inset >= KEYBOARD_MIN_PX ? inset : 0;
}

/** Height from `top` (layout px) down to the bottom of what is visible. Never negative. */
export function visibleHeightBelow(top: number, vv: ViewportBox | null, layoutHeight: number): number {
  const bottom = vv ? vv.offsetTop + vv.height : layoutHeight;
  return Math.max(0, Math.floor(bottom - top));
}
