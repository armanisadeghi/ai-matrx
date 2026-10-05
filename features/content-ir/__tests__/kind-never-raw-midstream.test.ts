/**
 * THE NEVER-RAW LAW, mid-stream (Arman, 2026-09-30, after a floating agent
 * chat showed a streaming `flashcard_set` as a raw ```json card).
 *
 * The phases, in Arman's words:
 *   1. The moment it COULD be a kind, it displays as a kind (its loader).
 *   2. The moment we know WHICH kind, it switches to that kind.
 *   3. The moment we know it is broken or not a kind, it is handled properly.
 * A JSON region whose FIRST KEY is not `__kind` (and carries no `__kind`) is
 * genuinely JSON and may render as JSON — but never before its first key has
 * arrived, and never once a `__kind` key has been seen.
 *
 * This drives the REAL accumulator CHARACTER BY CHARACTER and asks, for every
 * frame, the same question BlockRenderer asks: after the kind route and the
 * pending gate, would this block fall through to the raw JSON code card?
 *
 * The reported defect: the model wrote the whole payload on ONE line inside
 * the fence. Fence regions were fed to the parser line-by-line only, so the
 * line never completed and `__kind` was never seen until the fence closed.
 */

// G2: the DOM judge first — its mocks must register before BlockRenderer loads.
import { domFrameVerdict, sampleKindFrames } from "../render-paths/__tests__/dom-frame-judge";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { drawsKindAsRawJson, drawsRawJsonCard } from "../render-paths/draws-raw-kind-json";
import { applyIrKindRoute } from "../react/kind-route";
import { hasKindKey } from "../surfaces/json-kind-signal";
import { componentRegistry } from "../registry/component-registry";
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from "node:util";
import activeRequestsReducer, {
  createRequest,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.slice";
import {
  discardRetainedTransportConsumer,
  hasRetainedTransportConsumer,
  processStream,
} from "@ai-matrx/chat/agents/redux/execution-system/thunks/process-stream";
import type { RootState } from "@/lib/redux/store";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { configureServerForTest } from "@ai-matrx/chat/host/__tests__/server-test-host";
import { appChatServerApi } from "@/lib/api/chat-server-api";

// Server calls reach the host's server client through the server port (P9).
beforeAll(() => {
  configureServerForTest(appChatServerApi);
});


type Upsert = { requestId: string; block: RenderBlockPayload };

const KIND_PAYLOAD_ONE_LINE = JSON.stringify({
  __kind: "flashcard_set",
  title: "Flashcards",
  cards: [
    {
      __kind: "flashcard",
      front: "Polyatomic Ion",
      back: "An electrically charged group of two or more covalently bonded atoms that carries a net positive or negative charge and acts as a single unit in chemical reactions.",
    },
    {
      __kind: "flashcard",
      front: "Oxoanion",
      back: "A polyatomic anion that contains oxygen atoms chemically bonded to another element.",
    },
    {
      __kind: "flashcard",
      front: 'Naming Rule:\n"-ate" vs. "-ite" Suffixes',
      back: '- "-ate" refers to the standard or base oxoanion form.\n- "-ite" refers to an oxoanion with exactly one less oxygen atom than the "-ate" form, while retaining the same overall charge.',
    },
  ],
});

const KIND_LATE_KEY_ONE_LINE = JSON.stringify({
  title: "Flashcards",
  __kind: "flashcard_set",
  cards: [{ __kind: "flashcard", front: "A", back: "B".repeat(400) }],
});

const KINDLESS_ONE_LINE = JSON.stringify({
  title: "Just data",
  rows: Array.from({ length: 30 }, (_, i) => ({ id: i, name: `row ${i}` })),
});

/** Every stream this file drives — the DOM judge (G2, last describe) draws them all. */
const STREAMS_SEEN = new Set<string>();

/** Stream one character at a time; return every upsert in order. */
function streamCharByChar(stream: string, requestId: string): Upsert[] {
  STREAMS_SEEN.add(stream);
  const upserts: Upsert[] = [];
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    upserts.push(payload as Upsert);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const ch of stream) accumulator.ingest(ch, dispatch);
  return upserts; // NO finalize — every frame is a live, mid-stream frame
}

/** BlockRenderer's question, asked through the ONE shared answer. */
const rendersRawJson = (block: RenderBlockPayload) => drawsRawJsonCard(block);

