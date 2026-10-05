// components/rich-editor/core/caret-context.ts
//
// EDIT IN PLACE: the caret lands where the person double-clicked. The rendered
// view and the editor lay text out differently, so a click is carried over as
// TEXT, never as coordinates: the characters just before and just after the
// click in the rendered view (`CaretContext`), found again in the editor's own
// text. React-free and DOM-light so it is tested headless.

/** The text around a click in the rendered view. */
export interface CaretContext {
  /** Up to `CONTEXT_CHARS` rendered characters before the click. */
  before: string;
  /** Up to `CONTEXT_CHARS` rendered characters after the click. */
  after: string;
}

export const CONTEXT_CHARS = 40;

/** A text with whitespace runs collapsed to one space, and each kept char's index in the original. */
function collapse(text: string): { flat: string; at: number[] } {
  let flat = "";
  const at: number[] = [];
  let lastSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      lastSpace = true;
      flat += " ";
    } else {
      lastSpace = false;
      flat += ch;
    }
    at.push(i);
  }
  return { flat, at };
}

/**
 * Where the caret goes in `text` (an index 0..text.length), or null when the
 * context cannot be found. Tries the longest context first (before + after),
 * then shorter ones, then each side alone; the first occurrence wins.
 */
export function locateCaret(text: string, context: CaretContext): number | null {
  const { flat, at } = collapse(text);
  const before = collapse(context.before).flat;
  const after = collapse(context.after).flat;
  const toOriginal = (flatIndex: number) => (flatIndex >= at.length ? text.length : at[flatIndex]!);
  for (const len of [CONTEXT_CHARS, 24, 12, 6, 3]) {
    const b = before.slice(-len);
    const a = after.slice(0, len);
    if (!b && !a) continue;
    const idx = flat.indexOf(b + a);
    if (idx >= 0 && (b + a).length >= Math.min(3, before.length + after.length)) return toOriginal(idx + b.length);
  }
  for (const len of [CONTEXT_CHARS, 12, 4]) {
    const a = after.slice(0, len).trimStart();
    if (a.length >= 3) {
      const idx = flat.indexOf(a);
      if (idx >= 0) return toOriginal(idx);
    }
    const b = before.slice(-len).trimEnd();
    if (b.length >= 3) {
      const idx = flat.indexOf(b);
      if (idx >= 0) return toOriginal(idx + b.length);
    }
  }
  return null;
}

/**
 * The context of a point in a rendered element: the text before and after the
 * DOM position (`node`, `offset`) within `root`.
 */
export function caretContextAt(root: Node, node: Node, offset: number): CaretContext | null {
  if (!root.contains(node)) return null;
  const doc = root.ownerDocument;
  if (!doc) return null;
  const head = doc.createRange();
  head.selectNodeContents(root);
  head.setEnd(node, offset);
  const tail = doc.createRange();
  tail.selectNodeContents(root);
  tail.setStart(node, offset);
  const before = head.toString();
  const after = tail.toString();
  return { before: before.slice(-CONTEXT_CHARS), after: after.slice(0, CONTEXT_CHARS) };
}

/** The DOM position under a viewport point (both browser APIs). */
export function domPointAt(doc: Document, x: number, y: number): { node: Node; offset: number } | null {
  const withPosition = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = withPosition.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = withPosition.caretRangeFromPoint?.(x, y);
  if (range) return { node: range.startContainer, offset: range.startOffset };
  return null;
}
