// components/matrx/resizable/focusOnOpen.ts
//
// 🚨 AN OPENING WINDOW NEVER TAKES FOCUS OUT OF A FIELD SHE IS TYPING IN
// (Masterwork cold walk 23, 2026-09-30).
//
// `/masterwork/<id>?interview=1&rename=1` opened the Rulebook title's inline
// rename AND the interview's docked panel on the same load. The rename field
// took focus first; ~60ms later the panel's focus-on-open moved focus into
// the panel, the rename field blurred, and EditableLabel commits-and-closes
// on blur — so the rename the duplicate-name notice sent her to was gone
// before she could type. Measured headless on localhost: focus() from the
// rename field at t=2856ms, then from MatrxDynamicPanelHost's
// focusPreferredTarget at 2921/2930/3043ms.
//
// The rule, shared by every window primitive in this folder (the docked host
// and the floating frame both focused unconditionally): an opening window may
// take focus from the page, a button, or its own shell — never from an
// editable field outside it. Where she is typing wins.

const EDITABLE_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/** Is `el` a field a person types into? */
export function isEditableField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLSelectElement) return !el.disabled;
  if (el instanceof HTMLInputElement) {
    return (
      !el.disabled &&
      !el.readOnly &&
      EDITABLE_INPUT_TYPES.has((el.getAttribute("type") ?? "").toLowerCase())
    );
  }
  return el.isContentEditable === true;
}

/**
 * May a window that is opening (`container`) move focus into itself right
 * now? False while the person is in an editable field outside it.
 */
export function mayTakeFocusOnOpen(container: HTMLElement | null): boolean {
  const active = typeof document === "undefined" ? null : document.activeElement;
  if (!isEditableField(active)) return true;
  return container != null && container.contains(active);
}