/** Stream one character at a time, FINALIZE, return the last frame per block. */
function finalBlocks(stream: string, requestId: string): RenderBlockPayload[] {
  STREAMS_SEEN.add(stream);
  const upserts: Upsert[] = [];
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    upserts.push(payload as Upsert);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const ch of stream) accumulator.ingest(ch, dispatch);
  accumulator.finalize(dispatch);
  const last = new Map<string, RenderBlockPayload>();
  for (const { block } of upserts) last.set(block.blockId, block);
  return [...last.values()]
    .filter((b) => (b.content ?? "").trim())
    .sort((a, b) => a.blockIndex - b.blockIndex);
}

function jsonFrames(upserts: Upsert[]): RenderBlockPayload[] {
  return upserts
    .map((u) => u.block)
    .filter((b) => b.type !== "text" && b.status === "streaming");
}

const FENCES: Array<[string, (body: string) => string]> = [
  ["```json", (b) => `Here you go:\n\n\`\`\`json\n${b}`],
  ["```JSON", (b) => `Here you go:\n\n\`\`\`JSON\n${b}`],
  ["bare", (b) => `Here you go:\n\n${b}`],
];

/** Fences no parser opens for — the renderer's first-key gate alone holds. */
const UNPARSED_FENCES: Array<[string, (body: string) => string]> = [
  ["``` (no language)", (b) => `Here you go:\n\n\`\`\`\n${b}`],
  ["```jsonc", (b) => `Here you go:\n\n\`\`\`jsonc\n${b}`],
  ["```json5", (b) => `Here you go:\n\n\`\`\`json5\n${b}`],
];

describe("never raw mid-stream: a __kind region is a kind from its first key", () => {
  it.each(FENCES)(
    "%s one-line flashcard_set: no frame ever draws the raw JSON card",
    (_label, wrap) => {
      const frames = jsonFrames(
        streamCharByChar(wrap(KIND_PAYLOAD_ONE_LINE), `req-oneline-${_label}`),
      );
      expect(frames.length).toBeGreaterThan(0);
      const raw = frames.filter(rendersRawJson);
      expect(raw.map((b) => (b.content ?? "").slice(0, 60))).toEqual([]);
    },
  );

  it.each(FENCES)(
    "%s one-line payload with __kind as a LATER key: raw only before __kind, never after",
    (_label, wrap) => {
      const frames = jsonFrames(
        streamCharByChar(wrap(KIND_LATE_KEY_ONE_LINE), `req-late-${_label}`),
      );
      const afterKind = frames.filter((b) =>
        (b.content ?? "").includes('"__kind":"flashcard_set"'),
      );
      expect(afterKind.length).toBeGreaterThan(0);
      expect(afterKind.filter(rendersRawJson)).toEqual([]);
    },
  );

  it.each(FENCES)(
    "%s kindless JSON: holds before the first key, then streams live as JSON",
    (_label, wrap) => {
      const frames = jsonFrames(
        streamCharByChar(wrap(KINDLESS_ONE_LINE), `req-kindless-${_label}`),
      );
      // Before the first key completes, nothing raw may show.
      const beforeFirstKey = frames.filter(
        (b) => !(b.content ?? "").includes('"title"'),
      );
      expect(beforeFirstKey.filter(rendersRawJson)).toEqual([]);
      // Well after the first key, a genuinely kindless region streams as JSON
      // (a loader is a promise of a component, never a lid over content).
      const late = frames.filter((b) => (b.content ?? "").length > 120);
      expect(late.length).toBeGreaterThan(0);
      expect(late.every(rendersRawJson)).toBe(true);
    },
  );

  it.each(UNPARSED_FENCES)(
    "%s one-line flashcard_set: no frame ever draws the raw JSON card",
    (_label, wrap) => {
      const frames = jsonFrames(
        streamCharByChar(wrap(KIND_PAYLOAD_ONE_LINE), `req-unparsed-${_label}`),
      );
      expect(frames.length).toBeGreaterThan(0);
      expect(
        frames.filter(rendersRawJson).map((b) => (b.content ?? "").slice(0, 40)),
      ).toEqual([]);
    },
  );
});

