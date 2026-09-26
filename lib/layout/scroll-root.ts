// lib/layout/scroll-root.ts
//
// The element that actually scrolls `el` vertically — for an
// IntersectionObserver `root`. With the implicit root (the viewport), a
// `rootMargin` extends only the viewport: content inside a window panel, a
// side drawer or any other own-scroll container is clipped by that container
// first, so "draw when within 1500px" silently became "draw when visible"
// there. Returns null when the page itself scrolls (the viewport is right).
//
// Only an ancestor that scrolls vertically NOW counts: `overflow-x: auto` on a
// table wrapper computes `overflow-y: auto` as well, but it has no vertical
// overflow and is never the reader's scroller.
//
// Cost: dozens of diagrams in one long answer each ask on mount, so an
// ancestor's overflow style is read once and remembered (measured: 2.2 s of a
// 1 MB chat preview went to repeated style reads before this cache).
const scrollsByStyle = new WeakMap<Element, boolean>();

export function nearestScrollRoot(el: Element | null): Element | null {
  if (typeof window === "undefined" || !el) return null;
  const page = document.scrollingElement;
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node === page || node === document.body || node === document.documentElement) return null;
    let scrolls = scrollsByStyle.get(node);
    if (scrolls === undefined) {
      const { overflowY } = getComputedStyle(node);
      scrolls = overflowY === "auto" || overflowY === "scroll";
      scrollsByStyle.set(node, scrolls);
    }
    if (scrolls && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}
