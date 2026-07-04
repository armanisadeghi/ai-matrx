/**
 * LIVE-CHAT regression — the 2026-07-04 "No flashcards available yet" bug.
 *
 * The real /chat render chain for a streamed `__kind` JSON region is:
 *
 *   StreamBlockAccumulator (Redux renderBlocks, `data: { language: "json" }`
 *   for untyped code blocks)
 *     → renderBlockToContentBlock (EnhancedChatMarkdown hop: `data` →
 *       `serverData`, so the annotation arrives as a TRUTHY serverData)
 *     → applyIrKindRoute (BlockRenderer entry)
 *     → ArtifactRender/FlashcardsArtifact (serverData pass-through)
 *     → deriveFlashcardsSet (useFlashcardsSet core; length 0 renders
 *       "No flashcards available yet...")
 *
 * The bug: applyIrKindRoute preferred ANY truthy block.serverData over the
 * envelope bridge, so the routed flashcards block carried
 * `{ language: "json" }` instead of cards — empty body during AND after the
 * stream, while `content` held a perfect payload. These tests drive the REAL
 * accumulator + the REAL hops with the exact user payload (bare and fenced)
 * and assert cards at every stage, mid-stream included (token-by-token is
 * the content-ir core promise).
 */

import type {
  FlashcardsBlockData,
  RenderBlockPayload,
} from "@/types/python-generated/stream-events";
import type { CxContentBlock } from "@/features/public-chat/types/cx-tables";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { deriveFlashcardsSet } from "@/components/mardown-display/blocks/flashcards/flashcards-set-derive";
import { planMaterialization } from "@/features/canvas/materialization/planMaterialization";
import {
  applyIrKindRoute,
  kindServerDataFromStoredValue,
} from "../react/kind-route";
import { normalizeJsonRegion, isCanonicalBlockIR } from "../core/normalize";
import { kindRegistry } from "../registry/kind-registry";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "../core/ir-types";
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

/** The exact user-reported payload shape (new `title` + full card fields). */
const USER_PAYLOAD = JSON.stringify(
  {
    __kind: "flashcard_set",
    title: "Spanish Basics",
    cards: [
      {
        __kind: "flashcard",
        front: "Hola",
        back: "Hello",
        card_kind: "basic",
        difficulty: "easy",
        topic: "Greetings",
        tags: ["vocab", "greetings"],
      },
      {
        __kind: "flashcard",
        front: "Adiós",
        back: "Goodbye",
        card_kind: "basic",
        difficulty: "easy",
        topic: "Greetings",
        tags: ["vocab"],
      },
    ],
  },
  null,
  2,
);

function streamAll(stream: string, requestId: string, seed = 7) {
  const { accumulator, upserts, dispatch } = makeAccumulator(requestId);
  for (const chunk of chunkText(stream, seed, 9)) {
    accumulator.ingest(chunk, dispatch);
  }
  accumulator.finalize(dispatch);
  return upserts;
}

function finalFlashcardBlock(upserts: Upsert[]): RenderBlockPayload {
  for (let i = upserts.length - 1; i >= 0; i--) {
    const block = upserts[i].block;
    const envelope = envelopeOf(block);
    if (
      block.status === "complete" &&
      envelope?.root.kind === "flashcard_set"
    ) {
      return block;
    }
  }
  throw new Error("no complete flashcard_set block streamed");
}

/**
 * Asserts the FULL real data path on a finalized stream: the block leaves the
 * accumulator as an untyped code block poisoned with
 * `serverData: { language: "json" }`, and must still route to real cards.
 */
function expectCardsEndToEnd(upserts: Upsert[]) {
  const converted = renderBlockToContentBlock(finalFlashcardBlock(upserts));

  // Precondition (the live poison): the accumulator's language annotation
  // arrives as a truthy serverData on the un-routed code block. If this stops
  // holding, the repro below no longer exercises the real chain — fix the test.
  expect(converted.type).toBe("code");
  expect(converted.serverData).toEqual({ language: "json" });

  const routed = applyIrKindRoute(converted);
  expect(routed.type).toBe("flashcards");

  const sd = routed.serverData as
    | (FlashcardsBlockData & { title?: string })
    | undefined;
  expect(sd?.isComplete).toBe(true);
  expect(sd?.title).toBe("Spanish Basics");
  expect(sd?.cards).toHaveLength(2);
  expect(sd?.cards?.[0]).toMatchObject({ front: "Hola", back: "Hello" });

  // The exact FlashcardsBlock gate: zero derived cards renders the
  // "No flashcards available yet..." empty state the user saw.
  const derived = deriveFlashcardsSet({
    content: routed.content,
    serverData: sd,
  });
  expect(derived.isComplete).toBe(true);
  expect(derived.flashcards).toHaveLength(2);
  expect(derived.flashcards[0]).toMatchObject({
    front: "Hola",
    back: "Hello",
  });
  // Card metadata survives into additionalDetails (zero loss).
  expect(derived.flashcards[0].additionalDetails).toMatchObject({
    card_kind: "basic",
    difficulty: "easy",
    topic: "Greetings",
    tags: ["vocab", "greetings"],
  });
  expect(derived.flashcards[1]).toMatchObject({
    front: "Adiós",
    back: "Goodbye",
  });
}

