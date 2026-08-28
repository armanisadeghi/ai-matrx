import { expandTextBlocksInList } from "@/components/mardown-display/markdown-classification/processors/utils/expand-text-blocks";
import type { RenderBlock } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";

// Only ONE thinking trace may claim to be the thought currently coming in.
// `isStreamingBlock` drives ThinkingTrace's live tail/shimmer, so stamping it
// on every expanded piece made earlier `<thinking>` regions animate alongside
// the current one instead of collapsing to "Thought process".
describe("expandTextBlocksInList — streaming flag on reasoning pieces", () => {
  it("marks only the last reasoning piece of a streaming text block", () => {
    const block: RenderBlock = {
      type: "text",
      content:
        "<thinking>first thought</thinking>\n\nSome answer text.\n\n<thinking>second thought</thinking>",
      isStreamingBlock: true,
    };

    const out = expandTextBlocksInList([block]);
    const reasoning = out.filter(
      (b) => b.type === "reasoning" || b.type === "thinking",
    );

    expect(reasoning.length).toBe(2);
    expect(reasoning[0].isStreamingBlock).toBe(false);
    expect(reasoning[reasoning.length - 1].isStreamingBlock).toBe(true);
  });

  it("leaves non-reasoning pieces of a streaming block streaming", () => {
    const block: RenderBlock = {
      type: "text",
      content: "<thinking>a thought</thinking>\n\n| a | b |\n| --- | --- |\n| 1 | 2 |",
      isStreamingBlock: true,
    };

    const out = expandTextBlocksInList([block]);
    for (const piece of out) {
      if (piece.type !== "reasoning" && piece.type !== "thinking") {
        expect(piece.isStreamingBlock).toBe(true);
      }
    }
  });

  it("never marks anything streaming when the block itself is settled", () => {
    const block: RenderBlock = {
      type: "text",
      content:
        "<thinking>first</thinking>\n\ntext\n\n<thinking>second</thinking>",
      isStreamingBlock: false,
    };

    const out = expandTextBlocksInList([block]);
    expect(out.every((b) => b.isStreamingBlock === false)).toBe(true);
  });
});
