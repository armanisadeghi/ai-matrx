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

  matches[0].scrollIntoView({ behavior: "smooth", block: "center" });
  for (const el of matches) {
    el.classList.add(...FLASH_CLASSES);
    window.setTimeout(() => {
      el.classList.remove(...FLASH_CLASSES);
    }, FLASH_MS);
  }
  return true;
}
