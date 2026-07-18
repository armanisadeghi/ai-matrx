/**
 * LIVE-STREAM citation guard: `citation` events → per-request accumulation
 * (appendCitation) → derived index (selectLiveCitationIndex, the ONE core's
 * buildLiveCitationIndex) → marker insertion into the streamed markdown
 * (selectAccumulatedTextWithCitationMarkers) → CLEAN commit
 * (assembleMessageParts stores marker-free text + typed citations).
 *
 * Drives the REAL reducer + REAL StreamBlockAccumulator through the exact
 * dispatch sequence process-stream.ts produces (including the anchor
 * snapshot process-stream takes from state when a citation event arrives).
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  appendChunk,
  appendCitation,
  markTextStreamStart,
  closeTextRun,
  upsertRenderBlock,
} from "../active-requests.slice";
import {
  selectAccumulatedText,
  selectAccumulatedTextWithCitationMarkers,
  selectLiveCitationIndex,
} from "../active-requests.selectors";
import { StreamBlockAccumulator } from "../../utils/stream-block-accumulator";
import { assembleMessageParts } from "../../utils/assemble-cx-content-blocks";
import {
  CITATION_MARKER_RE,
  type NormalizedCitation,
} from "../../messages/message-citations";
import type { RootState } from "@/lib/redux/store";

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

type Store = ReturnType<typeof makeStore>;

const REQ = "req_citation_1";
const CONV = "conv_citation_1";

function citation(over: Partial<NormalizedCitation> = {}): NormalizedCitation {
  return {
    kind: "document_page",
    provider: "anthropic",
    cited_text: "verbatim source text",
    title: "Guide.pdf",
    url: null,
    source_index: 0,
    file_id: "file-1",
    page: 3,
    end_page: null,
    source_start: 10,
    source_end: 42,
    answer_start: null,
    answer_end: null,
    raw: {},
    ...over,
  };
}

/**
 * Replay process-stream's citation branch: snapshot the last streaming TEXT
 * render block + its content length from CURRENT state, then dispatch
 * appendCitation with that anchor.
 */
function citationEvent(
  store: Store,
  c: NormalizedCitation,
  providerBlockIndex: number | null = 0,
) {
  const state = store.getState() as unknown as RootState;
  const request = state.activeRequests.byRequestId[REQ];
  let anchorBlockId: string | null = null;
  let anchorOffset: number | null = null;
  if (request) {
    for (let i = request.renderBlockOrder.length - 1; i >= 0; i--) {
      const candidate = request.renderBlocks[request.renderBlockOrder[i]];
      if (candidate && candidate.type === "text") {
        anchorBlockId = candidate.blockId;
        anchorOffset = (candidate.content ?? "").length;
        break;
      }
    }
  }
  store.dispatch(
    appendCitation({
      requestId: REQ,
      entry: { providerBlockIndex, anchorBlockId, anchorOffset, citation: c },
    }),
  );
}

function streamText(
  store: Store,
  acc: StreamBlockAccumulator,
  text: string,
) {
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(markTextStreamStart({ requestId: REQ, timestamp: 1 }));
  dispatch(appendChunk({ requestId: REQ, content: text }));
  acc.ingest(text, dispatch);
}

function setup(): { store: Store; acc: StreamBlockAccumulator } {
  const store = makeStore();
  store.dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (payload) =>
    upsertRenderBlock(payload),
  );
  return { store, acc };
}

const asRoot = (store: Store): RootState =>
  store.getState() as unknown as RootState;