describe("never raw: ~~~ is a real fence (A4)", () => {
  const PRETTY = JSON.stringify(JSON.parse(KIND_PAYLOAD_ONE_LINE), null, 2);
  it.each([
    ["~~~json one-line", `Here you go:\n\n~~~json\n${KIND_PAYLOAD_ONE_LINE}\n~~~\n\nAfter.`],
    ["~~~json pretty", `Here you go:\n\n~~~json\n${PRETTY}\n~~~\n\nAfter.`],
    ["~~~~JSON long run", `Here you go:\n\n~~~~JSON\n${PRETTY}\n~~~~\n\nAfter.`],
  ])("%s: no raw frame, the fence opens a json region, no stray ~~~ chrome", (_label, stream) => {
    const frames = jsonFrames(streamCharByChar(stream, `req-tilde-${_label}`));
    expect(frames.filter(rendersRawJson).map((b) => (b.content ?? "").slice(0, 40))).toEqual([]);

    const blocks = finalBlocks(stream, `req-tilde-final-${_label}`);
    expect(blocks.filter((b) => (b.content ?? "").includes("~~~"))).toEqual([]);
    const kindBlock = blocks.find((b) => (b.content ?? "").includes('"__kind"'));
    expect(kindBlock?.data).toEqual(expect.objectContaining({ language: expect.stringMatching(/^json$/i) }));
    expect(blocks.map((b) => (b.content ?? "").trim())).toEqual(["Here you go:", kindBlock?.content, "After."]);

    // Reload (the static splitter) opens the same fence — same blocks.
    const reloaded = splitContentIntoBlocksV2(stream).filter((b) => b.content.trim());
    expect(reloaded.map((b) => b.content.trim())).toEqual(["Here you go:", kindBlock?.content, "After."]);
    expect(reloaded[1]?.language?.toLowerCase()).toBe("json");
  });
});

/** A prose (text) frame that prints a `__kind` key prints raw kind JSON. */
function textShowsRawKind(block: RenderBlockPayload): boolean {
  return block.type === "text" && hasKindKey(block.content ?? "");
}

function streamingFrames(upserts: Upsert[]): RenderBlockPayload[] {
  return upserts.map((u) => u.block).filter((b) => b.status === "streaming");
}

describe("never raw: a kind on the same line as prose (A5)", () => {
  const SAME_LINE = `Here you go: ${KIND_PAYLOAD_ONE_LINE}\nAfter.`;

  it("char by char: once __kind is visible, no frame prints it as prose or a raw card", () => {
    const frames = streamingFrames(streamCharByChar(SAME_LINE, "req-same-line"));
    const afterKind = frames.filter((b) => hasKindKey(b.content ?? ""));
    expect(afterKind.length).toBeGreaterThan(0);
    expect(afterKind.filter(textShowsRawKind).map((b) => (b.content ?? "").slice(0, 40))).toEqual([]);
    expect(afterKind.filter(rendersRawJson).map((b) => (b.content ?? "").slice(0, 40))).toEqual([]);
  });

  it("a whole line arriving at once (then more prose) is split live, not at stream end", () => {
    const upserts: Upsert[] = [];
    const accumulator = new StreamBlockAccumulator("req-same-line-chunk", (payload) => {
      upserts.push(payload as Upsert);
      return payload;
    });
    const dispatch = (action: unknown) => action;
    accumulator.ingest(`Here you go: ${KIND_PAYLOAD_ONE_LINE} — enjoy.\n`, dispatch);
    accumulator.ingest("More prose that keeps the text block open", dispatch);
    const frames = upserts.map((u) => u.block);
    expect(frames.filter(textShowsRawKind).map((b) => (b.content ?? "").slice(0, 40))).toEqual([]);
    const kindFrame = frames.find((b) => (b.content ?? "") === KIND_PAYLOAD_ONE_LINE);
    expect(kindFrame).toBeDefined();
  });

  it("final blocks: prose, the kind, the trailing prose — identical on reload", () => {
    const blocks = finalBlocks(SAME_LINE, "req-same-line-final");
    expect(blocks.map((b) => (b.content ?? "").trim())).toEqual([
      "Here you go:",
      KIND_PAYLOAD_ONE_LINE,
      "After.",
    ]);
    const reloaded = splitContentIntoBlocksV2(SAME_LINE).filter((b) => b.content.trim());
    expect(reloaded.map((b) => b.content.trim())).toEqual([
      "Here you go:",
      KIND_PAYLOAD_ONE_LINE,
      "After.",
    ]);
  });
});

