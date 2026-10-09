/**
 * K5 (kind-never-raw round 7): THE FULL SEQUENCE a flashcard answer lives
 * through, drawn through EnhancedChatMarkdown over the production
 * `activeRequests` slice reducer —
 *
 *   1. LIVE: the real StreamBlockAccumulator ingests
 *      "prose\n\n```json\n{one-line flashcard_set}\n```" chunk by chunk and
 *      dispatches the real `upsertRenderBlock`; the message is drawn after
 *      every chunk, then after finalize.
 *   2. MATERIALIZATION: the settled message goes through the real
 *      `materializeBlocks` (planMaterialization + wrapArtifactText; only the
 *      canvas row write is a stand-in that returns a saved id), and the
 *      rewritten text — prose + `<artifact type="flashcards" id="<uuid>"
 *      version="1">` — is drawn the way a reloaded message is, with the saved
 *      row loading, loaded and missing.
 *
 * Every draw: no `__kind` on screen (text or attribute), the prose reads as
 * prose — never a "Code · 1 line" card — and the settled draws show the cards.
 */
// eslint-disable-next-line import/order -- the judge's mocks must register first
import { domElementVerdict, judgeReadsState } from "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React from "react";
import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  upsertRenderBlock,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.slice";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { EnhancedChatMarkdownInternal } from "@ai-matrx/chat/ui/markdown-stream/EnhancedChatMarkdown";
import { materializeBlocks } from "@/features/canvas/materialization/materializeBlocks";
import { chunkText } from "./seeded-random";

const SAVED_ID = "0b6f4c1e-7a2d-4e8b-9c3f-5d1a2e7b8c90";
const MESSAGE_ID = "7d2c9e41-3f6a-4b8d-a1c5-9e0f2b4d6a83";

type CanvasItem = { row: Record<string, unknown> | null; loading: boolean; error: string | null };
let mockCanvasItem: CanvasItem = { row: null, loading: false, error: "not found" };
const mockCanvasReads: string[] = [];
jest.mock("@/features/canvas/hooks/useCanvasItem", () => ({
  useCanvasItem: (id: string | null) => {
    if (!id) return { row: null, loading: false, error: null };
    mockCanvasReads.push(id);
    return mockCanvasItem;
  },
}));
// The canvas row write is the one stand-in: it answers with the saved id the
// database would return. Planning, the rewrite and the wire are all real.
jest.mock("@/features/canvas/services/canvasArtifactService", () => ({
  canvasArtifactService: {
    isReadableById: async () => true,
    upsertDiscoveryIndex: async () => undefined,
    upsertForSource: async () => ({ id: "0b6f4c1e-7a2d-4e8b-9c3f-5d1a2e7b8c90", version: 1, conversation_id: null }),
  },
}));
jest.mock("@/features/canvas/artifact-types/persistence/artifact-adapters", () => ({
  getAdapter: () => ({}),
}));

jest.setTimeout(480_000);

const CARDS: Array<[string, string]> = [
  ["What does the mitochondrion make?", "ATP"],
  ["Where is DNA stored in a eukaryotic cell?", "The nucleus"],
  ["What do ribosomes build?", "Proteins"],
];
const VALUE = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: CARDS.map(([front, back]) => ({ __kind: "flashcard", front, back })),
};
const PROSE = "Here are three flashcards on cell organelles to review before the quiz.";
const WIRE = `${PROSE}\n\n\`\`\`json\n${JSON.stringify(VALUE)}\n\`\`\``;

const REQ = "req-k5-sequence";
const store = configureStore({
  reducer: { activeRequests: activeRequestsReducer },
  middleware: (gDM) => gDM({ serializableCheck: false, immutableCheck: false }),
});

beforeAll(() => {
  judgeReadsState(() => ({
    ...(store.getState() as Record<string, unknown>),
    conversations: { byConversationId: {} },
    instanceUIState: { byConversationId: {} },
    messages: { byId: {}, byConversationId: {} },
  }));
});
afterAll(() => judgeReadsState(null));

function expectProseIsProse(text: string, where: string) {
  if (!text.includes(PROSE.slice(0, 30))) return;
  if (/\b1 line\b/.test(text)) throw new Error(`${where}: the prose was drawn as a one-line code card: ${text.slice(0, 200)}`);
}

async function draw(element: React.ReactElement, where: string) {
  const verdict = await domElementVerdict(element);
  if (verdict.raw) throw new Error(`${where}: a raw kind reached the screen: ${verdict.text.slice(0, 300)}`);
  expectProseIsProse(verdict.text, where);
  return verdict;
}

describe("stream → materialization: a flashcard answer is never raw", () => {
  let settledText = "";

  it("live: every chunk, then finalize, through EnhancedChatMarkdown over the real slice", async () => {
    store.dispatch(createRequest({ requestId: REQ, conversationId: "conv-k5" }) as never);
    const accumulator = new StreamBlockAccumulator(REQ, upsertRenderBlock as never);
    const dispatch = (action: unknown) => store.dispatch(action as never);
    let streamed = "";
    for (const chunk of chunkText(WIRE, 31, 17)) {
      accumulator.ingest(chunk, dispatch);
      streamed += chunk;
      await draw(
        <EnhancedChatMarkdownInternal content={streamed} requestId={REQ} isStreamActive hideCopyButton />,
        `live at ${streamed.length} chars`,
      );
    }
    accumulator.finalize(dispatch);
    const settled = await draw(
      <EnhancedChatMarkdownInternal content={WIRE} requestId={REQ} isStreamActive={false} hideCopyButton />,
      "settled",
    );
    expect(settled.text).toContain(PROSE);
    for (const [front] of CARDS) expect(settled.text).toContain(front);
    settledText = settled.text;
  });

  let rewritten = "";
  it("materialization: the real rewrite turns the fence into the id-bearing artifact tag", async () => {
    const result = await materializeBlocks({
      source: { system: "cx_message", id: MESSAGE_ID, conversationId: null },
      content: [{ type: "text", text: WIRE }] as never,
    });
    expect(result.errors).toEqual([]);
    const blocks = (result.rewrittenContent ?? []) as Array<{ type: string; text?: string }>;
    rewritten = blocks.map((b) => b.text ?? "").join("\n\n");
    expect(rewritten).toContain(PROSE);
    expect(rewritten).toMatch(new RegExp(`<artifact type="flashcards" id="${SAVED_ID}" version="1"`));
  });

  it.each([
    ["row loading", { row: null, loading: true, error: null }],
    [
      "row loaded",
      {
        row: {
          id: SAVED_ID,
          type: "flashcards",
          version: 1,
          title: "Cell biology",
          content: { data: VALUE, type: "flashcards" },
        },
        loading: false,
        error: null,
      },
    ],
    ["row missing", { row: null, loading: false, error: "not found" }],
  ] as Array<[string, CanvasItem]>)("the materialized message, %s", async (state, item) => {
    expect(rewritten).not.toBe("");
    mockCanvasItem = item;
    mockCanvasReads.length = 0;
    const verdict = await draw(
      <EnhancedChatMarkdownInternal content={rewritten} messageId={MESSAGE_ID} isStreamActive={false} hideCopyButton />,
      `materialized (${state})`,
    );
    expect(mockCanvasReads).toContain(SAVED_ID);
    expect(verdict.text).toContain(PROSE);
    if (state !== "row loading") {
      for (const [front] of CARDS) expect(verdict.text).toContain(front);
    }
    if (state === "row loaded") expect(settledText).not.toBe("");
  });
});
