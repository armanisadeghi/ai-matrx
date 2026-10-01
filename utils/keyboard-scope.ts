/**
 * utils/keyboard-scope.ts — who a keyboard shortcut belongs to.
 *
 * A surface (a note editor, a chat composer, a file browser, a code editor)
 * can be mounted many times at once: a /board holds 10–15 full pages as
 * tiles, side panels and windows hold more. A shortcut listener a surface
 * puts on `document` / `window` runs once PER MOUNT, so an unscoped ⌘Z undid
 * every mounted note at once and stole ⌘Z from the board.
 *
 * The rule: a surface answers a key only when the key was pressed INSIDE it
 * (the focused element — the key event's target — is within its root).
 * A page-level surface may also answer a key pressed with nothing focused
 * (target = body), but only when it is not one of several mounted surfaces —
 * inside a board tile or a window panel, an unfocused key is the host's.
 */

/**
 * Marks a surface's shortcut root, so a part inside it (a preview pane, a
 * toolbar) can answer keys for the whole surface: `keyScopeRoot(el)`.
 */
export const KEY_SCOPE_ATTR = "data-key-scope";

/** The nearest marked surface root around `el` (or `el` itself). */
export function keyScopeRoot(el: Element | null | undefined): Element | null {
  if (!el) return null;
  return el.closest(`[${KEY_SCOPE_ATTR}]`) ?? el;
}

/** Hosts that mount several surfaces side by side. */
const MULTI_SURFACE_HOST = "[data-spatial-body], [data-window-panel]";

/** True when the key event's target is inside `root`. */
export function keyEventInside(
  event: Event,
  root: Element | null | undefined,
): boolean {
  const target = event.target;
  if (!root || !target || typeof (target as Node).nodeType !== "number") {
    return false;
  }
  return root.contains(target as Node);
}

/**
 * True when `root` owns the key: pressed inside it, or — for a page-level
 * surface that is not embedded in a multi-surface host — pressed with
 * nothing focused.
 */
export function surfaceOwnsKey(
  event: Event,
  root: Element | null | undefined,
): boolean {
  if (!root) return false;
  if (keyEventInside(event, root)) return true;
  const target = event.target as Node | null;
  const doc = root.ownerDocument;
  const unfocused =
    target == null ||
    target === doc ||
    target === doc.body ||
    target === doc.documentElement;
  return unfocused && root.closest(MULTI_SURFACE_HOST) == null;
}
