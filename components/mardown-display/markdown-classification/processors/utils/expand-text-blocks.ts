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
          // Only the LAST reasoning piece of a still-streaming text block is
          // the thought currently coming in. Stamping `isStreamingBlock` on
          // every piece made each earlier `<thinking>` region claim to be the
          // live one too, so several traces animated a tail at once instead of
          // collapsing to "Thought process" behind the current one. Mirrors
          // the unified-slot path's `isStreamingRb && j === lastReasoningIdx`.
          // Non-reasoning pieces keep the flag: tables and code fences use it
          // to hold their streaming/loading state.
          let lastReasoningIdx = -1;
          for (let j = sub.length - 1; j >= 0; j--) {
            if (sub[j].type === "reasoning" || sub[j].type === "thinking") {
              lastReasoningIdx = j;
              break;
            }
          }
          sub.forEach((piece, j) => {
            const isReasoningPiece =
              piece.type === "reasoning" || piece.type === "thinking";
            out.push({
              ...(piece as RenderBlock),
              content: piece.content ?? "",
              isStreamingBlock:
                isReasoningPiece && j !== lastReasoningIdx
                  ? false
                  : block.isStreamingBlock,
            });
          });
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
