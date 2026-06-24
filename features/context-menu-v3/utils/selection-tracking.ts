// features/context-menu-v3/utils/selection-tracking.ts
//
// Pure, hard-won selection capture + restore logic for the universal context
// menu. The two-path split (editable textarea/input via selectionStart/End vs
// non-editable DOM via the Range API), the capture-at-mousedown + lock, and the
// delayed restore on close are the result of months of fixing volatile-
// selection bugs (notably on macOS, where opening the menu drops the visual
// selection in textareas). Do NOT simplify without re-reading the v1 analysis.
//
// Lifted verbatim from `features/context-menu-v2/utils/selection-tracking.ts`
// (frozen, slated for deletion) so v3 is self-contained. This is the canonical
// home going forward.

export interface CapturedSelection {
  text: string;
  selection: Selection | null;
  range: Range | null;
}

export interface EditableSelectionRange {
  type: "editable";
  element: HTMLTextAreaElement | HTMLInputElement | null;
  start: number;
  end: number;
  range?: Range | null;
  containerElement?: HTMLElement | null;
}

export interface NonEditableSelectionRange {
  type: "non-editable";
  element: HTMLElement | null;
  start: number;
  end: number;
  range: Range | null;
  containerElement: HTMLElement | null;
}

export type SelectionRange = EditableSelectionRange | NonEditableSelectionRange;

export function captureTextareaSelection(
  target: HTMLTextAreaElement | HTMLInputElement,
): CapturedSelection {
  const start = target.selectionStart || 0;
  const end = target.selectionEnd || 0;
  const text = target.value.substring(start, end);
  return {
    text,
    selection: null,
    range: null,
  };
}

export function captureDomSelection(): CapturedSelection {
  const selection = window.getSelection();
  const text = selection?.toString() || "";
  let range: Range | null = null;
  if (selection && selection.rangeCount > 0) {
    try {
      range = selection.getRangeAt(0).cloneRange();
    } catch {
      range = null;
    }
  }
  return { text, selection, range };
}

export function getSelectionRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  try {
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
    return null;
  } catch {
    return null;
  }
}

export function mouseFallbackRect(x: number, y: number): DOMRect {
  return {
    left: x - 50,
    right: x + 50,
    top: y - 10,
    bottom: y + 10,
    width: 100,
    height: 20,
    x: x - 50,
    y: y - 10,
    toJSON: () => ({}),
  } as DOMRect;
}

export function restoreTextareaSelection(
  element: HTMLTextAreaElement | HTMLInputElement,
  start: number,
  end: number,
  delayMs = 150,
): void {
  setTimeout(() => {
    element.focus();
    element.setSelectionRange(start, end);
  }, delayMs);
}

export function restoreDomSelection(range: Range, delayMs = 50): void {
  setTimeout(() => {
    try {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch {
      // selection restoration is best-effort
    }
  }, delayMs);
}

/**
 * Best-effort plain-text extraction of a DOM subtree, used as the universal
 * `content` fallback so the menu is never inert: when the user right-clicks
 * read-only content WITHOUT a manual selection, the menu still has something
 * for Copy / AI actions to operate on. Returns "" when there is no element or
 * no text.
 */
export function extractElementText(
  element: HTMLElement | null | undefined,
): string {
  if (!element) return "";
  // innerText respects rendering (hidden nodes, line breaks) better than
  // textContent for user-visible copy semantics; fall back to textContent.
  const text = element.innerText ?? element.textContent ?? "";
  return text.trim();
}

/**
 * Replace `[start, end)` of an UNCONTROLLED textarea/input with `replacement`
 * and place the caret after it; returns the new value. The DOM mutation lives
 * here (element as a parameter) so it's outside any component's prop graph —
 * the React Compiler's immutability rule only permits mutation through a
 * non-prop binding (same reason `insertTextAtTextareaCursor` is a free
 * function). Callers that own the value via React state should call their
 * `onTextReplace` instead.
 */
export function spliceInputValue(
  element: HTMLTextAreaElement | HTMLInputElement,
  start: number,
  end: number,
  replacement: string,
): string {
  const newValue =
    element.value.substring(0, start) +
    replacement +
    element.value.substring(end);
  element.value = newValue;
  const caret = start + replacement.length;
  element.setSelectionRange(caret, caret);
  return newValue;
}
