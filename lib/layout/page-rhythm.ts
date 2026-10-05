// PAGE RHYTHM — the ONE spacing scale for page STRUCTURE (owner, 2026-10-05).
//
// The 28px control system is dense on purpose, and that density is right for a SET of controls
// (a toolbar, a row of filters). Between the big blocks of a page — the page top (feature cards,
// a KPI row, a promo banner), the list, the pager — density reads as clutter. So page structure
// has its own, more generous scale, and every page reads it from here instead of picking a
// `pb-4` / `gap-2` / `pt-2` of its own:
//
//   gutter      the page's left/right inset                          12px phone · 16px ≥640px
//   top         header bottom → the page's first block               16px phone · 24px ≥640px
//   block gap   between two big blocks (page top → list, section → section) 24px · 32px ≥640px
//               (measured before: 22-24px under the agents feature cards, which the owner
//               called too tight — "we need more space above and below them")
//   end         the page's TOTAL bottom space                        = gutter (12px · 16px)
//
// Why end = gutter, not the block gap: the page's content sits in one even frame — the space
// under the last element matches the space beside it. The owner's words (2026-10-05): "the
// bottom padding in total is the same as the other space". Measured before this scale, list
// pages ended 20px under their pager beside a 12px gutter; a 24px end would have grown it.
//
// THE NO-STACKING RULE. The space under a page's last element is `end` — once. When something
// floats over the bottom of the viewport (the page assistant, the assists pill, the mobile dock)
// the page ends `end` above THAT instead. Never both, and never a page's own padding on top:
//   - a page that SCROLLS gets the shell's runway (styles/shell.css `--matrx-floating-clearance`
//     = what floats + `end`), and the runway REPLACES its scroller's own bottom padding;
//   - a page that does NOT scroll (a list whose table fills the height with its own pager) gets
//     no runway at all — its viewport surface pads its foot by `end` + what floats, so the pager
//     sits `end` above the floating chat, never under it.
//
// The CSS custom properties below are the source the pages read (styles/shell.css :root); this
// module carries the same numbers for code and tests (lib/layout/page-rhythm.test.ts pins both).
// The dev guard (usePageRhythmGuard) screams `[page-rhythm]` when a page ends with more than
// `end` + PAGE_RHYTHM_TOLERANCE_PX of empty space — the double-padding class.

/** The page-structure scale, in px, per breakpoint (`wide` applies at ≥ PAGE_RHYTHM_WIDE_MIN_PX). */
export const PAGE_RHYTHM = {
  narrow: { gutter: 12, top: 16, blockGap: 24, end: 12 },
  wide: { gutter: 16, top: 24, blockGap: 32, end: 16 },
} as const;

/** The viewport width the wide scale starts at (Tailwind `sm`). */
export const PAGE_RHYTHM_WIDE_MIN_PX = 640;

/** The CSS custom properties that carry the scale (styles/shell.css :root). */
export const PAGE_RHYTHM_VARS = {
  gutter: "--matrx-page-gutter",
  top: "--matrx-page-top",
  blockGap: "--matrx-page-block-gap",
  end: "--matrx-page-end",
} as const;

/** Rounding and sub-pixel slack before an end space counts as doubled. */
export const PAGE_RHYTHM_TOLERANCE_PX = 4;

export type PageRhythmScale = (typeof PAGE_RHYTHM)[keyof typeof PAGE_RHYTHM];

/** The scale in force at a viewport width. */
export function pageRhythmFor(viewportWidth: number): PageRhythmScale {
  return viewportWidth >= PAGE_RHYTHM_WIDE_MIN_PX ? PAGE_RHYTHM.wide : PAGE_RHYTHM.narrow;
}

/** Tags whose box IS content even without a direct text node. */
const CONTENT_TAGS = new Set(["IMG", "SVG", "VIDEO", "CANVAS", "INPUT", "TEXTAREA", "SELECT", "BUTTON", "IFRAME", "TABLE"]);

function hasOwnText(element: Element): boolean {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim()) return true;
  }
  return false;
}

/**
 * A bordered box (a card, the table frame) ends where its bottom border does. Only borders count:
 * a page's background wrapper is filled edge to edge and is never the page's last content.
 */
function isFramed(style: CSSStyleDeclaration): boolean {
  const border = Number.parseFloat(style.borderBottomWidth) || 0;
  return border > 0 && style.borderBottomStyle !== "none" && style.borderBottomColor !== "rgba(0, 0, 0, 0)" && style.borderBottomColor !== "transparent";
}

export interface PageEnd {
  /** The lowest piece of visible content inside the scroller (null when it has none). */
  last: Element | null;
  /** The scroller's visible bottom edge, in viewport px. */
  viewBottom: number;
  /** The top of whatever floats over the scroller's bottom (viewBottom when nothing does). */
  floatingTop: number;
  /** Empty space between the last content and the floating chrome (or the visible edge). */
  endSpacePx: number;
}

/**
 * Where a scroller's content visibly ends, and how much empty space sits under it — measured
 * against the floating chrome's top when something floats over its bottom edge, else against the
 * scroller's own visible bottom. Call it with the scroller at its end.
 */
export function measurePageEnd(
  scroller: Element,
  floatingRects: ReadonlyArray<Pick<DOMRect, "top" | "bottom" | "left" | "right">>,
): PageEnd {
  const isDocument = scroller === document.scrollingElement || scroller === document.documentElement;
  const view = isDocument ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
  const viewBottom = Math.min(view.bottom, window.innerHeight);
  const over = floatingRects.filter((r) => r.top < viewBottom && r.bottom > viewBottom - 200);
  const floatingTop = over.length ? Math.min(viewBottom, ...over.map((r) => r.top)) : viewBottom;
  let lastBottom = Number.NEGATIVE_INFINITY;
  let last: Element | null = null;
  const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node as Element;
    if (element.closest("[data-matrx-floating-bottom], .ambient-assistant-dock, .shell-dock, [data-window-panel]")) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (rect.top >= viewBottom || rect.bottom <= view.top) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "contents") continue;
    if (!CONTENT_TAGS.has(element.tagName.toUpperCase()) && !hasOwnText(element) && !isFramed(style)) continue;
    const bottom = Math.min(rect.bottom, viewBottom);
    if (bottom > lastBottom) {
      lastBottom = bottom;
      last = element;
    }
  }
  const endSpacePx = last ? Math.round(floatingTop - lastBottom) : 0;
  return { last, viewBottom, floatingTop, endSpacePx };
}

/** True when a page ends with more empty space than the scale allows — the double-padding class. */
export function isDoublePadded(endSpacePx: number, viewportWidth: number): boolean {
  return endSpacePx > pageRhythmFor(viewportWidth).end + PAGE_RHYTHM_TOLERANCE_PX;
}
