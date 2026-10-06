// components/matrx/buttons/markdown-readable-text.ts
//
// "Copy text": markdown read back as the plain text a person would type —
// markup gone, structure kept (Arman, 2026-10-04). Lists as "• ", numbered
// lists keep their numbers, checklists as ☐ / ☑, links as "text (url)",
// tables tab-separated (they paste into a spreadsheet as cells), code kept
// verbatim (fences dropped), headings and quotes without their markers.
// Pure: the copy module (markdown-copy-utils.ts) and its tests call it.

import { unwrapKindEnvelopes } from "@/lib/markdown/plain-text";
import {
  findTableEnd,
  rowCells,
  tableStartsAt,
  unescapeCellPipes,
} from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/gfm-table-lines";

const FENCE = /^( {0,3})(`{3,}|~{3,})/;

/** Inline markup → its words. Code spans are kept as their text. */
export function readableInline(line: string): string {
  const codes: string[] = [];
  // Protect code spans first: nothing inside them is markup.
  let out = line.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_m, _ticks, body: string) => {
    codes.push(body.replace(/^ (.*) $/, "$1"));
    return `\uE000${codes.length - 1}\uE000`;
  });
  out = out
    // Images and links: ![alt](url) → alt (url); [text](url) → text (url); same text and url → url.
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt: string, url: string) => (alt ? `${alt} (${url})` : url))
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, text: string, url: string) => {
      const bare = url.replace(/^mailto:/, "");
      return text === url || text === bare ? bare : `${text} (${bare})`;
    })
    // Autolinks <https://…>
    .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, (_m, url: string) => url.replace(/^mailto:/, ""))
    // Emphasis, strong, strike (both spellings), never inside words for underscores.
    .replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, "$1$2")
    // Hard break (two trailing spaces / backslash) and author escapes.
    .replace(/ {2,}$|\\$/g, "")
    .replace(/\\([!-/:-@[-`{-~])/g, "$1");
  return out.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => codes[Number(i)] ?? "");
}

/** Markdown → readable plain text (envelopes unwrapped first). */
export function markdownToReadableText(markdown: string): string {
  const lines = unwrapKindEnvelopes(markdown).replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    // Fenced code: the code, verbatim, without its fences.
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[2]!;
      let j = i + 1;
      while (j < lines.length && !new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`).test(lines[j]!)) {
        out.push(lines[j]!);
        j += 1;
      }
      i = j;
      continue;
    }
    // Tables: tab-separated cells, the |---| rule dropped.
    if (tableStartsAt(lines, i)) {
      const end = findTableEnd(lines, i);
      for (let j = i; j < end; j += 1) {
        if (j === i + 1) continue;
        out.push(rowCells(lines[j]!).map((c) => readableInline(unescapeCellPipes(c).trim())).join("\t"));
      }
      i = end - 1;
      continue;
    }
    // Thematic break → a blank line.
    if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) {
      out.push("");
      continue;
    }
    // Setext underline (=== / ---) under a text line: drop it.
    if (/^ {0,3}(=+|-+) *$/.test(line) && out.length && out[out.length - 1]!.trim()) continue;
    let rest = line;
    // Quote markers.
    rest = rest.replace(/^ {0,3}(?:> ?)+/, "");
    // ATX heading.
    rest = rest.replace(/^ {0,3}#{1,6}[ \t]+/, "").replace(/[ \t]+#+[ \t]*$/, "");
    // Lists: keep indentation, swap the marker.
    rest = rest
      .replace(/^(\s*)[-*+][ \t]+\[[ ]\][ \t]+/, "$1☐ ")
      .replace(/^(\s*)[-*+][ \t]+\[[xX]\][ \t]+/, "$1☑ ")
      .replace(/^(\s*)[-*+][ \t]+/, "$1• ")
      .replace(/^(\s*)(\d{1,9})[.)][ \t]+/, "$1$2. ");
    out.push(readableInline(rest));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
