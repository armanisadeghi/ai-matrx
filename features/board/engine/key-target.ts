/**
 * Board — who a key belongs to (pure, DOM-reading).
 *
 * The board answers single keys (Enter = full screen, Space = pan, letters =
 * tools, Delete = take off, arrows, +/-) ONLY when the key is addressed to the
 * board: the page, the board, or a tile's frame. A key inside a tile's content
 * — a text field, an editor (Monaco's EditContext host), an ARIA textbox, a
 * grid cell, any focusable control in the body — belongs to that content.
 */

/** A text-entry target: fields, contenteditable, EditContext hosts, ARIA textboxes. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { editContext?: unknown }) | null;
  if (!el || typeof el.getAttribute !== "function") return false;
  return (
    el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    el.editContext != null ||
    el.getAttribute("role") === "textbox"
  );
}

/** True when a key with this target is the board's to answer. */
export function boardOwnsKey(target: EventTarget | null): boolean {
  if (isTyping(target)) return false;
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return true;
  return !el.closest("[data-board-body]");
}
