// components/rich-editor/core/markdown-format.ts
//
// THE FORMATTING COMMAND LAYER for markdown TEXT (Arman, 2026-10-04: "The
// formatting buttons need to work even when we are just showing plain text").
// One set of commands — bold, italic, strike, inline code, link, heading 1/2/3,
// bulleted / numbered / task list, quote, code block — as pure edits on a
// string. The SOURCE view (CodeMirror) and every plain textarea host (notes
// Plain and Split, ProTextarea, prompt / template / skill editors) run these;
// the VISUAL view (Tiptap) runs the same command ids as marks and nodes
// (`visual/format-actions.ts`). One id list, three engines.
//
// Rules:
//   • Bytes are sacred. A command changes only the selected span (inline
//     commands) or the touched lines (line commands). Nothing else moves.
//   • Commands toggle. Bold on bold text removes the markup; a heading on a
//     heading of that level clears it; a list on a list ends it.
//   • Inline commands never wrap whitespace or a line's list / heading
//     prefix: `- **item**`, never `**- item**`. A selection over several
//     lines formats each line's text on its own (markdown emphasis cannot
//     cross a paragraph).

import type { SourceChange, SourceEditResult } from "./source-format";

export type FormatCommandId =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "link"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "quote"
  | "codeBlock";

export const FORMAT_COMMAND_IDS: readonly FormatCommandId[] = [
  "bold",
  "italic",
  "strike",
  "code",
  "link",
  "heading1",
  "heading2",
  "heading3",
  "bulletList",
  "orderedList",
  "taskList",
  "quote",
  "codeBlock",
];

export function isFormatCommandId(id: string): id is FormatCommandId {
  return (FORMAT_COMMAND_IDS as readonly string[]).includes(id);
}

// ── Inline marks ────────────────────────────────────────────────────────────

interface InlineSpec {
  /** The marker written when adding. */
  marker: string;
  /** The marker characters recognised when removing (`*` and `_` for emphasis). */
  chars: readonly string[];
  /** Run lengths (of one char) that mean "this mark is on". */
  runs: readonly number[];
  /** How many characters of the run belong to this mark. */
  size: number;
}

const INLINE: Record<"bold" | "italic" | "strike" | "code", InlineSpec> = {
  bold: { marker: "**", chars: ["*", "_"], runs: [2, 3], size: 2 },
  italic: { marker: "*", chars: ["*", "_"], runs: [1, 3], size: 1 },
  strike: { marker: "~~", chars: ["~"], runs: [2], size: 2 },
  code: { marker: "`", chars: ["`"], runs: [1], size: 1 },
};

