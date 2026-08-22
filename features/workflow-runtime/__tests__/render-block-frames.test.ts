/**
 * The sliced render_block wire: a workflow run's ephemeral channel carries a
 * canonical render block across ordered frames, and half a JSON document must
 * never reach a renderer.
 */

import { RenderBlockFrameAssembler, MAX_OPEN_FRAME_SETS } from "../transport/render-block-frames";
import type { NodeStreamEvent } from "../types";

const BLOCK = {
  blockId: "run_abc:blk_0",
  blockIndex: 0,
  type: "quiz",
  status: "streaming" as const,
  content: "```json\n{\"quiz_title\": \"Space\"}\n```",
  metadata: { __ir_partial: { v: 1, state: "partial", seq: 3 } },
};

function frames(block: unknown, frameId: string, sliceSize = 20): NodeStreamEvent[] {
  const body = JSON.stringify(block);
  const slices: string[] = [];
  for (let i = 0; i < body.length; i += sliceSize) slices.push(body.slice(i, i + sliceSize));
  return slices.map((delta, index) => ({
    event: "node_stream",
    run_id: "run-1",
    node_id: "node-1",
    kind: "render_block",
    delta,
    stream_seq: index + 1,
    ts: "2026-08-21T00:00:00Z",
    chunks_received: 0,
    chars_streamed: 0,
    frame_id: frameId,
    frame_index: index,
    frame_count: slices.length,
  }));
}

describe("RenderBlockFrameAssembler", () => {
  it("emits the block only once every slice has arrived", () => {
    const assembler = new RenderBlockFrameAssembler();
    const set = frames(BLOCK, "f1");
    expect(set.length).toBeGreaterThan(1);

    const results = set.map((frame) => assembler.push(frame));
    expect(results.slice(0, -1).every((r) => r === null)).toBe(true);
    expect(results[results.length - 1]).toEqual(BLOCK);
    expect(assembler.openCount).toBe(0);
  });

  it("reassembles out-of-order frames", () => {
    const assembler = new RenderBlockFrameAssembler();
    const set = [...frames(BLOCK, "f1")].reverse();
    const emitted = set.map((frame) => assembler.push(frame)).filter(Boolean);
    expect(emitted).toEqual([BLOCK]);
  });

  it("interleaves two blocks without mixing their bodies", () => {
    const assembler = new RenderBlockFrameAssembler();
    const other = { ...BLOCK, blockId: "run_abc:blk_1", type: "text", content: "plain prose" };
    const a = frames(BLOCK, "f1");
    const b = frames(other, "f2");
    const emitted: unknown[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) { const r = assembler.push(a[i]); if (r) emitted.push(r); }
      if (b[i]) { const r = assembler.push(b[i]); if (r) emitted.push(r); }
    }
    expect(emitted).toHaveLength(2);
    expect(emitted).toContainEqual(BLOCK);
    expect(emitted).toContainEqual(other);
  });

  it("drops an unparseable set instead of emitting half a document", () => {
    // publish_ephemeral silently drops an oversize payload, so a set CAN
    // complete with a slice missing from the middle of the JSON.
    const assembler = new RenderBlockFrameAssembler();
    const set = frames(BLOCK, "f1");
    const corrupted = set.map((frame, i) =>
      i === 1 ? { ...frame, delta: "" } : frame,
    );
    const emitted = corrupted.map((f) => assembler.push(f)).filter(Boolean);
    expect(emitted).toHaveLength(0);
  });

  it("never leaks abandoned frame sets", () => {
    const assembler = new RenderBlockFrameAssembler();
    for (let i = 0; i < MAX_OPEN_FRAME_SETS * 3; i++) {
      // First slice only — every set is abandoned.
      assembler.push(frames(BLOCK, `f${i}`)[0]);
    }
    expect(assembler.openCount).toBeLessThanOrEqual(MAX_OPEN_FRAME_SETS);
  });
});
