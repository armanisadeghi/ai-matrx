// ─────────────────────────────────────────────────────────────────────────
// THE PROSE PREPARATION PASS — shared by every rich-content level.
//
// Moved verbatim out of BasicMarkdownContent (2026-09-23, RC-B2) so the
// `inline` level (card faces, titles, cells) and the `standard` / `full`
// levels prepare prose IDENTICALLY — one source of truth for how model prose
// is massaged before the ONE core (MarkdownCore, preset "chat") parses it.
// Never fork this for a new surface; add a rule here and every level gets it.
// ─────────────────────────────────────────────────────────────────────────

import { ALLOWED_RAW_HTML_TAGS } from "@/components/mardown-display/chat-markdown/rehypeSafeRawHtml";
import { splitFrontmatter } from "@/components/markdown-core/syntax/frontmatter";
import { fenceLineKinds } from "@ai-matrx/content-ir/source";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { findTableEnd, tableStartsAt } from "@/components/mardown-display/markdown-classification/processors/utils/gfm-table-lines";

/** Private-use sentinel for a standalone `===` line. The `p` renderer swaps a
 *  paragraph whose only child is this token for a thick blue rule. */
export const THICK_HR_SENTINEL = "\uE000THICK_HR\uE000";

/**
 * Turn standalone `===` lines into their own sentinel paragraphs, leaving
 * fenced code untouched so a sample of `===` stays `===`.
 *
 * A blank line is forced on both sides. The one before stops CommonMark from
 * reading the previous line as a setext heading. The one after is required
 * because remark-breaks turns a single newline into a `<br>` inside the same
 * paragraph, and the rule only replaces a paragraph whose only child is the
 * sentinel. Without that break the token is painted as text.
 */
export function isolateThickHorizontalRules(source: string): string {
  const lines = source.split("\n");
  // Fenced code stays untouched — THE one code-range rule.
  const kinds = fenceLineKinds(source);
  const out = lines.map((line, i) =>
    kinds[i] === "prose" && /^[ \t]*={3,}[ \t]*$/.test(line) ? THICK_HR_SENTINEL : line,
  );
  return out
    .join("\n")
    .replace(
      new RegExp(`([^\\n])\\n+(${THICK_HR_SENTINEL})`, "g"),
      "$1\n\n$2",
    )
    .replace(
      new RegExp(`(${THICK_HR_SENTINEL})\\n+([^\\n])`, "g"),
      "$1\n\n$2",
    );
}

// Detect text direction utility.
// RTL characters: Hebrew, Arabic (+ Supplement, Extended-A, Presentation
// Forms A/B), the Right-to-Left Mark and Override. One char-code scan, and
// none at all when the text has no RTL character — it ran nine regex tests per
// character before, which on a 1 MB document was 206 ms of every paste.
const RTL_CHAR = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u200F\u202E]/;

function isRtlCode(c: number): boolean {
  return (
    (c >= 0x0590 && c <= 0x06ff) ||
    (c >= 0x0750 && c <= 0x077f) ||
    (c >= 0x08a0 && c <= 0x08ff) ||
    (c >= 0xfb50 && c <= 0xfdff) ||
    (c >= 0xfe70 && c <= 0xfeff) ||
    c === 0x200f ||
    c === 0x202e
  );
}

export const detectTextDirection = (text: string): "rtl" | "ltr" => {
  // No RTL character at all: left-to-right, without counting.
  if (!RTL_CHAR.test(text)) return "ltr";

  let rtlCount = 0;
  let ltrCount = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (isRtlCode(c)) rtlCount++;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) ltrCount++;
  }

  // If RTL characters are more than 10% of alphabetic characters, consider it RTL
  // Lowered from 30% to 10% to catch mixed content better
  const totalAlphabetic = rtlCount + ltrCount;
  if (totalAlphabetic === 0) return "ltr";
  return rtlCount / totalAlphabetic > 0.1 ? "rtl" : "ltr";
};

// Get direction classes based on text direction
export const getDirectionClasses = (direction: "rtl" | "ltr") => {
  return direction === "rtl" ? "text-right rtl" : "text-left ltr";
};

// Get font size based on text direction
export const getDirectionFontSize = (direction: "rtl" | "ltr") => {
  return direction === "rtl"
    ? "text-base" // Bigger for RTL (Arabic/Persian)
    : "text-sm"; // Smaller for LTR (English)
};