const LINE_PREFIX = /^( {0,3})(#{1,6}[ \t]+|[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d{1,9}[.)][ \t]+|>[ \t]?)?/;

interface LineInfo {
  start: number;
  end: number;
  text: string;
}

/** Every line the range [from, to] touches. */
function linesTouched(text: string, from: number, to: number): LineInfo[] {
  const start = text.lastIndexOf("\n", from - 1) + 1;
  // A selection that ends exactly at the start of a line does not touch it.
  const effectiveTo = to > from && text[to - 1] === "\n" ? to - 1 : to;
  const endBreak = text.indexOf("\n", effectiveTo);
  const end = endBreak === -1 ? text.length : endBreak;
  const out: LineInfo[] = [];
  let offset = start;
  for (const line of text.slice(start, end).split("\n")) {
    out.push({ start: offset, end: offset + line.length, text: line });
    offset += line.length + 1;
  }
  return out;
}

function runLength(text: string, pos: number, dir: -1 | 1, ch: string): number {
  let n = 0;
  let i = dir === -1 ? pos - 1 : pos;
  while (i >= 0 && i < text.length && text[i] === ch) {
    n += 1;
    i += dir;
  }
  return n;
}

const WORD = /[\p{L}\p{N}_'-]/u;

/** The word around a caret (Cmd+B with no selection formats the word, as Docs does). */
function wordAt(text: string, pos: number): { from: number; to: number } | null {
  let from = pos;
  let to = pos;
  while (from > 0 && WORD.test(text[from - 1] ?? "")) from -= 1;
  while (to < text.length && WORD.test(text[to] ?? "")) to += 1;
  return to > from ? { from, to } : null;
}

interface Segment {
  from: number;
  to: number;
}

/** The text spans an inline command acts on: per line, prefix and edge whitespace excluded. */
function inlineSegments(text: string, from: number, to: number): Segment[] {
  const out: Segment[] = [];
  for (const line of linesTouched(text, from, to)) {
    const prefix = LINE_PREFIX.exec(line.text)?.[0].length ?? 0;
    let s = Math.max(from, line.start + (from <= line.start + prefix ? prefix : 0));
    let e = Math.min(to, line.end);
    while (s < e && /\s/.test(text[s] ?? "")) s += 1;
    while (e > s && /\s/.test(text[e - 1] ?? "")) e -= 1;
    if (e > s) out.push({ from: s, to: e });
  }
  return out;
}

/**
 * Is the span wrapped by `spec`? Markers may sit just outside it, just inside
 * it (selected with the text), or one of each. Returns the bare text's range.
 */
function wrapOf(text: string, seg: Segment, spec: InlineSpec): { innerFrom: number; innerTo: number } | null {
  for (const ch of spec.chars) {
    const lead = runLength(text, seg.from, 1, ch);
    const trail = runLength(text, seg.to, -1, ch);
    const innerFrom = seg.from + lead;
    const innerTo = seg.to - trail;
    if (innerTo <= innerFrom) continue;
    const before = runLength(text, seg.from, -1, ch) + lead;
    const after = trail + runLength(text, seg.to, 1, ch);
    if (spec.runs.includes(before) && spec.runs.includes(after)) return { innerFrom, innerTo };
  }
  return null;
}

/** Map an offset in the original text to the text after `changes` (sorted, non-overlapping). */
function mapPos(pos: number, changes: readonly SourceChange[], assoc: -1 | 1): number {
  let delta = 0;
  for (const c of changes) {
    if (c.to < pos || (c.to === pos && (c.from < pos || assoc === 1))) {
      if (c.from >= pos && assoc === -1) continue;
      delta += c.insert.length - (c.to - c.from);
    } else if (c.from < pos && pos < c.to) {
      // Inside a replaced span: clamp to the edge the selection leans to.
      return c.from + delta + (assoc === 1 ? c.insert.length : 0);
    }
  }
  return pos + delta;
}

function sorted(changes: SourceChange[]): SourceChange[] {
  return [...changes].sort((a, b) => a.from - b.from || a.to - b.to);
}

function inlineCommand(text: string, from: number, to: number, spec: InlineSpec): SourceEditResult {
  if (from === to) {
    const word = wordAt(text, from);
    if (!word) {
      // Nothing to wrap: an empty pair with the caret inside it.
      const insert = `${spec.marker}${spec.marker}`;
      const caret = from + spec.marker.length;
      return { changes: [{ from, to, insert }], anchor: caret, head: caret };
    }
    const result = inlineCommand(text, word.from, word.to, spec);
    // Keep the caret where it was, relative to the word.
    const shifted = mapPos(from, sorted(result.changes), 1);
    return { ...result, anchor: shifted, head: shifted };
  }
  const segments = inlineSegments(text, from, to);
  if (segments.length === 0) return { changes: [], anchor: from, head: to };
  const wraps = segments.map((seg) => wrapOf(text, seg, spec));
  const allOn = wraps.every((w) => w !== null);
  const changes: SourceChange[] = [];
  segments.forEach((seg, i) => {
    const w = wraps[i];
    if (allOn && w) {
      // Remove the mark's own markers, the ones touching the text.
      changes.push({ from: w.innerFrom - spec.size, to: w.innerFrom, insert: "" });
      changes.push({ from: w.innerTo, to: w.innerTo + spec.size, insert: "" });
    } else if (!w) {
      changes.push({ from: seg.from, to: seg.from, insert: spec.marker });
      changes.push({ from: seg.to, to: seg.to, insert: spec.marker });
    }
  });
  const ordered = sorted(changes);
  // The selection keeps covering the text (inside the markers it gained).
  const startAt = allOn ? wraps[0]!.innerFrom : segments[0]!.from;
  const endAt = allOn ? wraps[wraps.length - 1]!.innerTo : segments[segments.length - 1]!.to;
  const anchor = mapPos(startAt, ordered, 1);
  const head = mapPos(endAt, ordered, -1);
  return { changes: ordered, anchor, head: Math.max(anchor, head) };
}

// ── Links ───────────────────────────────────────────────────────────────────

const WHOLE_LINK = /^\[([^\]\n]*)\]\(([^)\n]*)\)$/;
const URLISH = /^(https?:\/\/|mailto:|www\.)\S+$/i;

