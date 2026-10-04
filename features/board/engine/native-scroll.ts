/**
 * Board — the board never scrolls natively.
 *
 * The camera is the ONLY thing that moves the board. But a clipped
 * (`overflow: hidden`) box is still a scroll container that `focus()` and
 * `scrollIntoView()` can scroll: a grid focusing a cell inside a tile shifted
 * the whole board sideways. Such a scroll is always an accident — nobody can
 * scroll a clipped box by hand — so the viewport resets it at once.
 *
 * An accident is a scroll of: the board root, a clipped ancestor of it (the
 * pane the board sits in), or a tile card. Content that scrolls for real
 * (overflow auto/scroll) and a user-scrollable page are left alone.
 */
export function isAccidentalScroll(el: Element, root: Element): boolean {
  if (el === root) return true;
  if (el.matches("[data-board-card]")) return true;
  if (!el.contains(root)) return false;
  const style = getComputedStyle(el);
  return /^(hidden|clip)$/.test(style.overflowX) || /^(hidden|clip)$/.test(style.overflowY) || style.overflow === "hidden" || style.overflow === "clip";
}
