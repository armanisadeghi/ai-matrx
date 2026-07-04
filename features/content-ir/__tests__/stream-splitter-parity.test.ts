/**
 * Phase 3: THE stream/DB lockstep invariant.
 *
 * Every fixture runs (a) chunked at randomized boundaries through the
 * StreamBlockAccumulator (the live path) and (b) whole through
 * splitContentIntoBlocksV2 (the DB/reload path). Both must attach the SAME
 * CanonicalBlockIR envelope — which is also byte-identical to the one-shot
 * normalizer. This suite is the safety net for every later phase (render
 * flip, persisted-envelope reuse, mirrored-state-machine deletion).
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { normalizeJsonRegion, isCanonicalBlockIR } from "../core/normalize";
import { kindRegistry } from "../registry/kind-registry";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "../core/ir-types";
import { chunkText } from "./seeded-random";

function accumulatorEnvelopes(
  stream: string,
  seed: number,
): CanonicalBlockIR[] {
  const upserts: Array<{ block: RenderBlockPayload }> = [];
  const accumulator = new StreamBlockAccumulator("parity-req", (payload) => {
    upserts.push(payload as { block: RenderBlockPayload });
    return payload;
  });
  const dispatch = (a: unknown) => a;

  for (const chunk of chunkText(stream, seed, 7)) {
    accumulator.ingest(chunk, dispatch);
  }
  accumulator.finalize(dispatch);

  // Last complete upsert per blockId, in block order.
  const finalByBlock = new Map<string, RenderBlockPayload>();
  for (const { block } of upserts) {
    if (block.status === "complete") finalByBlock.set(block.blockId, block);
  }
  return [...finalByBlock.values()]
    .sort((a, b) => a.blockIndex - b.blockIndex)
    .map((b) => b.metadata?.[IR_ENVELOPE_KEY])
    .filter(isCanonicalBlockIR);
}

function splitterEnvelopes(source: string): CanonicalBlockIR[] {
  return splitContentIntoBlocksV2(source)
    .map((b) => b.metadata?.[IR_ENVELOPE_KEY])
    .filter(isCanonicalBlockIR);
}

const FLASHCARDS = JSON.stringify(
  {
    __kind: "flashcard_set",
    set_title: "Parity",
    audio_intro: "https://example.com/intro.mp3",
    cards: [
      { __kind: "flashcard", front: "Q1", back: "A1", image_ref: "img-9" },
      { __kind: "flashcard", front: "Q2", back: "A2" },
    ],
  },
  null,
  2,
);

const UNKNOWN_KIND = JSON.stringify(
  { __kind: "custom_widget", title: "user-registered someday", knobs: [1, 2] },
  null,
  2,
);

const FIXTURES: Array<[string, string, number]> = [
  [
    "fenced flashcards between prose",
    `Intro text.\n\n\`\`\`json\n${FLASHCARDS}\n\`\`\`\n\nOutro.\n`,
    1,
  ],
  ["bare flashcards JSON", `Here:\n${FLASHCARDS}\nDone.\n`, 1],
  [
    "unknown kind falls back raw IDENTICALLY on both paths",
    `\`\`\`json\n${UNKNOWN_KIND}\n\`\`\`\n`,
    1,
  ],
  [
    "two JSON regions in one message",
    `First:\n\`\`\`json\n${FLASHCARDS}\n\`\`\`\nSecond:\n${UNKNOWN_KIND}\nEnd.\n`,
    1,
  ],
];

describe("stream ↔ splitter envelope parity", () => {
  it.each(FIXTURES)("%s", (_label, source, envelopeSeedBase) => {
    const fromSplitter = splitterEnvelopes(source);
    expect(fromSplitter.length).toBeGreaterThan(0);

    for (let seed = envelopeSeedBase; seed < envelopeSeedBase + 4; seed++) {
      const fromStream = accumulatorEnvelopes(source, seed);
      expect(fromStream).toEqual(fromSplitter);
    }
  });

  it("both paths equal the one-shot normalizer on the region source", () => {
    const fromSplitter = splitterEnvelopes(
      `\`\`\`json\n${FLASHCARDS}\n\`\`\`\n`,
    );
    const oneShot = normalizeJsonRegion(FLASHCARDS, {
      schemas: kindRegistry.snapshotSchemas(),
    });
    expect(fromSplitter[0]).toEqual(oneShot);
  });

  it("splitter re-splits return the SAME envelope object (memoized idempotence)", () => {
    const source = `\`\`\`json\n${FLASHCARDS}\n\`\`\`\n`;
    const first = splitterEnvelopes(source)[0];
    const second = splitterEnvelopes(source)[0];
    expect(second).toBe(first); // reference equality — zero reprocessing
  });
});
