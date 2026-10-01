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
// and the floating frame): a window that opens takes focus, EXCEPT out of an
// editable field that sits inside an element carrying KEEP_FOCUS_ATTRIBUTE —
// an inline edit the page itself opened (the Rulebook title's rename on
// `?rename=1`). A panel she opens with Enter or a hotkey from any other field
// still takes focus: that is the panel she asked to type into.
//
// Why a mark and not `navigator.userActivation`: measured headless on
// localhost, a cold load of the deep link reported `isActive === true` when
// the panel opened, and a client navigation right after a click (Start → the
// new Rulebook) is inside the click's activation window too — the gesture
// cannot tell "she opened this panel" from "she clicked something earlier".
// A <select> is never a field she is typing in.

/** Put on an inline-edit container: a field inside it keeps focus when a window opens. */
export const KEEP_FOCUS_ATTRIBUTE = "data-keep-focus-on-open";

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
 * now? False only while focus is in an editable field outside it that sits in
 * a KEEP_FOCUS_ATTRIBUTE container.
 */
export function mayTakeFocusOnOpen(container: HTMLElement | null): boolean {
  const active = typeof document === "undefined" ? null : document.activeElement;
  if (!isEditableField(active)) return true;
  if (container != null && container.contains(active)) return true;
  return active.closest(`[${KEEP_FOCUS_ATTRIBUTE}]`) == null;
}