describe("live citation accumulation (reducer + index selector)", () => {
  it("accumulates citation events into a deduped, numbered live index", () => {
    const { store, acc } = setup();
    streamText(store, acc, "The sky is blue, and ");
    citationEvent(store, citation(), 0);
    streamText(store, acc, "water is wet.");
    // Same source (kind/file/page) cited again → same number, count 2.
    citationEvent(store, citation({ cited_text: "second span" }), 1);
    // A different source → number 2.
    citationEvent(
      store,
      citation({ kind: "web", url: "https://example.com", file_id: null }),
      1,
    );

    const index = selectLiveCitationIndex(REQ)(asRoot(store));
    expect(index.sources).toHaveLength(2);
    expect(index.sources[0]).toMatchObject({
      number: 1,
      fileId: "file-1",
      page: 3,
      count: 2,
    });
    expect(index.sources[1]).toMatchObject({
      number: 2,
      kind: "web",
      url: "https://example.com",
      count: 1,
    });

    // Markers are anchored to the streaming client text block.
    const request = asRoot(store).activeRequests.byRequestId[REQ];
    const textBlockIds = request.renderBlockOrder.filter(
      (id) => request.renderBlocks[id]?.type === "text",
    );
    expect(textBlockIds.length).toBeGreaterThan(0);
    const allMarkers = Object.values(index.markersByBlockId).flat();
    expect(allMarkers.map((m) => m.sourceNumber).sort()).toEqual([1, 1, 2]);
  });

  it("returns the stable empty index (referential) when no citations arrived", () => {
    const { store, acc } = setup();
    streamText(store, acc, "No citations here.");
    const sel = selectLiveCitationIndex(REQ);
    const a = sel(asRoot(store));
    streamText(store, acc, " More text.");
    const b = sel(asRoot(store));
    expect(a.sources).toHaveLength(0);
    expect(a).toBe(b);
  });
});

describe("streamed-text marker insertion (selector feeding the markdown)", () => {
  it("inserts markers at the citation's arrival offset in the streamed text", () => {
    const { store, acc } = setup();
    streamText(store, acc, "The sky is blue, and ");
    citationEvent(store, citation(), 0);
    streamText(store, acc, "water is wet.");

    const plain = selectAccumulatedText(REQ)(asRoot(store));
    const marked = selectAccumulatedTextWithCitationMarkers(REQ)(
      asRoot(store),
    );

    expect(plain).not.toMatch(CITATION_MARKER_RE);
    expect(marked).toContain('<matrxcite n="1" />');
    // The marker hugs the text streamed BEFORE the citation event (trailing
    // whitespace excluded), ahead of the text streamed after it.
    expect(marked.indexOf('<matrxcite n="1" />')).toBeLessThan(
      marked.indexOf("water is wet."),
    );
    // Stripping every marker restores the exact plain text.
    expect(marked.replace(CITATION_MARKER_RE, "")).toBe(plain);
  });

  it("is value-identical to selectAccumulatedText when no citations exist", () => {
    const { store, acc } = setup();
    streamText(store, acc, "Just some plain streamed markdown.");
    expect(selectAccumulatedTextWithCitationMarkers(REQ)(asRoot(store))).toBe(
      selectAccumulatedText(REQ)(asRoot(store)),
    );
  });
});

describe("stream commit (assembleMessageParts)", () => {
  it("commits CLEAN text (no markers) with citations on the text part", () => {
    const { store, acc } = setup();
    const dispatch = (a: unknown) => store.dispatch(a as never);
    streamText(store, acc, "The sky is blue, and ");
    citationEvent(store, citation(), 0);
    streamText(store, acc, "water is wet.");
    citationEvent(
      store,
      citation({ kind: "web", url: "https://example.com", file_id: null }),
      1,
    );
    acc.finalize(dispatch);
    dispatch(closeTextRun({ requestId: REQ, timestamp: 2 }));

    const request = asRoot(store).activeRequests.byRequestId[REQ];
    const parts = assembleMessageParts(request);
    const textParts = parts.filter(
      (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
    );
    expect(textParts).toHaveLength(1);
    // Clean wire text — the render-only marker must NEVER be persisted.
    expect(textParts[0].text).not.toMatch(CITATION_MARKER_RE);
    expect(textParts[0].text).toContain("The sky is blue");
    // Both captured citations ride the part, canonical shape intact.
    expect(textParts[0].citations).toHaveLength(2);
    expect(textParts[0].citations?.[0]).toMatchObject({
      kind: "document_page",
      provider: "anthropic",
      file_id: "file-1",
    });
    expect(textParts[0].citations?.[1]).toMatchObject({
      kind: "web",
      url: "https://example.com",
    });
  });

  it("commits without a citations field when none arrived", () => {
    const { store, acc } = setup();
    const dispatch = (a: unknown) => store.dispatch(a as never);
    streamText(store, acc, "Plain answer.");
    acc.finalize(dispatch);
    dispatch(closeTextRun({ requestId: REQ, timestamp: 2 }));

    const request = asRoot(store).activeRequests.byRequestId[REQ];
    const parts = assembleMessageParts(request);
    const textPart = parts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
    expect(
      (textPart as { citations?: unknown[] }).citations,
    ).toBeUndefined();
  });
});
