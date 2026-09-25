// Streaming healer for the ONE markdown core.
//
// A streamed answer arrives as prefixes of the final text. Parsed as-is, a
// prefix shows markdown syntax that is only half there: `**bold` as raw
// asterisks, `[Docs](https://github.com/mark` as raw brackets, `![Minion](htt`
// as raw text — and a trailing reference definition `[id]: https://octo` IS a
// complete definition to CommonMark, so every `![alt][id]` above it turns into
// an <img> that fetches the half-arrived URL (404 / DNS errors in the console).
//
// `healStreamingMarkdown` closes what is open and drops what cannot render
// yet, using Vercel's `remend` (the healer inside Streamdown) plus one handler
// of ours for reference definitions. It runs ONLY while a stream is active —
// MarkdownCore applies it when `streaming` is true — so finished text renders
// exactly as before.
//
// Pending shapes, by construct:
//   - unclosed **bold**, *italic*, `code`, ~~strike~~, $$math$$ → closed
//   - `[text](partial-url` → plain `text` (no link until the URL is complete)
//   - `![alt](partial-url` → removed until complete (never fetched)
//   - trailing `[id]: partial-url` definition line → held back until its line ends
//   - `![alt][id]` / `[text][id]` before `[id]:` arrives → held back / plain text

import remend, {
  isWithinCodeBlock,
  isWithinMathBlock,
  type RemendHandler,
} from "remend";
import { looksLikeOpenInlineMath, singleDollarMathEnd } from "@ai-matrx/content-ir/source";
import { SYNTAX_STREAM_HANDLERS } from "./syntax/stream-heal-syntax";

const TRAILING_REFERENCE_DEFINITION = /(^|\n) {0,3}\[[^\]\n]+\]:[^\n]*$/;

/**
 * Hold back a reference definition whose line has not finished arriving —
 * its URL (or title) may still be growing, and a definition line is invisible
 * in the rendered output anyway, so removing it costs nothing visible.
 */
const pendingReferenceDefinition: RemendHandler = {
  name: "matrx-pending-reference-definition",
  priority: 5,
  handle: (text) => {
    const match = TRAILING_REFERENCE_DEFINITION.exec(text);
    if (!match) return text;
    const lineStart = match.index + match[1].length;
    // Inside an open code fence the line is code, not a definition.
    if (isWithinCodeBlock(text, lineStart)) return text;
    return text.slice(0, lineStart);
  },
};

const REFERENCE_USE = /(!?)\[([^\]\n]*)\]\[([^\]\n]+)\]/g;
const DEFINITION_LABEL = /^ {0,3}\[([^\]\n]+)\]:/gm;

/**
 * A reference-style image or link (`![alt][id]`, `[text][id]`) whose
 * definition has not arrived yet cannot resolve — CommonMark would print it
 * raw. While streaming: an unresolved image is held back, an unresolved link
 * shows its text. Once `[id]: …` arrives (a whole line), it renders for real.
 */