const FENCE_TOKEN = /\uE001F(\d+)\uE001/g;

/**
 * Swap every fenced code region for a one-line private-use token, and give
 * back a function that puts the original bytes back. Null when there is no
 * fence (the common case costs one scan). An unclosed fence (a stream still
 * arriving) is protected to the end.
 */
export function protectFencedCode(source: string): { text: string; restore: (s: string) => string } | null {
  if (!source.includes("```") && !source.includes("~~~")) return null;
  const lines = source.split("\n");
  // THE one code-range rule; an unclosed fence (a stream still arriving) runs to the end.
  const kinds = fenceLineKinds(source);
  const out: string[] = [];
  const fences: string[] = [];
  for (let i = 0; i < lines.length; ) {
    if (kinds[i] !== "open") {
      out.push(lines[i] as string);
      i += 1;
      continue;
    }
    const region = [lines[i] as string];
    i += 1;
    while (i < lines.length && (kinds[i] === "body" || kinds[i] === "close")) {
      const closes = kinds[i] === "close";
      region.push(lines[i] as string);
      i += 1;
      if (closes) break;
    }
    // The token keeps the opener's indentation, so a fence inside a list item
    // still reads as that item's continuation until it is restored.
    const indent = /^[ \t]*/.exec(region[0] as string)?.[0] ?? "";
    region[0] = (region[0] as string).slice(indent.length);
    out.push(`${indent}\uE001F${fences.length}\uE001`);
    fences.push(region.join("\n"));
  }
  if (fences.length === 0) return null;
  return {
    text: out.join("\n"),
    restore: (s: string) => s.replace(FENCE_TOKEN, (_m, n: string) => fences[Number(n)] ?? ""),
  };
}

const LIST_ITEM_LINE = /^[ \t]*(?:[*+-]|\d+[.)])[ \t]/;
const INDENT_RUN = /^( +)(?! |[*+-][ \t]|\d+[.)][ \t])/;

/**
 * Leading spaces become nbsp so a model's hand-indented text keeps its shape
 * — EXCEPT where the indentation is markdown structure: a list marker line,
 * and any indented line that continues a list item (a quote, a callout, a
 * `:::` directive, a second paragraph under `- item`). Flattening those to
 * nbsp printed `> [!caution]` and `:::` as literal text inside list items
 * (verify-RC-B8 failure 1). A list context ends at the first non-indented,
 * non-blank line that is not itself a list item.
 */
export function preserveIndentation(source: string): string {
  let inList = false;
  let changed = false;
  // A table's rows keep their indentation: it is markdown structure (a table
  // indented under a list item), and nbsp there made GFM read no table
  // (verify-RC-B4 round 9; THE table rule, gfm-table-lines).
  const raw = source.split("\n");
  const tableLine = new Set<number>();
  if (source.includes("|")) {
    for (let i = 0; i + 1 < raw.length; i += 1) {
      if (!tableStartsAt(raw, i)) continue;
      const end = findTableEnd(raw, i);
      for (let k = i; k < end; k += 1) tableLine.add(k);
      i = end - 1;
    }
  }
  const lines = raw.map((line, index) => {
    if (tableLine.has(index)) return line;
    if (LIST_ITEM_LINE.test(line)) {
      inList = true;
      return line;
    }
    if (!line.trim()) return line;
    if (!/^[ \t]/.test(line)) {
      inList = false;
      return line;
    }
    if (inList) return line;
    const m = INDENT_RUN.exec(line);
    if (!m) return line;
    changed = true;
    return "\u00A0\u00A0".repeat((m[1] as string).length) + line.slice((m[1] as string).length);
  });
  return changed ? lines.join("\n") : source;
}

/**
 * The INLINE part of prose preparation — what applies to text inside one line
 * (asides, tag escaping); block-level massaging (bullets, indentation, setext,
 * list spacing) is never part of it.
 */
