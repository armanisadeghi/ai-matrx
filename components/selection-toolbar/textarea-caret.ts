// components/selection-toolbar/textarea-caret.ts
//
// Where a <textarea>'s selection sits on screen. A textarea's text is not in
// the DOM, so the browser has no Range to measure. The mirror technique (the
// one textarea-caret libraries use): a hidden div copies the field's box and
// typography, holds the text before the selection, then a span with the
// selected text; the span's box IS the selection's box.

const COPIED = [
  "boxSizing", "width", "height", "overflowX", "overflowY",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderStyle",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust", "lineHeight", "fontFamily",
  "textAlign", "textTransform", "textIndent", "textDecoration", "letterSpacing", "wordSpacing", "tabSize",
] as const;

export interface CaretRect {
  left: number;
  top: number;
  bottom: number;
  width: number;
}

/** The viewport box of `el`'s selection (first line of it), clamped to the field. Null when unmeasurable. */
export function textareaSelectionRect(el: HTMLTextAreaElement): CaretRect | null {
  if (typeof window === "undefined" || el.selectionStart === null) return null;
  const style = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  const s = mirror.style;
  for (const prop of COPIED) s[prop] = style[prop];
  s.position = "absolute";
  s.visibility = "hidden";
  s.top = "0";
  s.left = "-9999px";
  s.whiteSpace = "pre-wrap";
  s.overflowWrap = "break-word";
  s.overflow = "hidden";
  const start = el.selectionStart;
  const end = el.selectionEnd ?? start;
  mirror.textContent = el.value.slice(0, start);
  const mark = document.createElement("span");
  // Only the first line of a selection: the toolbar sits above where it starts.
  const selected = el.value.slice(start, end);
  mark.textContent = selected.split("\n")[0] || ".";
  mirror.appendChild(mark);
  document.body.appendChild(mirror);
  try {
    const box = el.getBoundingClientRect();
    const border = parseFloat(style.borderTopWidth) || 0;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const lineHeight = mark.offsetHeight || parseFloat(style.lineHeight) || 20;
    const left = box.left + borderLeft + mark.offsetLeft - el.scrollLeft - borderLeft;
    const top = box.top + border + mark.offsetTop - el.scrollTop - border;
    const width = Math.max(1, mark.offsetWidth);
    // Scrolled out of the field: anchor at the field's top edge instead.
    const clampedTop = Math.min(Math.max(top, box.top), box.bottom - lineHeight);
    return { left: Math.min(Math.max(left, box.left), box.right - 1), top: clampedTop, bottom: clampedTop + lineHeight, width };
  } finally {
    mirror.remove();
  }
}