describe("live chat: streamed flashcard_set renders real cards (not the empty state)", () => {
  it("fenced ```json payload → cards after finalize", () => {
    const stream = `Here are your flashcards:\n\n\`\`\`json\n${USER_PAYLOAD}\n\`\`\`\n\nEnjoy!\n`;
    expectCardsEndToEnd(streamAll(stream, "req-live-fenced"));
  });

  it("bare JSON payload → cards after finalize", () => {
    const stream = `Here are your flashcards:\n\n${USER_PAYLOAD}\n\nEnjoy!\n`;
    expectCardsEndToEnd(streamAll(stream, "req-live-bare"));
  });

  it("TOKEN-BY-TOKEN: the first card appears MID-STREAM with back:null (per-card loader)", () => {
    // Cut the stream right before card 0's `"back"` key: front has fully
    // streamed, back has not arrived at all.
    const cut = USER_PAYLOAD.indexOf('"back"');
    expect(cut).toBeGreaterThan(0);
    const prefix = USER_PAYLOAD.slice(0, cut);
    const { accumulator, upserts, dispatch } = makeAccumulator(
      "req-live-midstream",
    );
    for (const chunk of chunkText(
      `Here are your flashcards:\n\n\`\`\`json\n${prefix}`,
      3,
      8,
    )) {
      accumulator.ingest(chunk, dispatch);
    }
    // NO finalize — the stream is still live.

    const live = [...upserts]
      .reverse()
      .find(({ block }) => envelopeOf(block)?.root.kind === "flashcard_set");
    if (!live) throw new Error("no streaming flashcard_set block mid-stream");

    const converted = renderBlockToContentBlock(live.block);
    expect(converted.isStreamingBlock).toBe(true);
    expect(converted.serverData).toEqual({ language: "json" }); // the poison

    const routed = applyIrKindRoute(converted);
    expect(routed.type).toBe("flashcards");

    const sd = routed.serverData as FlashcardsBlockData | undefined;
    expect(sd?.isComplete).toBe(false);
    expect(sd?.cards).toHaveLength(1);
    expect(sd?.cards?.[0]?.front).toBe("Hola");
    expect(sd?.cards?.[0]?.back).toBeNull(); // → per-card loader

    const derived = deriveFlashcardsSet({
      content: routed.content,
      serverData: sd,
    });
    expect(derived.flashcards).toHaveLength(1);
    expect(derived.flashcards[0].back).toBeNull();
    expect(derived.isComplete).toBe(false);
  });
});

