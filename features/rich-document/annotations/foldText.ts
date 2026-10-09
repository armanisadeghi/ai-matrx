// features/rich-document/annotations/foldText.ts
//
// HOW A LONG COMMENT OR THREAD FOLDS: the top and the bottom always show, the MIDDLE hides
// (Arman, 2026-10-08). A thread's top is the original comment and its bottom is the newest reply;
// a "Show more" that clipped the end hid exactly the part people came for. Pure — no React.

export interface TextFold {
  /** The opening, cut at a line or word boundary. */
  head: string;
  /** The ending, cut at a line or word boundary. */
  tail: string;
  /** Characters the fold hides (never zero: a fold that hides nothing is no fold). */
  hiddenChars: number;
}

/** A body folds past either size. */
export const FOLD_MIN_CHARS = 900;
export const FOLD_MIN_LINES = 14;
const HEAD_CHARS = 420;
const HEAD_LINES = 6;
const TAIL_CHARS = 260;
const TAIL_LINES = 3;
/** Folding to hide less than this is noise. */
const MIN_HIDDEN = 120;

function cutHead(text: string, max: number): string {
  if (text.length <= max) return text;
  let at = text.lastIndexOf("\n", max);
  if (at < max / 2) at = text.lastIndexOf(" ", max);
  if (at < max / 2) at = max;
  return text.slice(0, at).trimEnd();
}

function cutTail(text: string, max: number): string {
  if (text.length <= max) return text;
  const start = text.length - max;
  let at = text.indexOf("\n", start);
  if (at < 0 || at > start + max / 2) at = text.indexOf(" ", start);
  if (at < 0 || at > start + max / 2) at = start;
  return text.slice(at).trimStart();
}

/** The middle fold of a long body, or null when it is short enough to show whole. */
export function foldMiddle(body: string): TextFold | null {
  const lines = body.split("\n");
  if (body.length <= FOLD_MIN_CHARS && lines.length <= FOLD_MIN_LINES) return null;
  const head = cutHead(lines.slice(0, HEAD_LINES).join("\n"), HEAD_CHARS);
  const tail = cutTail(lines.slice(-TAIL_LINES).join("\n"), TAIL_CHARS);
  const hiddenChars = body.length - head.length - tail.length;
  if (hiddenChars < MIN_HIDDEN) return null;
  return { head, tail, hiddenChars };
}

/** The opening of a body to a character budget (the quoted comment in an answer's reply card). */
export function foldHead(body: string, max = 300): { head: string; more: boolean } {
  const head = cutHead(body, max);
  return { head, more: head.length < body.trimEnd().length };
}

/** A thread's replies with the MIDDLE hidden: from three replies on, only the newest shows. */
export function foldReplies<T>(replies: readonly T[], showAll: boolean): { hidden: number; shown: readonly T[] } {
  if (showAll || replies.length < 3) return { hidden: 0, shown: replies };
  return { hidden: replies.length - 1, shown: replies.slice(-1) };
}
