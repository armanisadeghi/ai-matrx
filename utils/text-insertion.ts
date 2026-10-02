export function insertTextAtTextareaCursor(
  textarea: HTMLTextAreaElement,
  text: string,
  onValueChange?: (nextValue: string) => void,
): boolean {
  try {
    if (!textarea) {
      return false;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = textarea.value;
    const newValue =
      currentValue.substring(0, start) + text + currentValue.substring(end);

    // Controlled React fields must receive the complete next value through
    // their state owner. A DOM-only mutation is immediately overwritten by
    // the next render, which made context-menu inserts look successful while
    // leaving notes unchanged.
    if (typeof onValueChange === "function") {
      onValueChange(newValue);
      textarea.focus();
      requestAnimationFrame(() => {
        const newCursorPos = start + text.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      });
      return true;
    }

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(textarea, newValue);
    } else {
      textarea.value = newValue;
    }

    const newCursorPos = start + text.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);

    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));

    textarea.focus();

    return true;
  } catch {
    return false;
  }
}

export function insertTextByRef(
  textareaRef: HTMLTextAreaElement | null,
  text: string,
): boolean {
  if (!textareaRef) return false;
  return insertTextAtTextareaCursor(textareaRef, text);
}

/**
 * WHERE A BLOCK GOES IN PLAIN TEXT — never inside a word.
 *
 * A block (a reference fence, a pasted section) inserted at a caret that sits
 * inside a word split it: "of" became "o" + block + "f" (G5 review,
 * 2026-10-02). A block belongs on its own line, so it lands at the END of the
 * caret's line ("after") or the START of it ("before"). A non-empty selection
 * is replaced where it is — the person chose that range. Every plain-text
 * surface (textarea, the rich editor's source view, a contentEditable text
 * node) uses this one rule.
 */
export function blockBoundary(
  text: string,
  from: number,
  to: number,
  where: "before" | "after" = "after",
): number {
  if (where === "after") {
    const newline = text.indexOf("\n", to);
    return newline === -1 ? text.length : newline;
  }
  if (from <= 0) return 0;
  const newline = text.lastIndexOf("\n", from - 1);
  return newline === -1 ? 0 : newline + 1;
}
