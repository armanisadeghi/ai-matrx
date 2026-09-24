// components/rich-editor/core/placeholders.ts
//
// Inline islands ({{variables}}, citations, inline math, HTML/XML tags,
// embedded kind JSON, media refs, anchors) must never reach the markdown
// parser as markdown: `$a_1 b_2$` would read as emphasis, `<b>` as HTML. Before
// a prose block is parsed, each inline island is swapped for an opaque
// placeholder made of Private Use Area characters; after parsing, every
// placeholder becomes an atomic island node that carries the island's exact
// bytes. A block that already contains a Private Use character is never parsed
// visually at all (the caller locks it), so a placeholder can never collide
// with stored text.

import type { SourceBlock, SourceIsland } from "@ai-matrx/content-ir/source";

const PH_OPEN = "";
const DIGIT_BASE = 0xe100;
const DIGIT_RANGE = 0xefff - DIGIT_BASE + 1; // 3840 symbols per digit
const PLACEHOLDER_RE = /([-])([-])/g;

/** True when the text holds a character from the range placeholders use. */
export function hasPrivateUseCharacter(text: string): boolean {
  return /[-]/.test(text);
}

function encodeIndex(index: number): string {
  const hi = Math.floor(index / DIGIT_RANGE);
  const lo = index % DIGIT_RANGE;
  if (hi >= DIGIT_RANGE) {
    throw new Error(`too many inline islands in one block (${index})`);
  }
  return (
    PH_OPEN +
    String.fromCharCode(DIGIT_BASE + hi) +
    String.fromCharCode(DIGIT_BASE + lo)
  );
}

function decodeIndex(hi: string, lo: string): number {
  return (
    (hi.charCodeAt(0) - DIGIT_BASE) * DIGIT_RANGE +
    (lo.charCodeAt(0) - DIGIT_BASE)
  );
}

export interface PlaceholderText {
  /** The block text with every inline island replaced by its placeholder. */
  text: string;
  /** Islands by placeholder index. */
  islands: readonly SourceIsland[];
}

/** Swap every inline island of a prose block for its placeholder. */
export function withPlaceholders(block: SourceBlock): PlaceholderText {
  if (block.inlines.length === 0) return { text: block.raw, islands: [] };
  let out = "";
  let cursor = block.start;
  block.inlines.forEach((island, index) => {
    out += block.raw.slice(cursor - block.start, island.start - block.start);
    out += encodeIndex(index);
    cursor = island.end;
  });
  out += block.raw.slice(cursor - block.start);
  return { text: out, islands: block.inlines };
}

/** Put every placeholder in `text` back to its island's exact bytes. */
export function restorePlaceholders(
  text: string,
  islands: readonly SourceIsland[],
): string {
  if (islands.length === 0) return text;
  return text.replace(PLACEHOLDER_RE, (whole, hi: string, lo: string) => {
    const island = islands[decodeIndex(hi, lo)];
    return island ? island.raw : whole;
  });
}

export type PlaceholderPiece =
  | { kind: "text"; text: string }
  | { kind: "island"; island: SourceIsland };

/** Split text into literal runs and the islands its placeholders name. */
export function splitPlaceholders(
  text: string,
  islands: readonly SourceIsland[],
): PlaceholderPiece[] {
  if (islands.length === 0 || !text.includes(PH_OPEN)) {
    return text ? [{ kind: "text", text }] : [];
  }
  const pieces: PlaceholderPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const at = match.index ?? 0;
    const island = islands[decodeIndex(match[1] ?? "", match[2] ?? "")];
    if (!island) continue;
    if (at > last) pieces.push({ kind: "text", text: text.slice(last, at) });
    pieces.push({ kind: "island", island });
    last = at + match[0].length;
  }
  if (last < text.length) pieces.push({ kind: "text", text: text.slice(last) });
  return pieces;
}
