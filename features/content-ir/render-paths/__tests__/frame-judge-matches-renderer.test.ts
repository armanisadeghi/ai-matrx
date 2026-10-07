/**
 * V5 — the frame judge asks BlockRenderer's own decision (`decideBlockRender`)
 * and follows the dispatch registry after it:
 *  (a) the MESSAGE's stream state, not the block's — a settled block inside a
 *      still-streaming message is judged the way it is drawn;
 *  (b) a prose block still holding a kind region is raw;
 *  (c) a code block a language renderer owns (```markdown → MarkdownPreview)
 *      or that is quoted source (```ts) is not a raw kind.
 */

import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { drawsKindAsRawJson, drawsRawJsonCard } from "../draws-raw-kind-json";
import { decideBlockRender } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { readEnvelope } from "@ai-matrx/rich-content/kinds/redux/render-block-envelope";

const KIND = '{"__kind":"flashcard_set","title":"Cells","cards":[{"__kind":"flashcard","front":"Q","back":"A"}]}';

function block(
  type: string,
  content: string,
  status: "streaming" | "complete",
  language?: string,
): RenderBlockPayload {
  return {
    blockId: "b0",
    blockIndex: 0,
    type,
    status,
    content,
    data: language === undefined ? null : { language },
    metadata: undefined,
  } as RenderBlockPayload;
}

describe("the frame judge follows the renderer (V5)", () => {
  it.each([
    ["jsonc", "jsonc"],
    ["json5", "json5"],
    ["unlabelled", ""],
  ])(
    "(a) a SETTLED ```%s kind with no envelope, inside a still-streaming message, is never raw",
    (_label, language) => {
      const settled = block("code", KIND, "complete", language);
      expect(drawsKindAsRawJson(settled, { isStreamActive: true })).toBe(false);
      expect(drawsKindAsRawJson(settled, { isStreamActive: false })).toBe(false);
    },
  );

  it("(a) a settled kindless JSON block in a streaming message is genuine JSON", () => {
    const settled = block("code", '{"name":"Ada"}', "complete", "json");
    expect(drawsRawJsonCard(settled, { isStreamActive: true })).toBe(true);
  });

  it.each([
    ["prose then the kind", `It returned ${KIND} without a fence.`, true],
    ["a table cell", `| a | ${KIND} |`, true],
    ["an inline code span", `Use \`${KIND}\` to route it.`, false],
    ["prose naming the key", 'The "__kind" key names it.', false],
  ])("(b) a text block holding %s → raw: %s", (_label, content, raw) => {
    expect(drawsKindAsRawJson(block("text", content, "complete"))).toBe(raw);
  });

  it.each([
    ["markdown", false],
    ["md", false],
    ["ts", false],
    ["xml", false],
  ])("(c) a settled ```%s block holding a kind → raw: %s", (language, raw) => {
    const settled = block("code", KIND, "complete", language);
    expect(drawsKindAsRawJson(settled, { isStreamActive: false })).toBe(raw);
  });

  it.each([["jsonc"], ["json5"], [""]])(
    "(a) a settled ```%s kind routes the same whether its message still streams or not",
    (language) => {
      const settled = renderBlockToContentBlock(block("code", KIND, "complete", language));
      const live = decideBlockRender(settled, { isStreamActive: true }).block;
      const done = decideBlockRender(settled, { isStreamActive: false }).block;
      expect(live.type).toBe(done.type);
      expect(readEnvelope(live.metadata)?.root.status).toBe(
        readEnvelope(done.metadata)?.root.status,
      );
    },
  );
});