const pendingReferenceUses: RemendHandler = {
  name: "matrx-pending-reference-uses",
  priority: 6,
  handle: (text) => {
    const defined = new Set<string>();
    for (const m of text.matchAll(DEFINITION_LABEL)) {
      if (!isWithinCodeBlock(text, m.index)) defined.add(normalizeLabel(m[1]));
    }
    return text.replace(
      REFERENCE_USE,
      (whole, bang: string, label: string, id: string, offset: number) => {
        if (defined.has(normalizeLabel(id))) return whole;
        if (
          isWithinCodeBlock(text, offset) ||
          isInsideInlineCode(text, offset)
        ) {
          return whole;
        }
        return bang ? "" : label;
      },
    );
  },
};

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/** True when an odd number of backticks precede `offset` on its line. */
function isInsideInlineCode(text: string, offset: number): boolean {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const before = text.slice(lineStart, offset);
  return (before.match(/`/g)?.length ?? 0) % 2 === 1;
}

const TRAILING_BRACKETED_TAIL = /(?<!\])(!?)\[([^\]\n]*)\](\[[^\]\n]*)?$/;

/**
 * The tail is a closed `![alt]` / `[text]` whose `(url)` or `[id]` has not
 * started or finished arriving. An image is held back (it is about to become
 * an <img>); a link shows its text. A bare trailing `[text]` shows its text
 * too: the next character decides (a `(` makes it a link, anything else
 * brings the literal brackets back one chunk later) — a raw `[Route 39]` that
 * becomes a link is the worse flash (verify-RC-B7 r2, streaming table cells).
 */
const pendingBracketedTail: RemendHandler = {
  name: "matrx-pending-bracketed-tail",
  priority: 1,
  handle: (text) => {
    const match = TRAILING_BRACKETED_TAIL.exec(text);
    if (!match) return text;
    const [whole, bang, label, referencePart] = match;
    if (isWithinCodeBlock(text, match.index)) return text;
    if (isInsideInlineCode(text, match.index)) return text;
    return text.slice(0, text.length - whole.length) + (bang ? "" : label);
  },
};

const TRAILING_EMPTY_EMPHASIS = /(^|\s)[*_~`]+$/;

/**
 * A trailing run of emphasis markers with nothing after it yet (`Our **`)
 * cannot be closed into anything visible — drop it until its text arrives.
 */
const pendingEmptyEmphasis: RemendHandler = {
  name: "matrx-pending-empty-emphasis",
  priority: 200,
  handle: (text) => {
    const match = TRAILING_EMPTY_EMPHASIS.exec(text);
    if (!match) return text;
    if (isWithinCodeBlock(text, match.index)) return text;
    return text.slice(0, match.index + match[1].length);
  },
};

/**
 * An unclosed single-`$` formula on the last line (`For $N = 120{`,
 * `$\mathbb`) is held back from its `$` until it closes — it would print as
 * raw TeX. A CLOSED span is judged by THE core rule (`singleDollarMathEnd`);
 * an UNCLOSED tail by `looksLikeOpenInlineMath` — both from
 * @ai-matrx/content-ir/source — which needs a math signal, so currency
 * (`$35 per stop`) keeps showing while it streams.
 * A bare trailing `$` is held for the one chunk until its next character says.
 */
const pendingInlineMath: RemendHandler = {
  name: "matrx-pending-inline-math",
  priority: 2,
  handle: (text) => {
    const lineStart = text.lastIndexOf("\n") + 1;
    let i = lineStart;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "`") {
        // Skip a closed inline code span; an open one is literal to the end.
        const close = text.indexOf("`", i + 1);
        if (close === -1) return text;
        i = close + 1;
        continue;
      }
      if (ch !== "$") {
        i += 1;
        continue;
      }
      if (text[i + 1] === "$") {
        // Display math — remend closes `$$`.
        const close = text.indexOf("$$", i + 2);
        if (close === -1) return text;
        i = close + 2;
        continue;
      }
      const end = singleDollarMathEnd(text, i);
      if (end !== -1) {
        i = end;
        continue;
      }
      const partial = text.slice(i + 1);
      const opensMath =
        partial === "" ||
        (!/^\s/.test(partial) && looksLikeOpenInlineMath(partial.trimEnd()));
      if (
        opensMath &&
        !isWithinCodeBlock(text, i) &&
        !isWithinMathBlock(text, i)
      ) {
        return text.slice(0, i);
      }
      i += 1;
    }
    return text;
  },
};

const TABLE_ROW = /^\s*\|/;
const DELIMITER_CELL = /^\s*:?-+:?\s*$/;

function tableCells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
}

/**
 * A table whose header has arrived but whose delimiter row has not (or is
 * still growing: `|---`, fewer cells than the header) is not a table yet —
 * parsed as-is it prints raw pipes. Hold the table back until the delimiter
 * row is whole; hold back a body row whose closing `|` has not arrived.
 */
const pendingTable: RemendHandler = {
  name: "matrx-pending-table",
  priority: 3,
  handle: (text) => {
    const lines = text.split("\n");
    let start = lines.length;
    while (start > 0 && TABLE_ROW.test(lines[start - 1])) start -= 1;
    if (start === lines.length) return text;
    const offset = lines.slice(0, start).join("\n").length + (start > 0 ? 1 : 0);
    if (isWithinCodeBlock(text, offset)) return text;
    const rows = lines.slice(start);
    const headerCells = tableCells(rows[0]).length;
    const delimiter = rows[1];
    const delimiterWhole =
      delimiter !== undefined &&
      tableCells(delimiter).every((cell) => DELIMITER_CELL.test(cell)) &&
      tableCells(delimiter).length === headerCells &&
      (rows.length > 2 || delimiter.trimEnd().endsWith("|"));
    if (!delimiterWhole) return text.slice(0, offset).replace(/\n$/, "\n");
    const last = rows[rows.length - 1];
    if (rows.length > 2 && !last.trimEnd().endsWith("|")) {
      return lines.slice(0, lines.length - 1).join("\n");
    }
    return text;
  },
};

const REMEND_OPTIONS = {
  linkMode: "text-only" as const,
  handlers: [
    pendingBracketedTail,
    pendingInlineMath,
    pendingTable,
    pendingReferenceDefinition,
    pendingReferenceUses,
    pendingEmptyEmphasis,
    // Extended syntax (front matter, directives, callouts, wikilinks, …).
    ...SYNTAX_STREAM_HANDLERS,
  ],
};

/** Heal a streaming markdown prefix so it renders gracefully. Streaming only. */
export function healStreamingMarkdown(source: string): string {
  if (!source) return source;
  return remend(source, REMEND_OPTIONS);
}