describe("POST-MATERIALIZATION: the rewritten <artifact id> message still renders cards", () => {
  it("stored structured value → kindServerDataFromStoredValue → cards (the ArtifactRefBlock path)", () => {
    // Track 2 rewrites the message: the JSON region becomes a persisted
    // artifact whose canvas_items.content.data is the zero-loss value object.
    const plan = planMaterialization([
      {
        type: "text",
        text: `Here are your flashcards:\n\n\`\`\`json\n${USER_PAYLOAD}\n\`\`\`\n\nEnjoy!`,
      } as CxContentBlock,
    ]);
    expect(plan.artifacts).toHaveLength(1);
    const stored = plan.artifacts[0]?.structured;
    expect(stored?.title).toBe("Spanish Basics");

    // ArtifactRefBlock: structuredServerData = kindServerDataFromStoredValue(
    // stored.data); ArtifactBlock passes it as the renderer's serverData
    // (ArtifactRefBlock sets no `serverData` prop, so `serverData ??
    // structuredServerData` resolves to this).
    const sd = kindServerDataFromStoredValue(stored) as
      | (FlashcardsBlockData & { title?: string })
      | null;
    expect(sd?.isComplete).toBe(true);
    expect(sd?.title).toBe("Spanish Basics");
    expect(sd?.cards).toHaveLength(2);

    // Same FlashcardsBlock gate as the live path.
    const derived = deriveFlashcardsSet({ serverData: sd ?? undefined });
    expect(derived.flashcards).toHaveLength(2);
    expect(derived.flashcards[0]).toMatchObject({
      front: "Hola",
      back: "Hello",
    });
    expect(derived.isComplete).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The same bug class, every routed kind: a truthy `{ language: "json" }`
// serverData on the un-routed code block must NEVER survive routing — the
// envelope bridge (or undefined, for bridgeless kinds) always wins.
// ─────────────────────────────────────────────────────────────────────────

function poisonedRoutedBlock(payload: Record<string, unknown>) {
  const source = JSON.stringify(payload);
  const envelope = normalizeJsonRegion(source, {
    schemas: kindRegistry.snapshotSchemas(),
  });
  const block = {
    type: "code",
    content: source,
    serverData: { language: "json" } as Record<string, unknown>,
    metadata: { [IR_ENVELOPE_KEY]: envelope },
  };
  return applyIrKindRoute(block);
}

describe("poisoned serverData never survives routing (all kind families)", () => {
  it("quiz_set → quiz serverData is the quiz payload", () => {
    const routed = poisonedRoutedBlock({
      __kind: "quiz_set",
      title: "Q",
      questions: [
        {
          __kind: "quiz_question",
          type: "multiple_choice",
          question: "Pick",
          options: ["a", "b"],
          correct_answer: "b",
        },
      ],
    });
    expect(routed.type).toBe("quiz");
    expect(routed.serverData?.language).toBeUndefined();
    expect(routed.serverData?.quizTitle).toBe("Q");
    expect(routed.serverData?.multipleChoice).toHaveLength(1);
  });

  it("presentation_deck → presentation serverData is slides+theme", () => {
    const routed = poisonedRoutedBlock({
      __kind: "presentation_deck",
      title: "Deck",
      slides: [{ __kind: "presentation_slide", title: "S1" }],
    });
    expect(routed.type).toBe("presentation");
    expect(routed.serverData?.language).toBeUndefined();
    expect(routed.serverData?.slides).toHaveLength(1);
  });

  it("decision_tree serverData is the parsed tree", () => {
    const routed = poisonedRoutedBlock({
      __kind: "decision_tree",
      title: "T",
      root: {
        __kind: "decision_node",
        question: "Go?",
        yes: { __kind: "decision_node", action: "Do" },
        no: { __kind: "decision_node", action: "Wait" },
      },
    });
    expect(routed.type).toBe("decision_tree");
    expect(routed.serverData?.language).toBeUndefined();
    expect(routed.serverData?.root).toMatchObject({ question: "Go?" });
  });

  it("comparison_set → comparison_table serverData is the parsed table", () => {
    const routed = poisonedRoutedBlock({
      __kind: "comparison_set",
      title: "C",
      items: ["A", "B"],
      criteria: [
        {
          __kind: "comparison_criterion",
          name: "Price",
          values: ["$", "$$"],
        },
      ],
    });
    expect(routed.type).toBe("comparison_table");
    expect(routed.serverData?.language).toBeUndefined();
    expect(routed.serverData?.criteria).toHaveLength(1);
  });

  it("diagram_spec → diagram serverData is the parsed diagram", () => {
    const routed = poisonedRoutedBlock({
      __kind: "diagram_spec",
      title: "D",
      nodes: [{ __kind: "diagram_node", id: "a", label: "A" }],
    });
    expect(routed.type).toBe("diagram");
    expect(routed.serverData?.language).toBeUndefined();
    expect(routed.serverData?.nodes).toHaveLength(1);
  });

  it("math_problem serverData is the wrapped payload", () => {
    const routed = poisonedRoutedBlock({
      __kind: "math_problem",
      title: "M",
      problem_statement: { text: "t", equation: "e", instruction: "i" },
      solutions: [
        {
          __kind: "math_solution",
          task: "solve",
          steps: [
            { __kind: "math_solution_step", title: "s", equation: "x" },
          ],
          solutionAnswer: "x",
        },
      ],
    });
    expect(routed.type).toBe("math_problem");
    expect(routed.serverData?.language).toBeUndefined();
    expect(
      (routed.serverData?.math_problem as Record<string, unknown>)?.title,
    ).toBe("M");
  });

  it("schema_proposal serverData is the clean proposal", () => {
    const routed = poisonedRoutedBlock({
      __kind: "schema_proposal",
      name: "out",
      schema: { type: "object" },
    });
    expect(routed.type).toBe("schema_proposal");
    expect(routed.serverData?.language).toBeUndefined();
    expect(routed.serverData?.name).toBe("out");
  });

  it("item_presentation (no bridge) CLEARS the poison — content path only", () => {
    const routed = poisonedRoutedBlock({
      __kind: "item_presentation",
      type: "agent",
      name: "Helper",
    });
    expect(routed.type).toBe("item_presentation");
    // The junk must not reach ItemPresentationBlock as truthy serverData.
    expect(routed.serverData).toBeUndefined();
  });
});