function linkCommand(text: string, from: number, to: number): SourceEditResult {
  const selected = text.slice(from, to);
  const whole = WHOLE_LINK.exec(selected);
  if (whole) {
    const label = whole[1] ?? "";
    return { changes: [{ from, to, insert: label }], anchor: from, head: from + label.length };
  }
  // Selection is the label of a link: `[sel](url)` → `sel`.
  if (text[from - 1] === "[" && text.slice(to, to + 2) === "](") {
    const close = text.indexOf(")", to + 2);
    const nl = text.indexOf("\n", to);
    if (close !== -1 && (nl === -1 || close < nl)) {
      return {
        changes: [
          { from: from - 1, to: from, insert: "" },
          { from: to, to: close + 1, insert: "" },
        ],
        anchor: from - 1,
        head: to - 1,
      };
    }
  }
  if (URLISH.test(selected)) {
    // A selected address becomes the link's target; the caret lands in the label.
    const insert = `[](${selected})`;
    return { changes: [{ from, to, insert }], anchor: from + 1, head: from + 1 };
  }
  const label = selected || "link";
  const insert = `[${label}]()`;
  const urlStart = from + label.length + 3;
  return { changes: [{ from, to, insert }], anchor: urlStart, head: urlStart };
}

// ── Line commands ───────────────────────────────────────────────────────────

type LineKind = { kind: "heading"; level: number } | { kind: "bullet" } | { kind: "ordered" } | { kind: "task" };

const QUOTE_PREFIX = /^ {0,3}(?:>[ \t]?)+/;

/** Length of a line's quote markers (`> `, `>> `), 0 when it is not quoted. */
function quoteLength(line: string): number {
  return QUOTE_PREFIX.exec(line)?.[0].length ?? 0;
}

function lineKindOf(line: string): LineKind | null {
  const m = LINE_PREFIX.exec(line.slice(quoteLength(line)));
  const p = m?.[2];
  if (!p) return null;
  if (p.startsWith("#")) return { kind: "heading", level: p.trim().length };
  if (/^[-*+][ \t]+\[[ xX]\]/.test(p)) return { kind: "task" };
  if (/^[-*+]/.test(p)) return { kind: "bullet" };
  if (/^\d/.test(p)) return { kind: "ordered" };
  return null;
}

function sameKind(a: LineKind | null, b: LineKind): boolean {
  if (!a || a.kind !== b.kind) return false;
  return a.kind !== "heading" || (b.kind === "heading" && a.level === b.level);
}

function lineCommand(text: string, from: number, to: number, want: LineKind, prefixOf: (n: number) => string): SourceEditResult {
  const lines = linesTouched(text, from, to);
  const content = lines.filter((l) => l.text.trim() !== "");
  const targets = content.length ? content : lines.slice(0, 1);
  const allOn = content.length > 0 && content.every((l) => sameKind(lineKindOf(l.text), want));
  const changes: SourceChange[] = [];
  let n = 1;
  for (const line of targets) {
    // Quote markers are kept: a list inside a quote stays inside it.
    const base = quoteLength(line.text);
    const m = LINE_PREFIX.exec(line.text.slice(base));
    const existing = m?.[0] ?? "";
    const indent = m?.[1] ?? "";
    const next = allOn ? indent : `${indent}${prefixOf(n++)}`;
    if (existing !== next) changes.push({ from: line.start + base, to: line.start + base + existing.length, insert: next });
  }
  const ordered = sorted(changes);
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  const anchor = mapPos(Math.max(from, first.start), ordered, 1);
  const head = from === to ? anchor : mapPos(Math.min(to, last.end), ordered, 1);
  return { changes: ordered, anchor: Math.min(anchor, head), head: Math.max(anchor, head) };
}

