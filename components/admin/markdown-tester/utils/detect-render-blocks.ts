// components/admin/markdown-tester/utils/detect-render-blocks.ts
// Extracts the unique set of render block types contained in markdown
// content. Used to auto-fill the `detected_blocks` tag list on save.
// Backed by the V2 splitter so the tag list matches what MarkdownStream
// actually renders.

import { runV2Parser } from "./run-v2-parser";

/**
 * Returns a sorted, deduped list of block type names found in `content`.
 * Returns `[]` when content is empty or only contains "text" blocks
 * (text is the default and not interesting as a tag).
 */
export function detectRenderBlocks(content: string): string[] {
  if (!content.trim()) return [];
  const blocks = runV2Parser(content);
  const types = new Set<string>();
  for (const block of blocks) {
    if (!block.type) continue;
    // "text" is the default fallback block — don't pollute the tag list
    // with it. Every non-empty sample contains text by definition.
    if (block.type === "text") continue;
    types.add(block.type);
  }
  return Array.from(types).sort();
}
