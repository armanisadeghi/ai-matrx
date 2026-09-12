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
