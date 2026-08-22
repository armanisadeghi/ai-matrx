/**
 * ONE STREAMING LAW, ONE SET OF BLOCKS.
 *
 * A workflow agent node now streams server-built `render_block` events (typed
 * partial kinds included) onto its lane, while the SAME text keeps flowing on
 * the node_stream text channel for the heartbeat and the tracked tier. The
 * lane must therefore pick exactly one producer of blocks — two would render
 * the same answer twice, under two sets of block ids — and it must apply the
 * same wire-boundary rules `processStream` applies, carry-forward included.
 *
 * Contract: common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md.
 */

import { RunLaneManager } from "../lane-manager";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

const RUN = "run-1";
const KEY = "node-1::root:0";

interface Action {
  type: string;
  payload?: unknown;
}

function harness() {
  const actions: Action[] = [];
  const dispatch = ((action: Action) => {
    actions.push(action);
    return action;
  }) as never;
  return {
    manager: new RunLaneManager(dispatch),
    actions,
    of: (suffix: string) => actions.filter((a) => a.type.endsWith(suffix)),
  };
}

function partialEvent(seq: number, questions: number) {
  return {
    v: 1,
    engine: "py-block-detector",
    state: "partial",
    seq,
    fingerprint: `fp-${seq}`,
    root: {
      role: "structured",
      kind: "quiz_set",
      kindState: "speculative",
      discriminator: { format: "fence", language: "json" },
      path: [],
      status: "streaming",
      value: {
        __kind: "quiz_set",
        multiple_choice: Array.from({ length: questions }, (_, i) => ({
          question: `Q${i}`,
        })),
      },
      residue: { extra: null, optionalMissing: null, notices: [] },
    },
  };
}

function block(overrides: Partial<RenderBlockPayload> = {}): RenderBlockPayload {
  return {
    blockId: "run_abc:blk_0",
    blockIndex: 0,
    type: "quiz",
    status: "streaming",
    content: "```json\n{\"quiz_title\":\"Space\"}",
    metadata: { __ir_partial: partialEvent(1, 3) },
    ...overrides,
  };
}

describe("RunLaneManager — server render blocks", () => {
  it("stores a server block on the lane's request row", () => {
    const { manager, actions, of } = harness();
    manager.ensureLane(RUN, KEY);
    actions.length = 0;

    expect(manager.pushRenderBlock(RUN, KEY, block())).toBe(true);

    const upserts = of("upsertRenderBlock");
    expect(upserts).toHaveLength(1);
    const stored = (upserts[0].payload as { block: RenderBlockPayload }).block;
    expect(stored.blockId).toBe("run_abc:blk_0");
    expect(stored.metadata?.__ir_partial).toEqual(partialEvent(1, 3));
  });

  it("carries an open block's last partial across keyless events", () => {
    // The producer clears __ir_partial on every non-advancing event, so most
    // snapshots carry none. Dropping the provisional render on those makes a
    // filling quiz flicker back to its skeleton on every token.
    const { manager, of } = harness();
    manager.pushRenderBlock(RUN, KEY, block());
    manager.pushRenderBlock(RUN, KEY, block({ metadata: {} }));

    const upserts = of("upsertRenderBlock");
    expect(upserts).toHaveLength(2);
    const second = (upserts[1].payload as { block: RenderBlockPayload }).block;
    expect(second.metadata?.__ir_partial).toEqual(partialEvent(1, 3));
  });

  it("does not re-parse shadowed text into a second set of blocks", () => {
    const { manager, actions, of } = harness();
    manager.pushDelta(RUN, KEY, "chunk", "```json\n{\"a\": 1}\n```\n", true);
    actions.length = 0;
    manager.flushAll();

    expect(of("appendChunk")).toHaveLength(1);
    expect(of("upsertRenderBlock")).toHaveLength(0);

    // …and settling must not finalize a region that was never opened.
    actions.length = 0;
    manager.settleLane(RUN, KEY, "complete");
    expect(of("upsertRenderBlock")).toHaveLength(0);
  });

  it("still parses UNSHADOWED text itself — a run with no block scope is unchanged", () => {
    const { manager, actions, of } = harness();
    manager.pushDelta(RUN, KEY, "chunk", "Hello there.", false);
    actions.length = 0;
    manager.flushAll();

    expect(of("appendChunk")).toHaveLength(1);
    expect(of("upsertRenderBlock").length).toBeGreaterThan(0);
  });

  it("refuses a block when the lane budget is exhausted, and never throws", () => {
    const actions: Action[] = [];
    const dispatch = ((a: Action) => actions.push(a)) as never;
    const manager = new RunLaneManager(dispatch, 1);
    manager.ensureLane(RUN, KEY);

    expect(manager.pushRenderBlock(RUN, "node-2::root:0", block())).toBe(false);
  });
});
