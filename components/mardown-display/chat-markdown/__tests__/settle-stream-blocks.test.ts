/**
 * FORCING FUNCTION: a completed stream's final screen equals the one-shot
 * reading — the blocks a reload renders (RC-B3 chair ruling, 2026-09-26).
 *
 * Use case: a support engineer asks why a nightly backup failed. The provider
 * lost the `<thinking>` opener, so the model's reasoning streams as plain text
 * and only its closer arrives. Live, the accumulator strips the closer (the
 * reasoning shows as answer text); a reload folds it into a thinking region.
 * The final pass makes the live screen, once the stream completes, the reload
 * screen — and changes nothing while the stream is still arriving.
 */
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { renderSettledFromRecord, settledOneShotBlocks } from "../settle-stream-blocks";

const CLOSER_ONLY_REASONING = [
  "The backup job ran at 02:00 and the disk was 97% full, so the snapshot",
  "step probably failed before the upload started. Checking the retention",
  "policy next.",
  "</thinking>",
  "",
  "The nightly backup failed because the backup volume ran out of space.",
  "Free space by pruning snapshots older than 30 days, then re-run the job.",
].join("\n");

/** Stream text through the real accumulator; return its final blocks, in order. */
function accumulate(text: string): RenderBlockPayload[] {
  const latest = new Map<string, RenderBlockPayload>();
  const order: string[] = [];
  const accumulator = new StreamBlockAccumulator("req-settle", (payload) => {
    const block = (payload as { block: RenderBlockPayload }).block;
    if (!latest.has(block.blockId)) order.push(block.blockId);
    latest.set(block.blockId, block);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (let i = 0; i < text.length; i += 7) accumulator.ingest(text.slice(i, i + 7), dispatch);
  accumulator.finalize(dispatch);
  return order.map((id) => latest.get(id) as RenderBlockPayload);
}

describe("the final pass after a stream completes", () => {
  it("the live accumulator's final blocks differ from the one-shot reading for closer-only reasoning (the problem)", () => {
    const live = accumulate(CLOSER_ONLY_REASONING);
    const oneShot = splitContentIntoBlocksV2(CLOSER_ONLY_REASONING);
    expect(oneShot.some((block) => block.metadata?.continuation === true)).toBe(true);
    expect(live.some((block) => block.type === "thinking")).toBe(false);
  });

  it("once complete, the screen is the one-shot reading", () => {
    const live = accumulate(CLOSER_ONLY_REASONING);
    const settled = settledOneShotBlocks({
      isStreamActive: false,
      blockIds: live.map((block) => block.blockId),
      content: CLOSER_ONLY_REASONING,
    });
    expect(settled).toEqual(splitContentIntoBlocksV2(CLOSER_ONLY_REASONING));
    expect(settled?.[0]?.type).toBe("thinking");
  });

  it("changes nothing while the stream is still arriving", () => {
    const live = accumulate(CLOSER_ONLY_REASONING);
    expect(
      settledOneShotBlocks({ isStreamActive: true, blockIds: live.map((b) => b.blockId), content: CLOSER_ONLY_REASONING }),
    ).toBeNull();
  });

  it("changes nothing when the accumulator already matches (no orphan closer)", () => {
    const text = "<thinking>\nChecking the disk.\n</thinking>\n\nThe backup volume is full.";
    const live = accumulate(text);
    expect(settledOneShotBlocks({ isStreamActive: false, blockIds: live.map((b) => b.blockId), content: text })).toBeNull();
  });

  it("never replaces server-produced blocks (they carry server envelopes)", () => {
    expect(
      settledOneShotBlocks({ isStreamActive: false, blockIds: ["srv_1", "client_2"], content: CLOSER_ONLY_REASONING }),
    ).toBeNull();
  });
});

describe("THE FINAL SCREEN IS THE RELOAD: a settled turn renders from its committed record (verify-RC-B3 F1/F2)", () => {
  // /chat streams SERVER-built blocks (ids `0`, `1`, …), so the client-block
  // final pass above never ran there and the finished answer kept the live
  // reading while a reload split the stored text. A settled turn with its
  // record in the store now renders the record — whatever built the live blocks.
  test("stream ended + committed record in the store → render the record", () => {
    expect(renderSettledFromRecord({ isStreamActive: false, messageId: "94a43534", recordSegmentCount: 1 })).toBe(true);
  });
  test("still streaming → live blocks", () => {
    expect(renderSettledFromRecord({ isStreamActive: true, messageId: "94a43534", recordSegmentCount: 1 })).toBe(false);
  });
  test("no committed record yet (no id, or its parts not in the store) → live blocks", () => {
    expect(renderSettledFromRecord({ isStreamActive: false, messageId: undefined, recordSegmentCount: 1 })).toBe(false);
    expect(renderSettledFromRecord({ isStreamActive: false, messageId: "94a43534", recordSegmentCount: 0 })).toBe(false);
  });
  test("the record's text part, split one-shot, is the reload reading of the verifier's message", () => {
    const stored = "I should compare this week's tonnage against last week first.\n</thinking>\n\nThis week the Harbor route collected 3.8 tons.";
    const blocks = splitContentIntoBlocksV2(stored);
    expect(blocks.map((b) => b.type)).toEqual(["thinking", "text"]);
    expect(blocks[1]?.content.trim()).toBe("This week the Harbor route collected 3.8 tons.");
  });
});
