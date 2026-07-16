/**
 * textSurface — adapters between a STRING-BODIED surface (notes, transcripts:
 * one markdown string, not a cx_message content array) and the block-shaped
 * materialization primitives (`materializeBlocks`, `unbindArtifact`).
 *
 * PURE. Any string surface uses these two functions and its own canonical
 * save path — never a parallel content shape.
 */

import type {
  CxContentBlock,
  CxTextContent,
} from "@/features/public-chat/types/cx-tables";

/** A surface's markdown string → the content-blocks shape the primitives take. */
export function textToContentBlocks(text: string): CxContentBlock[] {
  return [{ type: "text", text } as CxTextContent];
}

/**
 * Rewritten content blocks → the surface's markdown string. A string surface
 * only ever feeds text in, so only text can come back — a non-text block here
 * means a primitive misbehaved; fail LOUDLY (the caller aborts its rewrite,
 * the raw content stays put) rather than silently dropping a block.
 */
export function contentBlocksToText(
  blocks: CxContentBlock[],
): { ok: true; text: string } | { ok: false; error: string } {
  const parts: string[] = [];
  for (const b of blocks) {
    if ((b as { type?: string }).type !== "text") {
      return {
        ok: false,
        error: `contentBlocksToText: unexpected non-text block "${(b as { type?: string }).type}" — refusing to serialize a text surface rewrite`,
      };
    }
    const t = (b as CxTextContent).text ?? "";
    if (t) parts.push(t);
  }
  return { ok: true, text: parts.join("\n\n") };
}
