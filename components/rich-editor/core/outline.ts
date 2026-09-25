// components/rich-editor/core/outline.ts
//
// The live outline and heading anchors. Slugs come from github-slugger — the
// algorithm rehype-slug uses — so an anchor copied in the editor is the id the
// rendered page gives the same heading.

import GithubSlugger from "github-slugger";
import { tokenizeSource } from "@ai-matrx/content-ir/source";

export interface OutlineEntry {
  level: number;
  text: string;
  slug: string;
  /** UTF-16 offset of the heading line in the source. */
  offset: number;
}

/**
 * Plain heading text: inline markdown markers and link targets dropped.
 * `{{variables}}` stay exactly as written, and an underscore INSIDE a word
 * (`site_name`, `file_name_here`) is text, not emphasis.
 */
export function headingPlainText(raw: string): string {
  const kept: string[] = [];
  const hold = (text: string) => `\u0000${kept.push(text) - 1}\u0000`;
  return raw
    .replace(/\{\{[^{}\n]*\}\}/g, hold)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*~`]+/g, "")
    .replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, "")
    .replace(/\s+#+\s*$/, "")
    .replace(/\u0000(\d+)\u0000/g, (_, index: string) => kept[Number(index)] ?? "")
    .trim();
}

/** Slugs for a list of heading texts, de-duplicated the way the renderer does (`-1`, `-2`). */
export function slugsFor(texts: readonly string[]): string[] {
  const slugger = new GithubSlugger();
  return texts.map((text) => slugger.slug(text));
}

/** Outline of the source text: ATX and setext headings outside every island. */
export function outlineOf(text: string): OutlineEntry[] {
  const found: Array<{ level: number; text: string; offset: number }> = [];
  for (const block of tokenizeSource(text)) {
    if (block.kind !== "prose") continue;
    const lines = block.raw.split("\n");
    let offset = block.start;
    lines.forEach((line, index) => {
      const atx = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/.exec(line) ?? /^ {0,3}(#{1,6})\s*$/.exec(line);
      if (atx) {
        found.push({ level: atx[1]?.length ?? 1, text: headingPlainText(atx[2] ?? ""), offset });
      } else {
        const next = lines[index + 1];
        if (line.trim() && next !== undefined && /^ {0,3}(=+|-+)[ \t]*$/.test(next) && !/^ {0,3}[-*+] /.test(line)) {
          const level = next.trim().startsWith("=") ? 1 : 2;
          if (level === 1 || next.trim().length >= 2) {
            found.push({ level, text: headingPlainText(line), offset });
          }
        }
      }
      offset += line.length + 1;
    });
  }
  const slugs = slugsFor(found.map((entry) => entry.text));
  return found.map((entry, index) => ({ ...entry, slug: slugs[index] ?? "" }));
}
