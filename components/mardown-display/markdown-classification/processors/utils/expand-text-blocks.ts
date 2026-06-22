import { splitContentIntoBlocksV2 } from "./content-splitter-v2";
import type { RenderBlock } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";

/**
 * Re-run the V2 splitter on `text` blocks so embedded tables, code fences,
 * etc. promote to typed blocks. The unified-slots streaming path already does
 * this for `render_block` rows with type "text"; the processedBlocks /
 * hasClientBlocks fast path did not — which left tables as plain GFM markdown
 * inside BasicMarkdownContent instead of StreamingTableRenderer.
 */
export function expandTextBlocksInList(blocks: RenderBlock[]): RenderBlock[] {
  const out: RenderBlock[] = [];

  for (const block of blocks) {
    if (block.type === "text" && block.content?.trim()) {
      try {
        const sub = splitContentIntoBlocksV2(block.content);
        const shouldExpand =
          sub.length > 1 || (sub.length === 1 && sub[0].type !== "text");

        if (shouldExpand) {
          for (const piece of sub) {
            out.push({
              ...(piece as RenderBlock),
              content: piece.content ?? "",
              isStreamingBlock: block.isStreamingBlock,
            });
          }
          continue;
        }
      } catch {
        /* keep original block */
      }
    }
    out.push(block);
  }

  return out;
}