describe("never raw: an array of kinds (A6)", () => {
  const SECOND = JSON.stringify({
    __kind: "flashcard_set",
    title: "Second set",
    cards: [{ __kind: "flashcard", front: "Q", back: "A" }],
  });
  const ONE_LINE = `[${KIND_PAYLOAD_ONE_LINE},${SECOND}]`;
  const PRETTY = JSON.stringify(
    [JSON.parse(KIND_PAYLOAD_ONE_LINE), JSON.parse(SECOND)],
    null,
    2,
  );
  const CASES: Array<[string, string]> = [
    ["bare one-line array", `Here you go:\n\n${ONE_LINE}\n\nAfter.`],
    ["bare pretty array", `Here you go:\n\n${PRETTY}\n\nAfter.`],
    ["```json one-line array", `Here you go:\n\n\`\`\`json\n${ONE_LINE}\n\`\`\`\n\nAfter.`],
    ["```json pretty array", `Here you go:\n\n\`\`\`json\n${PRETTY}\n\`\`\`\n\nAfter.`],
  ];

  it.each(CASES)("%s: no frame draws raw JSON once __kind is visible", (_label, stream) => {
    const frames = streamingFrames(streamCharByChar(stream, `req-array-${_label}`));
    const bad = frames.filter(
      (b) =>
        (b.type === "text" ? textShowsRawKind(b) : rendersRawJson(b)) &&
        // before the first element's first key it may not show either
        true,
    );
    expect(bad.map((b) => `${b.type}: ${(b.content ?? "").slice(0, 40)}`)).toEqual([]);
  });

  it.each(CASES)("%s: final blocks are the kinds alone — no [ , ] cards — identical on reload", (_label, stream) => {
    const expected = ["Here you go:", "flashcard_set:Flashcards", "flashcard_set:Second set", "After."];
    const label = (content: string) => {
      const t = content.trim();
      if (!t.startsWith("{")) return t;
      const v = JSON.parse(t) as { __kind: string; title: string };
      return `${v.__kind}:${v.title}`;
    };
    const blocks = finalBlocks(stream, `req-array-final-${_label}`);
    expect(blocks.map((b) => label(b.content ?? ""))).toEqual(expected);
    const reloaded = splitContentIntoBlocksV2(stream).filter((b) => b.content.trim());
    expect(reloaded.map((b) => label(b.content))).toEqual(expected);
  });

  it("a kindless array of objects stays ONE JSON value (it is genuine JSON)", () => {
    const stream = `Rows:\n\n\`\`\`json\n[{"id":1},{"id":2}]\n\`\`\`\n`;
    const blocks = finalBlocks(stream, "req-array-kindless");
    expect(blocks.map((b) => (b.content ?? "").trim())).toEqual(["Rows:", '[{"id":1},{"id":2}]']);
  });
});

describe("never raw: a kind nested inside a non-kind object (A7)", () => {
  const WRAPPED = `{"result":${KIND_PAYLOAD_ONE_LINE},"note":"checked"}`;
  const ITEMS_ONLY = `{"items":[${KIND_PAYLOAD_ONE_LINE}]}`;
  const CASES: Array<[string, string]> = [
    ["bare wrapper", `Here you go:\n\n${WRAPPED}\n\nAfter.`],
    ["```json wrapper", `Here you go:\n\n\`\`\`json\n${WRAPPED}\n\`\`\`\n\nAfter.`],
    [
      "```json pretty wrapper",
      `Here you go:\n\n\`\`\`json\n${JSON.stringify(JSON.parse(WRAPPED), null, 2)}\n\`\`\`\n\nAfter.`,
    ],
  ];

  it.each(CASES)("%s: once a __kind key is visible, no frame draws raw JSON", (_label, stream) => {
    const frames = streamingFrames(streamCharByChar(stream, `req-nested-${_label}`));
    const afterKind = frames.filter((b) => hasKindKey(b.content ?? ""));
    expect(afterKind.length).toBeGreaterThan(0);
    expect(
      afterKind
        .filter((b) => (b.type === "text" ? textShowsRawKind(b) : rendersRawJson(b)))
        .map((b) => (b.content ?? "").slice(0, 40)),
    ).toEqual([]);
  });

  it.each(CASES)("%s: final — the kind, then the wrapper's own data as valid JSON; no broken fragments", (_label, stream) => {
    const expected = ["Here you go:", KIND_PAYLOAD_ONE_LINE, '{"note":"checked"}', "After."];
    const normalize = (content: string) => {
      const t = content.trim();
      try {
        return JSON.stringify(JSON.parse(t));
      } catch {
        return t;
      }
    };
    const blocks = finalBlocks(stream, `req-nested-final-${_label}`);
    expect(blocks.map((b) => normalize(b.content ?? ""))).toEqual(expected);
    const reloaded = splitContentIntoBlocksV2(stream).filter((b) => b.content.trim());
    expect(reloaded.map((b) => normalize(b.content))).toEqual(expected);
  });

  it("a wrapper that only holds kinds leaves nothing but the kinds", () => {
    const stream = `\`\`\`json\n${ITEMS_ONLY}\n\`\`\`\n`;
    const blocks = finalBlocks(stream, "req-nested-items");
    expect(blocks.map((b) => (b.content ?? "").trim())).toEqual([KIND_PAYLOAD_ONE_LINE]);
  });
});

