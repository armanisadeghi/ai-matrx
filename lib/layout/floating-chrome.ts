// lib/layout/floating-chrome.ts
//
// THE FLOATING-CLEARANCE PRIMITIVE — shared half (measurement + the coverage test).
//
// THE DEFECT CLASS (owner, 2026-10-04): a page scrolls, but its last content
// can never scroll clear of the chrome that floats over the bottom of the
// viewport — the ambient chat/composer dock, the mobile dock, the window tray,
// mobile action bars. A page that drops its hand-written bottom padding (or
// never had any) leaves its final lines permanently under the floating chat.
//
// THE MECHANISM:
//   1. `FloatingClearanceSync` (features/shell/components) measures every
//      visible element matching FLOATING_BOTTOM_SELECTOR and publishes
//      `--matrx-floating-measured` on <html>: how many px of the viewport's
//      bottom edge that chrome occupies right now (0 when nothing floats).
//   2. styles/shell.css derives `--matrx-floating-clearance` from it (+ safe
//      area + a breathing gap) and gives EVERY page scroll owner a final
//      runway of that height by default — `.shell-main` itself, a full-height
//      route body under it, and any `<main>` / `[data-matrx-page-scroll]`
//      scroller. A page cannot forget it; it opts OUT only with
//      `data-floating-clearance="off"` plus a `// ui-exception:` reason
//      (`pnpm check:floating-clearance` enforces the reason).
//   3. `useFloatingClearanceGuard` (dev only) checks, whenever a scroller is
//      scrolled to its end, that no content is still under a floating element,
//      and screams + outlines it when one is.
//
// New floating chrome joins by carrying `data-matrx-floating-bottom` — nothing
// else to wire.

/** Every element that floats over the bottom of the viewport. */
export const FLOATING_BOTTOM_SELECTOR = [
  "[data-matrx-floating-bottom]",
  // The ambient chat/composer dock (packages/chat ambient-assistant launchers).
  ".ambient-assistant-dock",
  // The mobile nav dock (features/shell/components/dock/MobileDock).
  ".shell-dock",
].join(", ");

/**
 * Transient overlays — toasts, an open popover/panel — are NEVER floating chrome. They float OVER
 * the page and must never move it: measuring a toast grew every page's runway while it showed
 * (owner, 2026-10-06: "toasts are moving the page"). Floating chrome is only what stays put.
 */
export const TRANSIENT_OVERLAY_SELECTOR = "[data-sonner-toast], [data-sonner-toaster]";

/** The CSS variable FloatingClearanceSync writes on <html>. */
export const FLOATING_MEASURED_VAR = "--matrx-floating-measured";

/**
 * The same measure WITHOUT chrome that follows the page (`data-matrx-floating-follows-page`:
 * the assists pill rests above a list's pager via --page-bottom-dock-h). A non-scrolling page
 * surface (`[data-matrx-page-end]`, lib/layout/page-rhythm.ts) pads its foot by this one, so
 * the pager and the pill never push each other up.
 */
export const FLOATING_FIXED_MEASURED_VAR = "--matrx-floating-fixed-measured";

/** Marks floating chrome that positions itself above the page's own bottom bar. */
export const FLOATING_FOLLOWS_PAGE_ATTR = "data-matrx-floating-follows-page";

/** An element counts as bottom-anchored when its bottom edge is this close to the viewport's. */
const BOTTOM_ANCHOR_SLACK_PX = 160;
/** Something taller than this share of the viewport is a window, not a bar — never clearance. */
const MAX_FLOATING_SHARE = 0.6;

export interface FloatingBox {
  element: Element;
  rect: DOMRect;
}