function prepareInlineProse(rawContent: string): string {
  let processed = rawContent;
  // A reasoning aside INSIDE a sentence (`The planner writes a <thinking>
  // short note </thinking> and answers.`) is part of the sentence: the source
  // tokenizer reads it as an inline island and the splitters leave it in its
  // text block. Show its words as an italic aside — never the raw tags (the
  // escape below would print them) and never dropped (RC-B3r R2). Code spans
  // pass through untouched; a region on its own lines is the splitter's
  // "Thought process" block and never reaches this pass.
  processed = processed.replace(
    /(`+)([\s\S]*?)\1|<(thinking|think|reasoning)>([^\n<>]*?)<\/\3>/g,
    (match, backticks, _code, _tag, aside: string | undefined) =>
      backticks !== undefined ? match : aside?.trim() ? `<i>${aside.trim()}</i>` : "",
  );

  // Pre-escape XML/HTML-style angle-bracket tokens.
  //
  // Without this, CommonMark treats `<tag>` at the start of a line as the
  // start of an HTML block (spec types 6 and 7). The block extends until the
  // next blank line, and the parser emits the entire region as a single text
  // node with embedded raw newlines — which collapse visually because they
  // never reach `remark-breaks`. The result: multi-line bare XML like
  //   <tools>
  //     <tool name="db_insert">...</tool>
  //     <tool name="db_query">...</tool>
  //   </tools>
  // renders as one wrapped paragraph instead of preserving its structure.
  //
  // Escaping `<` and `>` to entities prevents HTML-block detection, so the
  // content stays as ordinary paragraph text. `remark-breaks` then turns each
  // single newline into a <br>, preserving the visual structure. CommonMark
  // decodes `&lt;` and `&gt;` back to `<` and `>` in text, so inline
  // references like <Admin> or <Resource> still render as the literal
  // characters on screen.
  // Escape XML/HTML-style angle-bracket tokens, but SKIP content inside
  // backtick code spans — HTML entities are not decoded inside code spans,
  // so escaping there causes literal "&lt;" to appear on screen.
  //
  // EXCEPTION: a curated allow-list of real HTML tags (`<img>`, `<table>` and
  // friends — see ALLOWED_RAW_HTML_TAGS) is left un-escaped so it survives as
  // a raw-HTML node that `rehypeSafeRawHtml` parses + sanitizes into real
  // elements. Every other tag (`<tools>`, `<Admin>`, `<Resource>`…) is still
  // escaped to literal text, preserving the bare-XML behavior below.
  processed = processed.replace(
    /(`+)([\s\S]*?)\1|<(\/?[\w][\w-]*)([^>]*?)>/g,
    (match, backticks, _codeContent, tagName, tagAttrs) => {
      if (backticks !== undefined) return match; // preserve code spans verbatim
      const bareTag = String(tagName).replace(/^\//, "").toLowerCase();
      if (ALLOWED_RAW_HTML_TAGS.has(bareTag)) return match; // render as HTML
      return `&lt;${tagName}${tagAttrs}&gt;`; // escape tags outside code spans
    },
  );

  return processed;
}

/** `[https://…]` → a real link, so a long URL never leaves a dangling bracket. */
function linkBracketedUrls(processed: string): string {
  // Convert bracketed bare URLs [https://...] into proper markdown links
  // This prevents dangling brackets when long URLs wrap across lines
  // Matches [URL] where URL starts with http(s):// and is not followed by () (which would be a standard markdown link)
  return processed.replace(
    /\[(https?:\/\/[^\]\s]+)\](?!\()/g,
    "[$1]($1)",
  );
}

/**
 * Prose preparation for ONE GFM table cell (verify-RC-B4 R6-1): the inline
 * steps only. A cell is inline content, so `* see note` stays `* see note`
 * (the document pass rewrites a leading `* ` bullet to `- `).
 */
export function preprocessCellProse(rawContent: string): string {
  return linkBracketedUrls(prepareInlineProse(rawContent));
}

/**
 * What GFM says a block IS, for the checks below: its lists (ordered or not,
 * how many items), tables, quotes and headings, in document order. Paragraph breaks and spacing
 * are deliberately not part of it — they are what readability rules may adjust.
 */
function gfmStructure(markdown: string): string {
  type Node = { type: string; ordered?: boolean | null; depth?: number; children?: Node[] };
  const tree = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as Node;
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.type === "list") out.push(`${node.ordered ? "ol" : "ul"}${node.children?.length ?? 0}`);
    else if (node.type === "table") out.push(`table${node.children?.length ?? 0}`);
    else if (node.type === "blockquote") out.push("quote");
    else if (node.type === "heading") out.push(`h${node.depth ?? 0}`);
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  return out.join(" ");
}

