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
import { normalizeJsonRegion, isCanonicalBlockIR } from "@ai-matrx/content-ir";
import { kindRegistry } from "../registry/kind-registry";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "@ai-matrx/content-ir";
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
    title: "Parity",
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

/**
 * LEGACY JSON PAYLOADS — no `__kind`, recognized through the `json_root_key`
 * surface registry (content_ir.kind_surface). These are the shapes the SERVER
 * maps onto their registered kind in `adapt_block_data`; the frontend does not
 * adapt, so they still degrade to raw — but the parser now NAMES the kind the
 * surface registry names, so the notice states the real contract gap instead
 * of the misleading `Object is missing "__kind"`. Both hosts must produce the
 * identical envelope, which is the whole point: one place decides it.
 */
const LEGACY_QUIZ = JSON.stringify(
  {
    quiz_title: "State Capitals",
    questions: [
      {
        type: "multiple_choice",
        question: "Capital of Texas?",
        options: ["Austin", "Dallas"],
        correctAnswer: 0,
      },
    ],
  },
  null,
  2,
);

const LEGACY_PRESENTATION = JSON.stringify(
  {
    presentation: {
      title: "Q3 Review",
      slides: [{ title: "Intro", content: ["Hello"] }],
    },
  },
  null,
  2,
);

const LEGACY_ITEM_PRESENTATION = JSON.stringify(
  {
    item_presentation: {
      type: "product",
      name: "Widget",
      about: "A widget.",
    },
  },
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
  [
    "legacy quiz JSON (json_root_key surface) is IDENTICAL on both paths",
    `\`\`\`json\n${LEGACY_QUIZ}\n\`\`\`\n`,
    1,
  ],
  [
    "legacy presentation JSON (json_root_key surface) is IDENTICAL on both paths",
    `\`\`\`json\n${LEGACY_PRESENTATION}\n\`\`\`\n`,
    1,
  ],
  [
    "legacy item_presentation JSON (json_root_key surface) is IDENTICAL on both paths",
    `Here:\n${LEGACY_ITEM_PRESENTATION}\nDone.\n`,
    1,
  ],
];

const LEGACY_SURFACE_CASES: Array<[string, string, string]> = [
  ["quiz", LEGACY_QUIZ, "quiz_set"],
  ["presentation", LEGACY_PRESENTATION, "presentation_deck"],
  ["item_presentation", LEGACY_ITEM_PRESENTATION, "item_presentation"],
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

  /**
   * THE JSON-ROOT-KEY SURFACE, proven from ONE place: the lookup lives in
   * core/kind-parser.ts, so neither host passes an option for it and both
   * inherit it by construction. Every legacy payload must (a) name its
   * registered kind in the notice and (b) never say `missing "__kind"`.
   */
  it.each(LEGACY_SURFACE_CASES)(
    "legacy %s names its registered kind on BOTH hosts",
    (_label, payload, expectedKind) => {
      const oneShot = normalizeJsonRegion(payload, {
        schemas: kindRegistry.snapshotSchemas(),
      });
      const notices = JSON.stringify(oneShot.root);

      expect(notices).toContain(expectedKind);
      expect(notices).not.toContain('missing "__kind"');

      // The live streaming host, chunked at randomized boundaries, agrees.
      for (let seed = 11; seed < 15; seed++) {
        const fromStream = accumulatorEnvelopes(
          `\`\`\`json\n${payload}\n\`\`\`\n`,
          seed,
        );
        expect(fromStream).toHaveLength(1);
        expect(fromStream[0]?.root).toEqual(oneShot.root);
      }
    },
  );

  it("splitter re-splits return the SAME envelope object (memoized idempotence)", () => {
    const source = `\`\`\`json\n${FLASHCARDS}\n\`\`\`\n`;
    const first = splitterEnvelopes(source)[0];
    const second = splitterEnvelopes(source)[0];
    expect(second).toBe(first); // reference equality — zero reprocessing
  });
});
