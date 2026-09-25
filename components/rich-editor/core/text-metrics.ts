// components/rich-editor/core/text-metrics.ts
//
// Word count, character count and reading time of what a READER reads: the
// prose of the stored text. Islands (kind JSON, XML sections, code, math,
// HTML, anchors, {{variables}}) are not prose and are not counted; markdown
// markers (#, *, _, `, >, list bullets, table pipes, link targets) are not
// words. The same numbers show in every view because they come from the
// stored text, never from one editor's model.

import { tokenizeSource } from "@ai-matrx/content-ir/source";

export interface TextMetrics {
  words: number;
  /** Characters of prose, spaces included (what "characters" means in Docs). */
  characters: number;
  /** Whole minutes at 238 words per minute (the adult silent-reading average), minimum 1 when there is any prose. */
  readingMinutes: number;
  /** Protected blocks and inline islands the counts leave out. */
  islands: number;
}

export const READING_WORDS_PER_MINUTE = 238;

function proseOf(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<https?:[^>]+>/g, " ")
    .replace(/^ {0,3}(#{1,6}|>|[-*+]|\d{1,9}[.)])[ \t]+/gm, "")
    .replace(/^ {0,3}[-*_](?:[ \t]*[-*_]){2,}[ \t]*$/gm, "")
    .replace(/^\|?[ \t:|-]+\|[ \t:|-]*$/gm, "")
    .replace(/\[[ xX]\][ \t]/g, "")
    .replace(/[*_~`|]+/g, "");
}

export function measureText(text: string): TextMetrics {
  let prose = "";
  let islands = 0;
  for (const block of tokenizeSource(text)) {
    if (block.kind === "island") {
      islands += 1;
      continue;
    }
    if (block.kind !== "prose") continue;
    let cursor = block.start;
    let raw = "";
    for (const island of block.inlines) {
      raw += `${text.slice(cursor, island.start)} `;
      cursor = island.end;
      islands += 1;
    }
    raw += text.slice(cursor, block.end);
    prose += `${proseOf(raw)}\n`;
  }
  const words = prose.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu)?.length ?? 0;
  const characters = prose.replace(/\s+/g, " ").trim().length;
  const readingMinutes = words === 0 ? 0 : Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE));
  return { words, characters, readingMinutes, islands };
}