function isShown(element: Element, rect: DOMRect): boolean {
  if (rect.width === 0 || rect.height === 0) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

/** The visible, bottom-anchored floating chrome on screen now. */
export function floatingBottomBoxes(doc: Document = document): FloatingBox[] {
  const viewportHeight = doc.defaultView?.innerHeight ?? 0;
  if (!viewportHeight) return [];
  const boxes: FloatingBox[] = [];
  for (const element of doc.querySelectorAll(FLOATING_BOTTOM_SELECTOR)) {
    const rect = element.getBoundingClientRect();
    if (!isShown(element, rect)) continue;
    if (rect.bottom < viewportHeight - BOTTOM_ANCHOR_SLACK_PX) continue;
    if (rect.height > viewportHeight * MAX_FLOATING_SHARE) continue;
    boxes.push({ element, rect });
  }
  return boxes;
}

/** Px of the viewport's bottom edge the floating chrome occupies (0 when nothing floats). */
export function measureFloatingClearance(boxes: FloatingBox[], viewportHeight: number): number {
  let occupied = 0;
  for (const { rect } of boxes) {
    occupied = Math.max(occupied, viewportHeight - rect.top);
  }
  return Math.max(0, Math.ceil(occupied));
}

/** Tags whose box IS content even without a direct text node. */
const CONTENT_TAGS = new Set(["IMG", "SVG", "VIDEO", "CANVAS", "INPUT", "TEXTAREA", "SELECT", "BUTTON", "IFRAME"]);

function hasOwnText(element: Element): boolean {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim()) return true;
  }
  return false;
}

/** Tolerance so a 1px anti-aliased overlap is never reported. */
const COVER_TOLERANCE_PX = 2;
/**
 * Content flush against floating chrome still reads as covered (the owner's
 * complaint was text touching the chat). Each floating box counts as this
 * much taller, upward. Half of the 1.5rem gap the shell's runway adds.
 */
export const FLOATING_REQUIRED_GAP_PX = 12;

export interface CoveredContent {
  content: Element;
  floating: Element;
  overlapPx: number;
}

/**
 * When `scroller` is scrolled to its end, the content deepest
 * inside the bottom band a floating element occupies (its height plus
 * FLOATING_REQUIRED_GAP_PX, across the scroller's width) — or null when every
 * piece scrolls clear of it.
 * Content inside the floating chrome itself is never counted.
 */
export function findContentUnderFloatingChrome(
  scroller: Element,
  boxes: FloatingBox[],
): CoveredContent | null {
  if (boxes.length === 0) return null;
  const view = scroller === document.scrollingElement
    ? { top: 0, bottom: window.innerHeight }
    : scroller.getBoundingClientRect();
  // Chrome that sits wholly below the scroller's visible edge (the assists
  // pill parked in a table's pager band) cannot cover that scroller's content.
  const zones = boxes.filter((b) => b.rect.top < view.bottom).map((b) => ({
    element: b.element,
    top: b.rect.top - FLOATING_REQUIRED_GAP_PX,
    bottom: b.rect.bottom,
    // The whole BAND, not just the chrome's own box: content that ends level
    // with the floating chat (beside it rather than under it) still reads as
    // crammed against it, and the shell's runway reserves the full band.
    left: Number.NEGATIVE_INFINITY,
    right: Number.POSITIVE_INFINITY,
  }));
  if (zones.length === 0) return null;
  const lowestTop = Math.min(...zones.map((z) => z.top));
  let worst: CoveredContent | null = null;
  const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node as Element;
    if (!CONTENT_TAGS.has(element.tagName.toUpperCase()) && !hasOwnText(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= lowestTop + COVER_TOLERANCE_PX) continue;
    if (rect.height === 0 || rect.width === 0) continue;
    if (rect.top >= view.bottom || rect.bottom <= view.top) continue;
    for (const zone of zones) {
      if (zone.element.contains(element) || element.contains(zone.element)) continue;
      const overlapX = Math.min(rect.right, zone.right) - Math.max(rect.left, zone.left);
      const overlapY = Math.min(rect.bottom, zone.bottom, view.bottom) - Math.max(rect.top, zone.top);
      if (overlapX > COVER_TOLERANCE_PX && overlapY > COVER_TOLERANCE_PX) {
        if (getComputedStyle(element).visibility === "hidden") continue;
        if (!worst || overlapY > worst.overlapPx) {
          worst = { content: element, floating: zone.element, overlapPx: Math.round(overlapY) };
        }
      }
    }
  }
  return worst;
}