describe("never raw: a kind inside a simple XML tag (A8)", () => {
  const PRETTY = JSON.stringify(JSON.parse(KIND_PAYLOAD_ONE_LINE), null, 2);
  /** An XML section block (or prose) that prints a `__kind` key prints raw kind JSON. */
  const sectionShowsRawKind = (b: RenderBlockPayload) =>
    b.type !== "code" && hasKindKey(b.content ?? "") && applyIrKindRoute(renderBlockToContentBlock(b)).type === b.type;
  const CASES: Array<[string, string]> = [
    ["<info> one-line", `<info>\nBefore the cards.\n${KIND_PAYLOAD_ONE_LINE}\nAfter the cards.\n</info>\nDone.`],
    ["<info> pretty", `<info>\nBefore the cards.\n${PRETTY}\nAfter the cards.\n</info>\nDone.`],
    ["<thinking> one-line", `<thinking>\nWorking it out.\n${KIND_PAYLOAD_ONE_LINE}\nChecked.\n</thinking>\nDone.`],
  ];

  it.each(CASES)("%s: rescued live — no frame prints the kind inside the section", (_label, stream) => {
    const frames = streamingFrames(streamCharByChar(stream, `req-xml-${_label}`));
    const afterKind = frames.filter((b) => hasKindKey(b.content ?? ""));
    expect(afterKind.length).toBeGreaterThan(0);
    expect(afterKind.filter(sectionShowsRawKind).map((b) => `${b.type}: ${(b.content ?? "").slice(0, 40)}`)).toEqual([]);
    expect(afterKind.filter(rendersRawJson).map((b) => (b.content ?? "").slice(0, 40))).toEqual([]);
  });

  it.each(CASES)("%s: final blocks match the reload", (_label, stream) => {
    const shape = (b: { type: string; content?: string | null }) => `${b.type}:${(b.content ?? "").trim().slice(0, 30)}`;
    const blocks = finalBlocks(stream, `req-xml-final-${_label}`).map(shape);
    const reloaded = splitContentIntoBlocksV2(stream).filter((b) => b.content.trim()).map(shape);
    expect(blocks).toEqual(reloaded);
    expect(blocks.filter((b) => b.startsWith("code:{"))).toHaveLength(1);
  });
});