/**
 * THE rule for every readability rewrite of prose (verify-RC-B4 round 9 ruling):
 * the one core never changes what GFM says a document IS. A rewrite is kept only
 * when GFM's lists, tables, quotes and headings are the same before and after it;
 * otherwise the text stays as it was.
 */
function keepGfmStructure(before: string, after: string): string {
  if (after === before) return after;
  return gfmStructure(after) === gfmStructure(before) ? after : before;
}

const LIST_MARKER_LINE = /^\s*(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const ENDS_IN_EMPHASIS = /(?:\*\*[^*]+\*\*|\*[^*]+\*)$/;
const ONLY_ITALIC = /^\*[^*]+\*$/;

/**
 * Line `i` belongs to a list item or a block quote: it, or a line above it in
 * the same run of non-blank lines, opens one — or it is indented (content of an
 * item). A blank line inserted there would end that list or quote in GFM.
 */
function inListOrQuote(lines: readonly string[], i: number): boolean {
  for (let k = i; k >= 0; k -= 1) {
    const line = lines[k] ?? "";
    if (!line.trim()) return false;
    if (LIST_MARKER_LINE.test(line) || /^\s*>/.test(line) || /^[ \t]/.test(line)) return true;
  }
  return false;
}

/** May a blank line go between lines `i` and `i + 1` without changing GFM's structure? */
function mayBreakAfter(lines: readonly string[], i: number): boolean {
  const next = lines[i + 1] ?? "";
  if (!next.trim() || !(lines[i] ?? "").trim()) return false;
  if (/^\s/.test(next) || LIST_MARKER_LINE.test(next) || SETEXT_UNDERLINE.test(next)) return false;
  return !inListOrQuote(lines, i);
}

/** The emphasis-line readability spacing, applied only where GFM's reading is unchanged. */
function spaceEmphasisLines(text: string): string {
  if (!text.includes("*")) return text;
  const lines = text.split("\n");
  const breakAfter = new Set<number>();
  lines.forEach((line, i) => {
    if (i + 1 >= lines.length) return;
    // (as before: never when the next line opens with `*` or `-`)
    if (ENDS_IN_EMPHASIS.test(line) && !/^[*-]/.test(lines[i + 1] ?? "") && mayBreakAfter(lines, i)) breakAfter.add(i);
    // A line that is only italic text stands apart from both neighbours.
    if (i > 0 && ONLY_ITALIC.test(line) && !LIST_MARKER_LINE.test(line) && mayBreakAfter(lines, i - 1) && mayBreakAfter(lines, i)) {
      breakAfter.add(i - 1);
      breakAfter.add(i);
    }
  });
  if (breakAfter.size === 0) return text;
  return lines.map((line, i) => (breakAfter.has(i) ? `${line}\n` : line)).join("\n");
}

/** A blank line before every `---` line that would make the line above a setext heading — never a table's delimiter row. */
function separateSetextUnderlines(text: string): string {
  if (!text.includes("\n---")) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (i > 0 && line.startsWith("---") && lines[i - 1] !== "" && !tableStartsAt(lines, i - 1)) out.push("");
    out.push(line);
  });
  return out.join("\n");
}

/**
 * Massage raw model prose into the markdown the core parses: escape non-HTML
 * angle-bracket tokens, keep indentation, normalize list/bold spacing, turn
 * `===` into the thick rule sentinel and extra blank lines into spacers.
 * Math is NOT touched here — the core's math normalizer owns it.
 */
