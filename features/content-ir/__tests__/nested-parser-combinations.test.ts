import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { chunkText } from "./seeded-random";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { expandTextBlocksInList } from "@/components/mardown-display/markdown-classification/processors/utils/expand-text-blocks";
import type { RenderBlock } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";

const SEED = 90211;
const FENCE = "`".repeat(3);
const OUTER_FENCE = "`".repeat(4);
const parents = [
  [
    "generic XML",
    (x: string) => `<custom><inner>${x}</inner></custom>`,
    "code",
  ],
  [
    "nested XML",
    (x: string) => `<outer><inner><leaf>${x}</leaf></inner></outer>`,
    "code",
  ],
  ["thinking", (x: string) => `<thinking>${x}</thinking>`, "thinking"],
  ["info", (x: string) => `<info>${x}</info>`, "info"],
  [
    "Markdown fence",
    (x: string) => `${OUTER_FENCE}markdown\n${x}\n${OUTER_FENCE}`,
    "code",
  ],
  [
    "code fence",
    (x: string) =>
      `${FENCE}typescript\nconst x = ${JSON.stringify(x)};\n${FENCE}`,
    "code",
  ],
  [
    "artifact wrapper",
    (x: string) => `<artifact><content>${x}</content></artifact>`,
    "artifact",
  ],
  [
    "JSON fence",
    (x: string) => `${FENCE}json\n{"payload":${JSON.stringify(x)}}\n${FENCE}`,
    "code",
  ],
] as const;
const children = [
  ["bold", "**bold child**"],
  ["list", "- one\n- two"],
  ["table", "| a | b |\n| - | - |\n| 1 | 2 |"],
  ["inline code", "`inline`"],
  ["fenced code", `${FENCE}js\nalert(1)\n${FENCE}`],
  ["registered kind", '{"__kind":"flashcard_set","title":"probe","cards":[]}'],
  ["artifact ref", '{"file_ref":"probe-file","url":"https://example.com/x"}'],
  ["raw HTML", "<table><tr><td>html</td></tr></table>"],
] as const;

// Compare the actual renderer-facing transport adapters, not raw wire records:
// empty text tombstones disappear; language moves from data; text is expanded.
function rendererBlocks(source: string, seed: number) {
  const latest = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator("nested-probe", (payload) => {
    latest.set(payload.block.blockId, payload.block);
    return payload;
  });
  const dispatch = (action: unknown) => action;
  for (const part of chunkText(source, seed ^ SEED, 13))
    accumulator.ingest(part, dispatch);
  accumulator.finalize(dispatch);
  return expandTextBlocksInList(
    [...latest.values()]
      .sort((a, b) => a.blockIndex - b.blockIndex)
      .map(renderBlockToContentBlock),
  );
}

function comparable(blocks: readonly RenderBlock[]) {
  return blocks
    .filter((block) => block.content?.trim())
    .map((block) => ({
      type: block.type,
      language: block.language ?? null,
      // Artifact transport includes the outer tag on the live path and stores it
      // in metadata on both paths. Compare its canonical raw source and keep its
      // owner type, not the generated per-message artifact index/identity.
      content: (block.type === "artifact" &&
      typeof block.metadata?.rawXml === "string"
        ? block.metadata.rawXml
        : block.content
      ).trim(),
    }));
}

const cases = parents.flatMap(([parent, wrap, expectedType]) =>
  children.map(([childName, child]) => ({
    parent,
    wrap,
    expectedType,
    childName,
    child,
  })),
);

describe("nested parser combinations", () => {
  it.each(cases)(
    "$parent containing $childName survives seeded chunks with the same renderer-facing output",
    ({ parent, wrap, child, childName, expectedType }) => {
      const source = wrap(`\n${child}\n`);
      const staticBlocks = splitContentIntoBlocksV2(source);
      const expected = comparable(staticBlocks);
      // Independent ownership assertion: source and artifact wrappers must never
      // recursively promote a kind-like string into another artifact/component.
      if (
        parent === "code fence" ||
        parent === "JSON fence" ||
        parent === "artifact wrapper"
      ) {
        expect(expected).toHaveLength(1);
        expect(expected[0].type).toBe(expectedType);
        const fragment =
          parent === "artifact wrapper"
            ? child
            : JSON.stringify(`\n${child}\n`);
        expect(expected[0].content).toContain(fragment);
      } else if (childName !== "registered kind") {
        expect(expected[0].type).toBe(expectedType);
        expect(expected.map((block) => block.content).join("\n")).toContain(
          child,
        );
      } else {
        expect(
          expected.some(
            (block) => block.language === "json" && block.content === child,
          ),
        ).toBe(true);
      }
      for (let seed = 1; seed <= 8; seed++) {
        expect({
          seed,
          blocks: comparable(rendererBlocks(source, seed)),
        }).toEqual({ seed, blocks: expected });
      }
    },
  );
});