describe("never stuck: a transport drop mid-fence still settles every block (A9)", () => {
  const globals = globalThis as { TextEncoder?: unknown; TextDecoder?: unknown };
  if (typeof globals.TextEncoder !== "function") globals.TextEncoder = NodeTextEncoder;
  if (typeof globals.TextDecoder !== "function") globals.TextDecoder = NodeTextDecoder;

  const REQUEST_ID = "req_a9_transport_drop";
  const CONVERSATION_ID = "a9a9a9a9-a9a9-4a9a-8a9a-a9a9a9a9a9a9";

  /** Delivers the events, then the socket drops mid-body. */
  function droppedResponse(events: unknown[]): Response {
    const encoder = new TextEncoder();
    const chunks = events.map((e) => encoder.encode(`${JSON.stringify(e)}\n`));
    const reader = {
      read(): Promise<{ value?: Uint8Array; done: boolean }> {
        const value = chunks.shift();
        if (value) return Promise.resolve({ value, done: false });
        return Promise.reject(new Error("socket dropped"));
      },
      releaseLock() {},
    };
    return { body: { getReader: () => reader }, headers: new Headers() } as unknown as Response;
  }

  function harness() {
    let activeRequests = activeRequestsReducer(
      undefined,
      createRequest({ requestId: REQUEST_ID, conversationId: CONVERSATION_ID }),
    );
    const getState = () =>
      ({
        activeRequests,
        conversations: { byConversationId: { [CONVERSATION_ID]: { status: "running", agentId: null } } },
        instanceUserInput: { byConversationId: {} },
        instanceUIState: { byConversationId: {} },
        instanceResources: { byConversationId: {} },
        instanceVariableValues: { byConversationId: {} },
        messages: { byConversationId: {} },
        observability: { toolCalls: {}, userRequests: {}, requests: {} },
        agentDefinition: { agents: {} },
      }) as unknown as RootState;
    const dispatch = (action: unknown) => {
      if (typeof action === "object" && action !== null && "type" in action) {
        activeRequests = activeRequestsReducer(activeRequests, action as never);
      }
      return action;
    };
    const blocks = () =>
      Object.values(activeRequests.byRequestId[REQUEST_ID]?.renderBlocks ?? {}) as RenderBlockPayload[];
    return { getState, dispatch, blocks };
  }

  it("a retained processor discarded without a rejoin finalizes its open fence", async () => {
    const h = harness();
    await expect(
      processStream({
        requestId: REQUEST_ID,
        conversationId: CONVERSATION_ID,
        response: droppedResponse([
          { event: "phase", stream_seq: 1, data: { phase: "processing" } },
          {
            event: "chunk",
            stream_seq: 2,
            data: { text: `Here you go:\n\n\`\`\`json\n${KIND_PAYLOAD_ONE_LINE.slice(0, 120)}` },
          },
        ]),
        submitAt: 0,
        conversationIdAt: null,
        dispatch: h.dispatch as never,
        getState: h.getState,
        abortController: new AbortController(),
        allowTransportResume: true,
      }),
    ).rejects.toThrow();
    expect(hasRetainedTransportConsumer(REQUEST_ID)).toBe(true);
    const fence = h.blocks().find((b) => (b.content ?? "").includes('"__kind"'));
    expect(fence?.status).toBe("streaming"); // still rejoinable here

    // The rejoin is refused / impossible — run-ai-stream discards the processor.
    discardRetainedTransportConsumer(REQUEST_ID);
    expect(
      h.blocks()
        .filter((b) => b.status === "streaming")
        .map((b) => `${b.blockId}: ${(b.content ?? "").slice(0, 30)}`),
    ).toEqual([]);
  });

  it("a USER CANCEL mid-kind settles every block — the cancel path finalizes too", async () => {
    const h = harness();
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const events = [
      { event: "phase", stream_seq: 1, data: { phase: "processing" } },
      {
        event: "chunk",
        stream_seq: 2,
        data: { text: `Here you go:\n\n\`\`\`json\n${KIND_PAYLOAD_ONE_LINE.slice(0, 120)}` },
      },
    ].map((e) => encoder.encode(`${JSON.stringify(e)}\n`));
    const reader = {
      read(): Promise<{ value?: Uint8Array; done: boolean }> {
        const value = events.shift();
        if (value) return Promise.resolve({ value, done: false });
        // The person presses Stop: the fetch aborts and the reader rejects.
        controller.abort("user-cancel");
        const abort = new Error("The operation was aborted.");
        abort.name = "AbortError";
        return Promise.reject(abort);
      },
      releaseLock() {},
    };
    const response = { body: { getReader: () => reader }, headers: new Headers() } as unknown as Response;
    await expect(
      processStream({
        requestId: REQUEST_ID,
        conversationId: CONVERSATION_ID,
        response,
        submitAt: 0,
        conversationIdAt: null,
        dispatch: h.dispatch as never,
        getState: h.getState,
        abortController: controller,
        allowTransportResume: true,
      }),
    ).rejects.toThrow();
    // Not handed to a rejoin: a cancel is final.
    expect(hasRetainedTransportConsumer(REQUEST_ID)).toBe(false);
    const blocks = h.blocks();
    expect(blocks.filter((b) => b.status === "streaming").map((b) => b.blockId)).toEqual([]);
    // The cut kind is never the raw card once settled (its broken state).
    const kind = blocks.find((b) => hasKindKey(b.content ?? ""));
    expect(kind).toBeDefined();
    expect(drawsKindAsRawJson(kind as RenderBlockPayload, { isStreamActive: false })).toBe(false);
  });
});

