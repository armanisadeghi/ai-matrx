import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { applyIrKindRoute } from "../react/kind-route";
import { readEnvelope } from "../redux/render-block-envelope";
import {
  findEmbeddedKindJsonRegions,
  splitAroundEmbeddedKindJson,
} from "../surfaces/embedded-kind-json";
import { chunkText } from "./seeded-random";

const KEYWORD_BATCH = JSON.stringify(
  {
    __kind: "keyword_classification_batch_v1",
    classifier_version: "kwclass-v1",
    results: [
      {
        __kind: "keyword_classification_v1",
        keyword_id: "2a132ca0-60f4-4995-8def-20482e99d360",
        phrase: "hipaa compliant hard drive destruction",
        intent_class: "transactional",
        fulfillment_mode: "done_for_you",
        audience_type: "business",
        funnel_stage: "vendor_evaluation",
        transaction_direction: "searcher_pays",
        local_intent: "implicit_local",
        urgency: "none",
        comparison_intent: "none",
        price_sensitivity: "none",
        query_form: "phrase",
        specificity: "long_tail",
        brand_presence: "unbranded",
        compliance_framing: "regulated",
        overall_confidence: 91,
        per_fact_confidence: { intent_class: 88 },
        secondary_interpretation: { funnel_stage: "solution_aware" },
        standards: ["HIPAA"],
        error: null,
      },
    ],
  },
  null,
  2,
);

const FLASHCARDS = JSON.stringify({
  __kind: "flashcard_set",
  title: "Recovered { braces } and [arrays] inside strings",
  cards: [
    { __kind: "flashcard", front: "Question", back: "Answer" },
  ],
});

const REPORTED_FAILURE = [
  "Rules:",
  "- Return the classification.",
  "",
  "[OUTPUT RULES — ABSOLUTE: emit JSON]",
  "```",
  "",
  "**Output contract:**",
  "",
  "```json",
  KEYWORD_BATCH,
  "```",
].join("\n");

type ComparableBlock = {
  type: string;
  content: string;
  language: string | null;
  kind: string | null;
};

function splitterBlocks(source: string): ComparableBlock[] {
  return splitContentIntoBlocksV2(source).map((block) => ({
    type: block.type,
    content: block.content,
    language: block.language ?? null,
    kind: readEnvelope(block.metadata)?.root.kind || null,
  }));
}

function reduxBlocks(source: string, seed: number): ComparableBlock[] {
  const upserts: Array<{ block: RenderBlockPayload }> = [];
  const accumulator = new StreamBlockAccumulator(
    `embedded-kind-${seed}`,
    (payload) => {
      upserts.push(payload as { block: RenderBlockPayload });
      return payload;
    },
  );
  const dispatch = (action: unknown) => action;
  for (const chunk of chunkText(source, seed, 11)) {
    accumulator.ingest(chunk, dispatch);
  }
  accumulator.finalize(dispatch);

  const finalById = new Map<string, RenderBlockPayload>();
  for (const { block } of upserts) {
    if (block.status === "complete" && block.content) {
      finalById.set(block.blockId, block);
    }
  }
  return [...finalById.values()]
    .sort((a, b) => a.blockIndex - b.blockIndex)
    .map((block) => ({
      type: block.type,
      content: block.content ?? "",
      language:
        typeof block.data?.language === "string" ? block.data.language : null,
      kind: readEnvelope(block.metadata)?.root.kind || null,
    }));
}

describe("embedded __kind recovery across every arrival container", () => {
  it("fixes the reported dangling-fence case and routes the real component", () => {
    const blocks = splitContentIntoBlocksV2(REPORTED_FAILURE);
    const kindBlock = blocks.find(
      (block) =>
        readEnvelope(block.metadata)?.root.kind ===
        "keyword_classification_batch_v1",
    );

    expect(kindBlock).toBeDefined();
    if (!kindBlock) throw new Error("classification kind block was not recovered");
    expect(kindBlock.content).toBe(KEYWORD_BATCH);
    expect(
      applyIrKindRoute({
        type: kindBlock.type,
        metadata: kindBlock.metadata,
      }).type,
    ).toBe("keyword_classification_batch");
    expect(blocks.some((block) => block.content.includes("Output contract"))).toBe(
      true,
    );
  });

  it.each([
    ["non-JSON fence", `\`\`\`python\nbefore\n${FLASHCARDS}\nafter\n\`\`\``],
    ["recognized XML", `<thinking>\nbefore\n${FLASHCARDS}\nafter\n</thinking>`],
    ["unrecognized XML", `<custom>\nbefore\n${FLASHCARDS}\nafter\n</custom>`],
    ["inline prose", `before ${FLASHCARDS} after`],
    ["nested in anonymous JSON", `\`\`\`json\n{"payload":${FLASHCARDS}}\n\`\`\``],
    [
      "two kinds in one container",
      `\`\`\`text\n${FLASHCARDS}\nmiddle\n${KEYWORD_BATCH}\n\`\`\``,
    ],
  ])("stream and persisted paths agree for %s", (label, source) => {
    const expected = splitterBlocks(source);
    expect(expected.filter((block) => block.kind)).not.toHaveLength(0);
    for (let seed = 1; seed <= 8; seed++) {
      const streamed = reduxBlocks(source, seed);
      // The accumulator intentionally treats an unknown XML wrapper as text
      // until the Markdown expansion pass; its inner bare-JSON line is already
      // a first-class region before the wrapper closes. Container chrome may
      // therefore stay text live and become `code/xml` on reload, but the
      // Content-IR regions (the contract under test) are identical.
      if (label === "unrecognized XML") {
        expect(streamed.filter((block) => block.kind)).toEqual(
          expected.filter((block) => block.kind),
        );
      } else {
        expect(streamed).toEqual(expected);
      }
    }
  });

  it("preserves every surrounding byte and ignores impostors/malformed JSON", () => {
    const source = [
      "prefix",
      FLASHCARDS,
      '{"label":"__kind"}',
      '{"__kind":"unfinished".',
      "suffix",
    ].join("\n");
    const pieces = splitAroundEmbeddedKindJson(source);

    expect(pieces.map((piece) => piece.content).join("")).toBe(source);
    expect(pieces.filter((piece) => piece.type === "kind")).toHaveLength(1);
    expect(findEmbeddedKindJsonRegions('{"label":"__kind"}')).toEqual([]);
    expect(findEmbeddedKindJsonRegions('{"__kind":"unfinished".')).toEqual([]);
  });

  it("keeps a direct root kind as one canonical block", () => {
    const [block] = splitContentIntoBlocksV2(`\`\`\`json\n${FLASHCARDS}\n\`\`\``);
    expect(block?.content).toBe(FLASHCARDS);
    expect(readEnvelope(block?.metadata)?.root.kind).toBe("flashcard_set");
    expect(splitContentIntoBlocksV2(`\`\`\`json\n${FLASHCARDS}\n\`\`\``)).toHaveLength(
      1,
    );
  });
});