export function preprocessProse(rawContent: string): string {
  // A leading byte-order mark is an encoding mark, not content: dropped for
  // display so `\uFEFF---` front matter is hidden like `---` (RC-B3r round 3, C1).
  if (rawContent.charCodeAt(0) === 0xfeff) return preprocessProse(rawContent.slice(1));
  // Front matter (YAML/TOML properties at the very top) is data, not prose:
  // it passes through byte for byte (the core hides it and exposes it as
  // document properties) — indentation and `---` rules must not be massaged.
  const frontmatter = splitFrontmatter(rawContent);
  if (frontmatter) return frontmatter.raw + preprocessProse(frontmatter.body);

  // Fenced code is code, not prose: it passes through byte for byte (spaces
  // stay spaces, `<tags>` stay tags). A directive container keeps its fences
  // inside the text block (markdown-core directive-container.ts), so they
  // reach this pass.
  const guarded = protectFencedCode(rawContent);
  if (guarded) return guarded.restore(preprocessProse(guarded.text));

  let processed = rawContent;

  processed = prepareInlineProse(processed);

  // Replace leading spaces on each line with non-breaking spaces so HTML
  // doesn't collapse them — this preserves indentation visually.
  // EXCEPTION: never touch indented list items. Markdown relies on real
  // leading spaces to detect nesting; converting them to nbsp flattens
  // nested bullets/numbers into literal "- " / "1." text. So skip any line
  // whose indented content begins with a list marker (*, -, + or "1." / "1)").
  // The `(?! )` makes the run POSSESSIVE: without it `( +)` backtracks one
  // space short, the lookahead then sees " -" (a space, not a marker) and the
  // nested bullet is flattened to text (verifier F2, 2026-09-25; guard
  // __tests__/prose-prepare-nested-lists.test.ts).
  processed = keepGfmStructure(processed, preserveIndentation(processed));

  processed = linkBracketedUrls(processed);

  // Math delimiters (\(…\), \[…\], $…$, bracket display) are NOT converted
  // here: the ONE math normalizer runs inside MarkdownCore for every
  // math-capable preset (components/markdown-core/math-normalizer.ts).


  // Normalize asterisk bullets (*) to dash bullets (-) to avoid ambiguity with bold markers (**)
  // Both render identically, but dash bullets don't conflict with bold syntax
  // Preserve exact whitespace after the bullet marker
  processed = processed.replace(/^(\s*)\*([ \t]+)/gm, "$1-$2");

  // Force list termination before bold text that starts with a number (like **4. Test**).
  // CommonMark can treat single blank lines as "loose list" continuations, so we need
  // to inject an unambiguous block-level break between the list and the next paragraph.
  //
  // We use `&nbsp;` (a single non-breaking space on its own paragraph) instead of an
  // HTML comment (`<!-- -->`) because react-markdown is configured WITHOUT `rehype-raw`
  // (see the disabled-block comment above) — meaning raw HTML, including comments, is
  // emitted as literal text. The `&nbsp;` paragraph is rendered invisibly by the `p`
  // component below (it detects a single `\u00A0` child and emits a zero-content
  // spacer div), so it visually disappears while still acting as a block-level break.
  processed = processed.replace(
    /(^[ \t]*-[ \t]+[^\n]+)\n\n(\*\*\d)/gm,
    "$1\n\n&nbsp;\n\n$2",
  );

  // Fix setext-style heading patterns by ensuring there's a blank line before ---
  // This prevents paragraph text from being interpreted as h2 headings — but
  // never under a table header: `Step | Task` over `--- | ---` is a pipe-less
  // GFM table, and a blank line there destroyed it (verify-RC-B4 round 9;
  // THE table rule, gfm-table-lines).
  processed = separateSetextUnderlines(processed);

  // Standalone `===` → thick blue rule. See isolateThickHorizontalRules.
  processed = isolateThickHorizontalRules(processed);

  // Readability spacing: a blank line after a line that ends in bold/italic
  // text ("**Meta Title:**" then its content), and around a line that is only
  // italic text — ONLY where GFM's reading of the document does not change
  // (never inside a list or a quote, never before a list marker or a setext
  // underline). The one core never changes what GFM says a document IS
  // (verify-RC-B4 round 9 ruling; the screen census found 112 stored rows whose
  // lists these rules used to restructure).
  processed = keepGfmStructure(processed, spaceEmphasisLines(processed));

  // A line right under a list item's text is that item's text (CommonMark 5.2
  // lazy continuation) — no blank line is inserted after a list item, so the
  // screen reads it as GFM, print and the Visual editor do; four rules here
  // used to split it into a paragraph below the list, and `| a | b |` lines
  // into a table under the bullet (verify-RC-B4 round 9, R9-2).

  // Convert intentional blank lines into &nbsp; paragraphs so they render
  // at the same height as a normal line of text, capped at 2 visible blank lines.
  // A standard paragraph break is \n\n (2 chars) — that needs 0 spacers.
  // Only \n\n\n+ (extra blank lines beyond the paragraph break) add spacers.
  processed = processed.replace(/\n{2,}/g, (match) => {
    const blankLines = Math.min(match.length - 2, 2);
    return "\n\n" + "&nbsp;\n\n".repeat(blankLines);
  });

  return processed;
}