describe("never raw: a fence that closes on broken JSON carrying __kind (A10)", () => {
  const CASES: Array<[string, string]> = [
    ["grammar slip after __kind", '{"__kind":"flashcard_set","title":"T",,"cards":[]}'],
    ["grammar slip BEFORE __kind", '{"title":"T",,"__kind":"flashcard_set","cards":[]}'],
    ["truncated before __kind closes the object", '{"title":"Cells","__kind":"flashcard_set","cards":[{"front":"a"'],
  ];

  it.each(CASES)("%s: the settled block is the kind's broken state, never the raw card", (_label, body) => {
    const stream = `Here you go:\n\n\`\`\`json\n${body}\n\`\`\`\n\nAfter.`;
    const blocks = finalBlocks(stream, `req-broken-${_label}`);
    const kindBlock = blocks.find((b) => hasKindKey(b.content ?? ""));
    expect(kindBlock).toBeDefined();
    expect(rendersRawJson(kindBlock as RenderBlockPayload)).toBe(false);
    // Reload: the same bytes through the static splitter.
    const reloaded = splitContentIntoBlocksV2(stream).find((b) => hasKindKey(b.content));
    expect(reloaded).toBeDefined();
    expect(
      rendersRawJson({
        blockId: "reload",
        blockIndex: 0,
        type: reloaded!.type,
        status: "complete",
        content: reloaded!.content,
        data: reloaded!.language ? { language: reloaded!.language } : null,
        metadata: reloaded!.metadata,
      } as RenderBlockPayload),
    ).toBe(false);
  });
});

describe("never raw: a settled region whose kind the cold registry cannot answer yet (A11)", () => {
  const CASES: Array<[string, string]> = [
    ["unregistered kind, complete", '{"__kind":"zz_unregistered_kind","rows":[1,2]}'],
    ["unregistered kind, truncated", '{"__kind":"zz_unregistered_kind","rows":[1,2'],
  ];

  afterEach(() => jest.restoreAllMocks());

  it.each(CASES)("%s: the kind loader holds while the registry is cold, never the raw card", (_label, body) => {
    // The cold window: the tier has not settled (the route holds its verdict).
    jest.spyOn(componentRegistry, "hasSettled").mockReturnValue(false);
    const stream = `Here you go:\n\n\`\`\`json\n${body}\n\`\`\`\n\nAfter.`;
    const kindBlock = finalBlocks(stream, `req-cold-${_label}`).find((b) => hasKindKey(b.content ?? ""));
    expect(kindBlock?.status).toBe("complete");
    expect(rendersRawJson(kindBlock as RenderBlockPayload)).toBe(false);
  });

  it("settling tells the waiting block (the package repaint) and the route then answers — still never raw", async () => {
    let repaints = 0;
    const unsubscribe = componentRegistry.subscribeKind("zz_unregistered_kind", () => repaints++);
    componentRegistry.replaceDbRows([]); // the tier settles with nothing for this kind
    unsubscribe();
    expect(repaints).toBeGreaterThan(0);
    const stream = "```json\n" + CASES[0]![1] + "\n```\n";
    const kindBlock = finalBlocks(stream, "req-cold-settled").find((b) => hasKindKey(b.content ?? ""));
    expect(rendersRawJson(kindBlock as RenderBlockPayload)).toBe(false);
  });
});

