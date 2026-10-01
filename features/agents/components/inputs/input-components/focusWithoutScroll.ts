/**
 * Ref callback: focus the element when it mounts, WITHOUT scrolling the page.
 *
 * The `autoFocus` attribute focuses with the browser's scroll-into-view, so an
 * "Other" editor restored with a saved answer pulled the page down to itself
 * on load (cold walk 23's focus class; guard:
 * `__tests__/focus-never-moves-the-page.test.tsx`). Module-level so its
 * identity is stable: React calls it on mount, never on every render.
 */
export function focusWithoutScroll(el: HTMLElement | null): void {
  el?.focus({ preventScroll: true });
}
