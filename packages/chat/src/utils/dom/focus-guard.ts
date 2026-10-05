/**
 * FOCUS BELONGS TO THE PERSON — code never takes the caret from a field they are typing in.
 *
 * A component that focuses ITSELF without a person's action — on mount, when a
 * conversation finishes starting, when a tile wakes or an agent adds one, when
 * a reply or a dictation lands — goes through `focusUnlessTypingElsewhere`.
 * It focuses only when nothing editable outside the target holds the caret,
 * so the person's next keystroke still lands where they were typing.
 *
 * Observed 2026-10-03 (/board): a new note took the first words, the chat
 * beside the board finished starting a beat later, its composer autofocused,
 * and the rest of the sentence went into the chat draft.
 *
 * A focus that answers a person's own action (a click on "Rename", ⌘F, a
 * shortcut that opens a field) is not automatic: call `.focus()` directly.
 */

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** An element a person types into: a text input, a textarea, a select, or editable content. */
export function isEditableElement(el: Element | null | undefined): el is HTMLElement {
  if (!el || typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  if (el instanceof HTMLSelectElement) return !el.disabled;
  if (el.isContentEditable) return true;
  // jsdom has no `isContentEditable`; a real browser answers above.
  const editable = el.getAttribute("contenteditable");
  if (editable !== null && editable !== "false") return true;
  return el.getAttribute("role") === "textbox";
}

/**
 * The person holds the caret in an editable element that is not `target` and
 * not inside it — automatic focus must leave it there.
 */
export function personIsTypingElsewhere(target?: Element | null): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  if (target && (active === target || target.contains(active))) return false;
  return isEditableElement(active) && active.isConnected;
}

/**
 * Automatic focus (no person's action asked for it): focus `el` unless the
 * person is typing somewhere else. Never scrolls the page. Returns whether it
 * focused.
 */
export function focusUnlessTypingElsewhere(
  el: HTMLElement | null | undefined,
  options: FocusOptions = { preventScroll: true },
): boolean {
  if (!el || !el.isConnected) return false;
  if (personIsTypingElsewhere(el)) return false;
  el.focus(options);
  return true;
}