describe("never raw: the frames before a LATER __kind key's colon (V6)", () => {
  const LATER = [
    ["array, second element", `[{"x":1}, ${KIND_PAYLOAD_ONE_LINE}]`],
    ["nested under a data key", `{"data":${KIND_PAYLOAD_ONE_LINE}}`],
  ] as const;
  const WRAPS: Array<[string, (b: string) => string]> = [
    ["```json", (b) => `Here you go:\n\n\`\`\`json\n${b}`],
    ["bare", (b) => `Here you go:\n\n${b}`],
  ];
  const CASES = LATER.flatMap(([label, body]) =>
    WRAPS.map(([wrapLabel, wrap]) => [`${wrapLabel} ${label}`, wrap(body)] as const),
  );

  it.each(CASES)("%s: no frame between `\"__k` and the colon draws raw", (_label, stream) => {
    const frames = jsonFrames(streamCharByChar(stream, `req-v6-${_label}`));
    const preColon = frames.filter((b) => /"__k(?:i(?:n(?:d"?)?)?)?$/.test(b.content ?? ""));
    expect(preColon.length).toBeGreaterThan(0);
    expect(preColon.filter(rendersRawJson).map((b) => (b.content ?? "").slice(-30))).toEqual([]);
  });

  it("kindless JSON with underscore keys never flickers to a loader", () => {
    const body = JSON.stringify({ _id: 7, __type: "row", __key: "k", _rows: [{ _n: 1 }] });
    const frames = jsonFrames(streamCharByChar(`\`\`\`json\n${body}`, "req-v6-kindless"));
    // Once its first key is known, a kindless region is JSON on every frame —
    // except the single frame `"__k` of `"__key"` (the threshold the rule names).
    const afterFirstKey = frames.filter((b) => (b.content ?? "").length > 8);
    const held = afterFirstKey.filter((b) => !rendersRawJson(b)).map((b) => b.content);
    expect(held).toEqual([expect.stringMatching(/"__k$/)]);
  });
});

describe("never raw: every frame judged with the MESSAGE's stream state (V5a)", () => {
  // The kind block settles while prose after it is still streaming — the
  // renderer gets isStreamActive=true for every block of the message, so the
  // judge must too (a settled block in a live message is drawn that way).
  const PRETTY = JSON.stringify(JSON.parse(KIND_PAYLOAD_ONE_LINE), null, 2);
  const CASES: Array<[string, string]> = [
    ...[...FENCES, ...UNPARSED_FENCES].map(
      ([label, wrap]) => [label, `${wrap(KIND_PAYLOAD_ONE_LINE)}${label === "bare" ? "" : "\n```"}\n\nAnd more prose after it.`] as [string, string],
    ),
    ["```jsonc pretty", `Here:\n\n\`\`\`jsonc\n${PRETTY}\n\`\`\`\n\nAnd more prose after it.`],
    ["prose same line", `Here: ${KIND_PAYLOAD_ONE_LINE} and more prose after it.`],
  ];

  it.each(CASES)("%s: no frame of any status draws the kind raw while the message streams", (_label, stream) => {
    const frames = streamCharByChar(stream, `req-v5a-${_label}`).map((u) => u.block);
    const settledMidStream = frames.filter((b) => b.status === "complete" && hasKindKey(b.content ?? ""));
    expect(settledMidStream.length).toBeGreaterThan(0);
    const raw = frames.filter((b) => drawsKindAsRawJson(b, { isStreamActive: true }));
    expect(raw.map((b) => `${b.type}/${b.status}: ${(b.content ?? "").slice(0, 40)}`)).toEqual([]);
  });
});

/**
 * G2 — THE DOM JUDGE. Every stream this file drove above, replayed one
 * character at a time through the real accumulator (then finalized), and its
 * frames DRAWN through the real BlockRenderer in jsdom: a `__kind` key in the
 * rendered text outside a `data-kind-source` container fails. Sampled — every
 * frame where a block's `__kind` first appears, every block's last frame, and
 * every 8th kind frame between. Runs last: it reads the streams the tests
 * above registered.
 */
describe("never raw ON SCREEN: every stream above, drawn through BlockRenderer (G2)", () => {
  it("no sampled frame of any stream puts a __kind key on screen", async () => {
    expect(STREAMS_SEEN.size).toBeGreaterThan(10);
    const leaks: string[] = [];
    for (const stream of STREAMS_SEEN) {
      const frames: Array<{ block: RenderBlockPayload; live: boolean }> = [];
      const accumulator = new StreamBlockAccumulator("dom-judge", (payload) => {
        frames.push({ block: (payload as Upsert).block, live: true });
        return { type: "test/upsert", payload };
      });
      const dispatch = (action: unknown) => action;
      for (const ch of stream) accumulator.ingest(ch, dispatch);
      const liveCount = frames.length;
      accumulator.finalize(dispatch);
      frames.forEach((frame, i) => {
        frame.live = i < liveCount;
      });
      for (const frame of sampleKindFrames(frames)) {
        const verdict = await domFrameVerdict(frame.block, { isStreamActive: frame.live });
        if (verdict.raw) {
          leaks.push(
            `${JSON.stringify(stream.slice(0, 60))} ${frame.live ? "live" : "final"} ${frame.block.type}: ${JSON.stringify(verdict.text.replace(/\s+/g, " ").slice(0, 100))}`,
          );
          break;
        }
      }
    }
    expect(leaks).toEqual([]);
  }, 600_000);
});
