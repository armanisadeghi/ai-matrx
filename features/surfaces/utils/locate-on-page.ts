/**
 * Highlight-on-page for surface values.
 *
 * Convention: a page tags the DOM element that renders a surface value with
 * `data-surface-value="<value_name>"` (multiple elements may share a name).
 * The Surface Context window calls `locateSurfaceValueOnPage(name)` to scroll
 * the first match into view and flash a ring on every match — connecting the
 * declared contract to the visible UI. Pure DOM, no state layer; the
 * attribute's presence is the truth (no manifest field needed).
 */

const FLASH_CLASSES = [
  "ring-2",
  "ring-primary",
  "ring-offset-2",
  "ring-offset-background",
  "rounded-md",
  "transition-shadow",
];
const FLASH_MS = 2200;

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

  for (const el of matches) {
    el.classList.add(...FLASH_CLASSES);
    window.setTimeout(() => {
      el.classList.remove(...FLASH_CLASSES);
    }, FLASH_MS);
  }
  return true;
}
