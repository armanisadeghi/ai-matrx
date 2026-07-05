/**
 * The bare-JSON "pending kind" window — the exact behavior BlockRenderer's
 * PendingStructuredBlock skeleton keys on.
 *
 * A bare (unfenced) JSON region in chat has no `expectedRootKind`, so the root
 * kind cannot resolve until the `__kind` discriminator is actually parsed. When
 * the model emits `__kind` LAST, the whole object streams as an untyped `code`
 * block with an envelope whose `root.status === "streaming"` and `root.kind`
 * empty — that is the window in which the raw JSON must NOT be shown verbatim
 * (the "shows the whole JSON, converts only when done" flash). This test proves
 * that window exists on real chunked traffic and that the kind resolves to
 * `flashcard_set` by completion (so the block then routes to its component).
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "../core/ir-types";
import { isCanonicalBlockIR } from "../core/normalize";
import { chunkText } from "./seeded-random";

type Upsert = { requestId: string; block: RenderBlockPayload };

function makeAccumulator(requestId: string) {
  const upserts: Upsert[] = [];
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    upserts.push(payload as Upsert);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  return { accumulator, upserts, dispatch };
}

function envelopeOf(block: RenderBlockPayload): CanonicalBlockIR | null {
  const candidate = block.metadata?.[IR_ENVELOPE_KEY];
  return isCanonicalBlockIR(candidate) ? candidate : null;
}

/** Mirrors BlockRenderer.isPendingStructuredJson exactly. */
function isPendingStructuredJson(block: RenderBlockPayload): boolean {
  if (block.type !== "code") return false;
  const envelope = envelopeOf(block);
  return !!envelope && !envelope.root.kind && envelope.root.status === "streaming";
}

// `__kind` LAST at the root — the worst case for late resolution.
const FLASHCARD_JSON_KIND_LAST = JSON.stringify(
  {
    title: "Stream Test",
    cards: [
      { front: "A?", back: "a", __kind: "flashcard" },
      { front: "B?", back: "b", __kind: "flashcard" },
    ],
    __kind: "flashcard_set",
  },
  null,
  2,
);

describe("bare JSON pending-kind window", () => {
  it("streams as an untyped code region with a pending envelope, then resolves flashcard_set", () => {
    const { accumulator, upserts, dispatch } = makeAccumulator("req-bare");
    // Bare (no fence); the `{` starts its own line so the bare-JSON region opens.
    const stream = `Here are your cards:\n\n${FLASHCARD_JSON_KIND_LAST}\n\nEnjoy!\n`;

    for (const chunk of chunkText(stream, 13, 7)) {
      accumulator.ingest(chunk, dispatch);
    }

    // BEFORE finalize: the region is mid-stream with an unresolved kind — the
    // window PendingStructuredBlock replaces the raw JSON. It MUST occur.
    const pendingHits = upserts.filter((u) => isPendingStructuredJson(u.block));
    expect(pendingHits.length).toBeGreaterThan(0);

    accumulator.finalize(dispatch);

    // AFTER finalize: the region completed and the root kind resolved, so the
    // block is no longer in the pending window (it routes to flashcards).
    const complete = [...upserts]
      .reverse()
      .find((u) => u.block.status === "complete" && envelopeOf(u.block));
    expect(complete).toBeDefined();
    const envelope = envelopeOf(complete!.block)!;
    expect(envelope.root.kind).toBe("flashcard_set");
    expect(envelope.root.status).toBe("complete");
    // And the terminal state is no longer "pending" — the skeleton is gone.
    expect(isPendingStructuredJson(complete!.block)).toBe(false);
  });
});
