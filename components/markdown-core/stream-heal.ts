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

import remend, { isWithinCodeBlock, type RemendHandler } from "remend";
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

const TRAILING_BRACKETED_TAIL = /(!?)\[([^\]\n]*)\](\[[^\]\n]*)?$/;

/**
 * The tail is a closed `![alt]` / `[text]` whose `(url)` or `[id]` has not
 * started or finished arriving. An image is held back (it is about to become
 * an <img>); a link mid-`[id` shows its text. A bare trailing `[text]` stays —
 * it may be literal brackets.
 */
const pendingBracketedTail: RemendHandler = {
  name: "matrx-pending-bracketed-tail",
  priority: 1,
  handle: (text) => {
    const match = TRAILING_BRACKETED_TAIL.exec(text);
    if (!match) return text;
    const [whole, bang, label, referencePart] = match;
    if (!bang && referencePart === undefined) return text;
    if (isWithinCodeBlock(text, match.index)) return text;
    if (isInsideInlineCode(text, match.index)) return text;
    return text.slice(0, text.length - whole.length) + (bang ? "" : label);
  },
};

const TRAILING_EMPTY_EMPHASIS = /(^|\s)[*_~]+$/;

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

const REMEND_OPTIONS = {
  linkMode: "text-only" as const,
  handlers: [
    pendingBracketedTail,
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
