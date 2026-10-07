/**
 * Round 3 of "a __kind is never shown raw" — X3, X4 and the X-minor items an
 * independent attacker confirmed. Every stream runs one character at a time
 * through the REAL accumulator; every frame is judged by the one frame judge
 * (`decideBlockRender`), and every settled block by the reload's splitter.
 */

import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/content-splitter-v2";
import { configureServerForTest } from "@ai-matrx/chat/testing/server-test-host";
import { appChatServerApi } from "@/lib/api/chat-server-api";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { decideBlockRender } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { GENERIC_STRUCTURED_COMPONENT_KEY } from "@ai-matrx/rich-content/kinds/react/kind-route";
import { drawsKindAsRawJson } from "../render-paths/draws-raw-kind-json";
import { hasKindKey, jsonKindSignal } from "../surfaces/json-kind-signal";

beforeAll(() => {
  configureServerForTest(appChatServerApi);
});

const KIND = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cells",
  cards: [{ __kind: "flashcard", front: "Mitochondria", back: "Makes ATP" }],
});

/** Every frame's latest blocks, char by char; optionally finalized. */
function run(stream: string, requestId: string, finalize = false) {
  const latest = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    const block = (payload as { block: RenderBlockPayload }).block;
    latest.set(block.blockId, block);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  const raw: string[] = [];
  for (const ch of stream) {
    accumulator.ingest(ch, dispatch);
    for (const b of latest.values()) {
      if (drawsKindAsRawJson(b, { isStreamActive: true })) {
        raw.push(`${b.type}: ${(b.content ?? "").slice(0, 50)}`);
      }
    }
  }
  if (finalize) accumulator.finalize(dispatch);
  const settled = [...latest.values()]
    .filter((b) => (b.content ?? "").trim())
    .sort((a, b) => a.blockIndex - b.blockIndex);
  return { raw: [...new Set(raw)], settled };
}

/** The reload's blocks, as BlockRenderer receives them. */
function reloadDecisions(stream: string) {
  return splitContentIntoBlocksV2(stream)
    .filter((b) => b.content.trim())
    .map((b) => decideBlockRender(b as never, { isStreamActive: false }));
}

describe("X3: a JSONC fence that opens with a comment decides on its first key", () => {
  it.each([
    ["```jsonc // line", `Here:\n\n\`\`\`jsonc\n// the cards\n${KIND}\n\`\`\`\n`],
    ["```json /* block */", `Here:\n\n\`\`\`json\n/* the cards */\n${KIND}\n\`\`\`\n`],
    ["``` unlabelled // line", `Here:\n\n\`\`\`\n// the cards\n${KIND}\n\`\`\`\n`],
  ])("%s: no frame draws the raw JSON card", (label, stream) => {
    expect(run(stream, `req-x3-${label}`).raw).toEqual([]);
  });

  it("the detector reads past leading comments; kindless commented JSON is still JSON", () => {
    expect(jsonKindSignal(`// note\n/* more */\n{"__kind":"x"}`)).toBe("kind");
    expect(jsonKindSignal(`// note\n{"title":"x"}`)).toBe("not_kind");
    expect(jsonKindSignal(`// still arriv`)).toBe("undecided");
  });
});

describe("X4: a __kind key with no readable slug is broken structured output (ruling c)", () => {
  const BODIES: Array<[string, string]> = [
    ["number", '{"__kind":5,"title":"T"}'],
    ["null", '{"__kind":null,"title":"T"}'],
    ["empty", '{"__kind":"","title":"T"}'],
    ["not a slug", '{"__kind":"My Kind!","title":"T"}'],
    ["cut in the name window", '{"__kind":"flashc'],
  ];

  it.each(BODIES)("%s: live and on reload, the generic broken floor — never the raw card", (label, body) => {
    const stream = `Here:\n\n\`\`\`json\n${body}${body.endsWith("}") ? "\n```\n\nAfter." : ""}`;
    const { raw, settled } = run(stream, `req-x4-${label}`, true);
    expect(raw).toEqual([]);
    const live = settled.find((b) => hasKindKey(b.content ?? ""))!;
    const liveDecision = decideBlockRender(renderBlockToContentBlock(live), { isStreamActive: false });
    expect(liveDecision.block.type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
    expect(drawsKindAsRawJson(live, { isStreamActive: false })).toBe(false);
    const reload = reloadDecisions(stream).find((d) => hasKindKey(d.block.content ?? ""))!;
    expect(reload.block.type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
  });

  it("a fence of another language is quoted source — untouched", () => {
    const decision = reloadDecisions('```ts\nconst x = {"__kind":5};\n```').find((d) =>
      hasKindKey(d.block.content ?? ""),
    )!;
    expect(decision.block.type).toBe("code");
  });
});

describe("X-minor", () => {
  it("a one-line <details> holding a kind is never raw mid-stream", () => {
    const stream = `<details><summary>Cards</summary>${KIND}</details>\n\nDone.`;
    expect(run(stream, "req-xm-details").raw).toEqual([]);
  });

  it("a table cell holding a kind is never raw mid-stream", () => {
    const stream = `| Name | Value |\n| --- | --- |\n| x | ${KIND} |\n\nDone.`;
    expect(run(stream, "req-xm-table").raw).toEqual([]);
  });

  it("a ```json5 kind with an unquoted __kind key is detected (json5 only)", () => {
    const stream = `Here:\n\n\`\`\`json5\n{__kind: "flashcard_set", title: "Cells", cards: []}\n\`\`\`\n`;
    const { raw, settled } = run(stream, "req-xm-json5", true);
    expect(raw).toEqual([]);
    const block = settled.find((b) => /__kind/.test(b.content ?? ""))!;
    expect(drawsKindAsRawJson(block, { isStreamActive: false })).toBe(false);
    const decision = decideBlockRender(renderBlockToContentBlock(block), { isStreamActive: false });
    expect(decision.block.type).not.toBe("code");
    // Plain JSON never accepts an unquoted key.
    expect(hasKindKey('{__kind: "x"}')).toBe(false);
  });

  it("a front-matter kind is document properties: hidden live and on reload, and the judge agrees", () => {
    const stream = `---\nmeta: ${KIND}\n---\n\n# Title\n\nBody.`;
    const { raw, settled } = run(stream, "req-xm-front", true);
    expect(raw).toEqual([]);
    for (const b of settled) expect(drawsKindAsRawJson(b, { isStreamActive: false })).toBe(false);
    for (const d of reloadDecisions(stream)) {
      expect(d.block.type === "code" && hasKindKey(d.block.content ?? "")).toBe(false);
    }
  });
});
