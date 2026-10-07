/**
 * X1 — A KIND INSIDE AN XML TAG IS DATA (owner ruling (b), round 3).
 *
 * An XML tag the model wraps content in — `<answer>`, `<result>`, `<output>`,
 * any generic/unknown tag, with attributes, nested, closed or never closed —
 * is STRUCTURE, not quoted source. A kind inside it renders as the kind, live
 * and on reload. (A ```xml FENCE and an inline code span stay quoted source —
 * ruling (a), unchanged.)
 *
 * The attacker's finding: 36/46 frames drew the kind inside the XML card in
 * source view; a short ```json fence inside a closed `<output>` and a short
 * kind in a never-closed tag stayed raw for good.
 *
 * Drives the REAL accumulator one character at a time and the REAL static
 * splitter; judges every frame through the one frame judge.
 */

import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/content-splitter-v2";
import { configureServerForTest } from "@ai-matrx/chat/testing/server-test-host";
import { appChatServerApi } from "@/lib/api/chat-server-api";
import { drawsKindAsRawJson } from "../render-paths/draws-raw-kind-json";
import { hasKindKey, isQuotedSourceXmlBlock } from "../surfaces/json-kind-signal";

beforeAll(() => {
  configureServerForTest(appChatServerApi);
});

const KIND = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cells",
  cards: [{ __kind: "flashcard", front: "Mitochondria", back: "Makes ATP" }],
});
const PRETTY = JSON.stringify(JSON.parse(KIND), null, 2);

const CASES: Array<[string, string]> = [
  ["closed <output>, bare one-line", `Intro.\n<output>\n${KIND}\n</output>\nDone.`],
  ["closed <output>, bare pretty", `Intro.\n<output>\n${PRETTY}\n</output>\nDone.`],
  ["closed <output>, short ```json fence", `Intro.\n<output>\n\`\`\`json\n${KIND}\n\`\`\`\n</output>\nDone.`],
  ["closed <result>, unlabelled pretty fence", `<result>\n\`\`\`\n${PRETTY}\n\`\`\`\n</result>`],
  ["nested tags with attributes", `<answer format="cards">\n<result id="1">\n${KIND}\n</result>\n</answer>\nDone.`],
  ["never-closed <output>, bare", `<output>\n${KIND}`],
  ["never-closed <output>, fence", `<output>\n\`\`\`json\n${KIND}\n\`\`\``],
  ["unknown tag, prose around the kind", `<my-notes>\nSome notes first.\n${KIND}\nMore notes.\n</my-notes>`],
];

type Frame = { blocks: RenderBlockPayload[]; prefix: string };

/** Every ingest's full block list (latest payload per block id), char by char. */
function streamFrames(stream: string, requestId: string, finalize = false) {
  const latest = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    const block = (payload as { block: RenderBlockPayload }).block;
    latest.set(block.blockId, block);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  const frames: Frame[] = [];
  let prefix = "";
  for (const ch of stream) {
    prefix += ch;
    accumulator.ingest(ch, dispatch);
    frames.push({ blocks: [...latest.values()], prefix });
  }
  if (finalize) accumulator.finalize(dispatch);
  const settled = [...latest.values()]
    .filter((b) => (b.content ?? "").trim())
    .sort((a, b) => a.blockIndex - b.blockIndex);
  return { frames, settled };
}

const isXmlCode = (b: { type: string; data?: unknown; language?: string }) =>
  b.type === "code" &&
  ((b.data as { language?: string } | null)?.language ?? b.language) === "xml";

describe("X1: a kind inside an XML tag streams as its kind, never inside the XML card", () => {
  it.each(CASES)("%s: once __kind is visible, no XML card holds it", (label, stream) => {
    const { frames } = streamFrames(stream, `req-x1-${label}`);
    const offending = frames
      .filter((f) => hasKindKey(f.prefix))
      .flatMap((f) => f.blocks.filter((b) => isXmlCode(b) && hasKindKey(b.content ?? "")))
      .map((b) => (b.content ?? "").slice(0, 50));
    expect(offending).toEqual([]);
  });

  it.each(CASES)("%s: no frame draws the kind raw (the frame judge)", (label, stream) => {
    const { frames } = streamFrames(stream, `req-x1j-${label}`);
    const raw = frames.flatMap((f) =>
      f.blocks.filter((b) => drawsKindAsRawJson(b, { isStreamActive: true })),
    );
    expect(raw.map((b) => `${b.type}: ${(b.content ?? "").slice(0, 40)}`)).toEqual([]);
  });

  it.each(CASES)("%s: settled live blocks = reload, the kind is its own block", (label, stream) => {
    const shape = (b: { type: string; content?: string | null }) =>
      `${b.type}:${(b.content ?? "").trim().slice(0, 40)}`;
    const { settled } = streamFrames(stream, `req-x1f-${label}`, true);
    const reloaded = splitContentIntoBlocksV2(stream).filter((b) => b.content.trim());
    expect(settled.map(shape)).toEqual(reloaded.map(shape));
    expect(reloaded.filter((b) => hasKindKey(b.content) && !isXmlCode(b))).toHaveLength(1);
    expect(reloaded.filter((b) => isXmlCode(b) && hasKindKey(b.content))).toEqual([]);
    // Every XML piece left is STRUCTURE (the card draws kinds as kinds), live and on reload.
    for (const b of reloaded.filter(isXmlCode)) expect(isQuotedSourceXmlBlock(b)).toBe(false);
    for (const b of settled.filter(isXmlCode)) expect(isQuotedSourceXmlBlock(b)).toBe(false);
  });
});

describe("X1: ruling (a) is unchanged — a ```xml fence is quoted source", () => {
  const QUOTED = `Example:\n\`\`\`xml\n<output>\n${KIND}\n</output>\n\`\`\`\nDone.`;

  it("the fence keeps the kind as written, live and on reload", () => {
    const { settled } = streamFrames(QUOTED, "req-x1-quoted", true);
    const reloaded = splitContentIntoBlocksV2(QUOTED).filter((b) => b.content.trim());
    const xml = reloaded.find(isXmlCode);
    expect(xml && hasKindKey(xml.content)).toBe(true);
    expect(isQuotedSourceXmlBlock(xml!)).toBe(true);
    const live = settled.find(isXmlCode);
    expect(live && hasKindKey(live.content ?? "")).toBe(true);
    expect(isQuotedSourceXmlBlock(live!)).toBe(true);
  });

  it("kindless XML still renders as the XML card", () => {
    const stream = `<output>\n<item>one</item>\n</output>`;
    const reloaded = splitContentIntoBlocksV2(stream).filter((b) => b.content.trim());
    expect(reloaded.map((b) => b.type)).toEqual(["code"]);
    expect(reloaded[0]!.content).toBe(stream);
  });
});
