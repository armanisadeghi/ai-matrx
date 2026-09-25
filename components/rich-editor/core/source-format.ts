// components/rich-editor/core/source-format.ts
//
// Formatting verbs for the SOURCE view, as pure edits on the text: wrap or
// unwrap a selection in a marker (**, *, ~~, `), set a line prefix (heading,
// bullet, number, checklist, quote), make a link. Each returns the minimal
// change — the same shortcut table drives them as the visual view's verbs, so
// ⌘B means bold in both views and only the selected bytes move.

export interface SourceChange {
  from: number;
  to: number;
  insert: string;
}

export interface SourceEditResult {
  changes: SourceChange[];
  /** New selection, in the text AFTER the changes. */
  anchor: number;
  head: number;
}

/** Wrap the selection in `marker`, or unwrap it when it already is. */
export function toggleWrap(text: string, from: number, to: number, marker: string): SourceEditResult {
  const size = marker.length;
  const before = text.slice(Math.max(0, from - size), from);
  const after = text.slice(to, to + size);
  if (before === marker && after === marker) {
    return {
      changes: [
        { from: from - size, to: from, insert: "" },
        { from: to, to: to + size, insert: "" },
      ],
      anchor: from - size,
      head: to - size,
    };
  }
  const selected = text.slice(from, to);
  if (selected.length >= size * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    return {
      changes: [{ from, to, insert: selected.slice(size, selected.length - size) }],
      anchor: from,
      head: to - size * 2,
    };
  }
  return {
    changes: [{ from, to, insert: `${marker}${selected}${marker}` }],
    anchor: from + size,
    head: to + size,
  };
}

const LINE_PREFIX = /^( {0,3})(#{1,6}[ \t]+|[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d{1,9}[.)][ \t]+|>[ \t]?)?/;

/**
 * Give every line the selection touches `prefix` (replacing any heading /
 * list / quote prefix it has). `null` clears it. Numbered prefixes count up.
 */
export function setLinePrefix(text: string, from: number, to: number, prefix: string | null): SourceEditResult {
  const start = text.lastIndexOf("\n", from - 1) + 1;
  const endBreak = text.indexOf("\n", to);
  const end = endBreak === -1 ? text.length : endBreak;
  const lines = text.slice(start, end).split("\n");
  let number = 1;
  let delta = 0;
  const changes: SourceChange[] = [];
  let offset = start;
  let firstDelta = 0;
  lines.forEach((line, index) => {
    const match = LINE_PREFIX.exec(line);
    const existing = match?.[0] ?? "";
    const indent = match?.[1] ?? "";
    const next = prefix === null ? indent : `${indent}${prefix === "1. " ? `${number++}. ` : prefix}`;
    if (existing !== next) {
      changes.push({ from: offset, to: offset + existing.length, insert: next });
      delta += next.length - existing.length;
      if (index === 0) firstDelta = next.length - existing.length;
    }
    offset += line.length + 1;
  });
  return { changes, anchor: Math.max(start, from + firstDelta), head: to + delta };
}

/** `[selection](url)` — the cursor lands in the url when none is given. */
export function makeLink(text: string, from: number, to: number, url = ""): SourceEditResult {
  const label = text.slice(from, to) || "link";
  const insert = `[${label}](${url})`;
  const urlStart = from + label.length + 3;
  return { changes: [{ from, to, insert }], anchor: urlStart, head: urlStart + url.length };
}

/** Apply a result to a string (tests and non-CodeMirror hosts). */
export function applySourceEdit(text: string, result: SourceEditResult): string {
  let out = text;
  for (const change of [...result.changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, change.from) + change.insert + out.slice(change.to);
  }
  return out;
}

const CONTINUABLE = /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?(.*)$/;
const QUOTE = /^([ \t]*(?:>[ \t]?)+)(.*)$/;

/**
 * Enter at the end of a list item or quote line continues it (next bullet,
 * next number, an open checkbox, the quote prefix); Enter on an EMPTY item
 * ends the list. Returns null when Enter should just insert a newline.
 */
export function continueMarkupOnEnter(text: string, pos: number): SourceEditResult | null {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const lineEndBreak = text.indexOf("\n", pos);
  const lineEnd = lineEndBreak === -1 ? text.length : lineEndBreak;
  if (text.slice(pos, lineEnd).trim() !== "") return null;
  const line = text.slice(lineStart, lineEnd);
  const item = CONTINUABLE.exec(line);
  if (item) {
    const [, indent = "", bullet, number, delimiter, gap = " ", task, rest = ""] = item;
    if (!rest.trim()) {
      return { changes: [{ from: lineStart, to: lineEnd, insert: "" }], anchor: lineStart, head: lineStart };
    }
    const marker = bullet ?? `${Number(number) + 1}${delimiter}`;
    const insert = `\n${indent}${marker}${gap}${task ? "[ ] " : ""}`;
    return { changes: [{ from: pos, to: pos, insert }], anchor: pos + insert.length, head: pos + insert.length };
  }
  const quote = QUOTE.exec(line);
  if (quote && line.trimStart().startsWith(">")) {
    const [, prefix = "> ", rest = ""] = quote;
    if (!rest.trim()) {
      return { changes: [{ from: lineStart, to: lineEnd, insert: "" }], anchor: lineStart, head: lineStart };
    }
    const insert = `\n${prefix}`;
    return { changes: [{ from: pos, to: pos, insert }], anchor: pos + insert.length, head: pos + insert.length };
  }
  return null;
}