function quoteCommand(text: string, from: number, to: number): SourceEditResult {
  const lines = linesTouched(text, from, to);
  const content = lines.filter((l) => l.text.trim() !== "");
  const allOn = content.length > 0 && content.every((l) => /^ {0,3}>/.test(l.text));
  const changes: SourceChange[] = [];
  for (const line of lines) {
    if (allOn) {
      const m = /^( {0,3})>[ \t]?/.exec(line.text);
      if (m) changes.push({ from: line.start + m[1]!.length, to: line.start + m[0].length, insert: "" });
    } else if (!/^ {0,3}>/.test(line.text)) {
      changes.push({ from: line.start, to: line.start, insert: line.text.trim() === "" ? ">" : "> " });
    }
  }
  const ordered = sorted(changes);
  const anchor = mapPos(from, ordered, 1);
  const head = from === to ? anchor : mapPos(to, ordered, 1);
  return { changes: ordered, anchor, head };
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

function codeBlockCommand(text: string, from: number, to: number): SourceEditResult {
  const lines = linesTouched(text, from, to);
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  // Selected lines ARE a fenced block (fences included) → remove the fences.
  if (lines.length >= 2 && FENCE.test(first.text) && FENCE.test(last.text)) {
    const changes: SourceChange[] = [
      { from: first.start, to: Math.min(first.end + 1, text.length), insert: "" },
      { from: last.start - 1, to: last.end, insert: "" },
    ];
    const ordered = sorted(changes);
    return { changes: ordered, anchor: first.start, head: mapPos(last.start - 1, ordered, -1) };
  }
  // The lines sit inside a fenced block → remove its fence lines.
  const prevEnd = first.start - 1;
  const prevStart = prevEnd > 0 ? text.lastIndexOf("\n", prevEnd - 1) + 1 : 0;
  const prevLine = prevEnd >= 0 ? text.slice(prevStart, prevEnd) : "";
  const nextStart = last.end + 1;
  const nextBreak = text.indexOf("\n", nextStart);
  const nextLine = nextStart <= text.length ? text.slice(nextStart, nextBreak === -1 ? text.length : nextBreak) : "";
  if (prevEnd >= 0 && FENCE.test(prevLine) && nextStart <= text.length && FENCE.test(nextLine) && nextLine.trim().replace(/[`~]/g, "") === "") {
    const nextEnd = nextBreak === -1 ? text.length : nextBreak;
    const changes: SourceChange[] = [
      { from: prevStart, to: first.start, insert: "" },
      { from: last.end, to: nextEnd, insert: "" },
    ];
    const ordered = sorted(changes);
    return { changes: ordered, anchor: mapPos(from, ordered, 1), head: mapPos(to, ordered, -1) };
  }
  const changes: SourceChange[] = [
    { from: first.start, to: first.start, insert: "```\n" },
    { from: last.end, to: last.end, insert: "\n```" },
  ];
  const ordered = sorted(changes);
  const anchor = mapPos(from, ordered, 1);
  return { changes: ordered, anchor, head: from === to ? anchor : mapPos(to, ordered, -1) };
}

// ── The command entry points ────────────────────────────────────────────────

/** Run one formatting command on markdown text. Returns the minimal change. */
export function formatMarkdown(text: string, from: number, to: number, command: FormatCommandId): SourceEditResult {
  const a = Math.max(0, Math.min(from, to, text.length));
  const b = Math.min(text.length, Math.max(from, to));
  switch (command) {
    case "bold":
    case "italic":
    case "strike":
    case "code":
      return inlineCommand(text, a, b, INLINE[command]);
    case "link":
      return linkCommand(text, a, b);
    case "heading1":
    case "heading2":
    case "heading3": {
      const level = Number(command.slice(-1));
      return lineCommand(text, a, b, { kind: "heading", level }, () => `${"#".repeat(level)} `);
    }
    case "bulletList":
      return lineCommand(text, a, b, { kind: "bullet" }, () => "- ");
    case "orderedList":
      return lineCommand(text, a, b, { kind: "ordered" }, (n) => `${n}. `);
    case "taskList":
      return lineCommand(text, a, b, { kind: "task" }, () => "- [ ] ");
    case "quote":
      return quoteCommand(text, a, b);
    case "codeBlock":
      return codeBlockCommand(text, a, b);
  }
}

/** Is the command already on for this selection (the toolbar's pressed state)? */
export function isFormatActive(text: string, from: number, to: number, command: FormatCommandId): boolean {
  const a = Math.max(0, Math.min(from, to, text.length));
  const b = Math.min(text.length, Math.max(from, to));
  switch (command) {
    case "bold":
    case "italic":
    case "strike":
    case "code": {
      const range = a === b ? wordAt(text, a) : { from: a, to: b };
      if (!range) return false;
      const segs = inlineSegments(text, range.from, range.to);
      return segs.length > 0 && segs.every((s) => wrapOf(text, s, INLINE[command]) !== null);
    }
    case "link":
      return WHOLE_LINK.test(text.slice(a, b)) || (text[a - 1] === "[" && text.slice(b, b + 2) === "](");
    case "quote": {
      const content = linesTouched(text, a, b).filter((l) => l.text.trim() !== "");
      return content.length > 0 && content.every((l) => /^ {0,3}>/.test(l.text));
    }
    case "codeBlock":
      return false;
    default: {
      const want: LineKind =
        command === "bulletList"
          ? { kind: "bullet" }
          : command === "orderedList"
            ? { kind: "ordered" }
            : command === "taskList"
              ? { kind: "task" }
              : { kind: "heading", level: Number(command.slice(-1)) };
      const content = linesTouched(text, a, b).filter((l) => l.text.trim() !== "");
      return content.length > 0 && content.every((l) => sameKind(lineKindOf(l.text), want));
    }
  }
}

/**
 * The keyboard chords for the commands (ProseMirror key names; "Mod" = ⌘ on
 * Apple, Ctrl elsewhere). The rich editor's shortcut table carries the same
 * keys; this map is what a plain textarea host binds.
 */
export const FORMAT_COMMAND_KEYS: Readonly<Record<FormatCommandId, readonly string[]>> = {
  bold: ["Mod-b"],
  italic: ["Mod-i"],
  strike: ["Mod-Shift-x", "Mod-Shift-s"],
  code: ["Mod-e"],
  link: ["Mod-k"],
  heading1: ["Mod-Alt-1"],
  heading2: ["Mod-Alt-2"],
  heading3: ["Mod-Alt-3"],
  orderedList: ["Mod-Shift-7"],
  bulletList: ["Mod-Shift-8"],
  taskList: ["Mod-Shift-9"],
  quote: ["Mod-Shift-."],
  codeBlock: ["Mod-Alt-c"],
};

/** ProseMirror-style key name for a keyboard event ("Mod-Shift-x"). */
export function keyNameOf(event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, apple: boolean): string | null {
  const mod = apple ? event.metaKey : event.ctrlKey;
  if (!mod) return null;
  // Shift+digit / Alt+letter change `key` on many layouts — read the physical key.
  let base: string | null = null;
  if (/^Digit\d$/.test(event.code)) base = event.code.slice(5);
  else if (/^Key[A-Z]$/.test(event.code)) base = event.code.slice(3).toLowerCase();
  else if (event.code === "Period") base = ".";
  else if (event.key.length === 1) base = event.key.toLowerCase();
  if (!base) return null;
  return ["Mod", event.altKey ? "Alt" : null, event.shiftKey ? "Shift" : null, base].filter(Boolean).join("-");
}

/** The command a chord runs, or null. */
export function formatCommandForKey(keyName: string | null): FormatCommandId | null {
  if (!keyName) return null;
  for (const id of FORMAT_COMMAND_IDS) {
    if (FORMAT_COMMAND_KEYS[id].includes(keyName)) return id;
  }
  return null;
}
