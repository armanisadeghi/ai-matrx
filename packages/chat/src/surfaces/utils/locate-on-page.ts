/**
 * Highlight-on-page for surface values.
 *
 * Convention: a page tags the DOM element that renders a surface value with
 * `data-surface-value="<value_name>"` (multiple elements may share a name).
 * The Surface Context window calls `locateSurfaceValueOnPage(name)` to scroll
 * the first match into view and flash a ring on every match — connecting the
 * declared contract to the visible UI. Pure DOM, no state layer; the
 * attribute's presence is the truth (no manifest field needed). The highlight
 * itself is the shared `flashAttention` cue, not a local ring.
 */

import { flashAttention } from "@/lib/dom/flash-attention";

/* Chrome's smooth scroll is rAF-driven and finishes well inside this window for
   any realistic distance; the check below therefore never fires for a user. It
   exists because a rAF-starved page (a background/offscreen tab, a headless or
   automation browser reporting `document.hidden`) drops the animation on the
   floor, and Locate must land or it is worthless. */
const SMOOTH_SETTLE_MS = 600;

/** True when the element's box is meaningfully inside the viewport. */
function isOnScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const h = window.innerHeight || document.documentElement.clientHeight;
  const w = window.innerWidth || document.documentElement.clientWidth;
  return r.bottom > 0 && r.top < h && r.right > 0 && r.left < w;
}

/**
 * Scroll to and flash every element tagged with the value name.
 * Returns false when nothing on the page is tagged for it.
 */
export function locateSurfaceValueOnPage(valueName: string): boolean {
  if (typeof document === "undefined") return false;
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-surface-value="${CSS.escape(valueName)}"]`,
    ),
  );
  if (matches.length === 0) return false;

  const target = matches[0];
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    if (target.isConnected && !isOnScreen(target)) {
      target.scrollIntoView({ behavior: "auto", block: "center" });
    }
  }, SMOOTH_SETTLE_MS);

  // ONE attention cue platform-wide — `lib/dom/flash-attention.ts`. A ring
  // that looks different here than everywhere else would teach people two
  // things instead of one.
  for (const el of matches) flashAttention(el);
  return true;
}
