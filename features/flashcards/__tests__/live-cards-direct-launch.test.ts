/**
 * Reproduction + fix proof for the /education/flashcards/new "loading state
 * forever" bug (2026-07-03).
 *
 * ROOT CAUSE: for `displayMode: "direct"` + `autoRun`, `launchAgentExecution`
 * awaits the ENTIRE stream (executeInstance → runAiStream → pollForCompletion)
 * before resolving — so a requestId read from `.unwrap()` exists only AFTER
 * the generation is over. CreateFromTopic's live preview was keyed off that
 * requestId and therefore starved for the whole stream. The streaming
 * machinery itself (StreamBlockAccumulator → upsertRenderBlock → answerText +
 * `metadata.__ir` envelopes) was populating Redux the whole time — nobody was
 * subscribed.
 *
 * These tests drive the REAL activeRequests slice with the REAL accumulator
 * (the exact same wiring process-stream.ts uses for a direct launch) using
 * the user's exact payload shape, and prove:
 *   1. the requestId is knowable from Redux at connection time (the fix's
 *      derivation in useGenerateCards), and
 *   2. `selectKindEnvelope` yields a flashcard_set envelope with visible
 *      cards MID-stream — before any terminal status — which is what now
 *      drives LiveGenerationPreview.
 */

import { configureStore } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import activeRequestsReducer, {
  createRequest,
  setRequestStatus,
  upsertRenderBlock,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import {
  selectAnswerText,
  selectConversationRequestIds,
  selectKindEnvelope,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { flashcardsServerDataFromEnvelope } from "@/features/content-ir/kinds/flashcard-set";
import { generatedSetFromEnvelope } from "../data/generated-set-from-envelope";

// The user's exact payload shape: pretty-printed, __kind at BOTH levels,
// 5 cards, tags arrays.
const USER_PAYLOAD = JSON.stringify(
  {
    __kind: "flashcard_set",
    title: "Photosynthesis Basics",
    cards: [
      {
        __kind: "flashcard",
        front: "What is photosynthesis?",
        back: "The process by which plants convert light energy into chemical energy.",
        card_kind: "concept",
        difficulty: "medium",
        topic: "Photosynthesis",
        tags: ["biology", "energy"],
      },
      {
        __kind: "flashcard",
        front: "Where does photosynthesis occur?",
        back: "In the chloroplasts of plant cells.",
        card_kind: "concept",
        difficulty: "medium",
        topic: "Photosynthesis",
        tags: ["chloroplast", "cell biology"],
      },
      {
        __kind: "flashcard",
        front: "What pigment absorbs light?",
        back: "Chlorophyll, concentrated in the thylakoid membranes.",
        card_kind: "concept",
        difficulty: "medium",
        topic: "Photosynthesis",
        tags: ["chlorophyll", "pigments"],
      },
      {
        __kind: "flashcard",
        front: "What are the inputs of photosynthesis?",
        back: "Carbon dioxide, water, and light energy.",
        card_kind: "concept",
        difficulty: "medium",
        topic: "Photosynthesis",
        tags: ["inputs", "reactants"],
      },
      {
        __kind: "flashcard",
        front: "What are the outputs of photosynthesis?",
        back: "Glucose and oxygen.",
        card_kind: "concept",
        difficulty: "medium",
        topic: "Photosynthesis",
        tags: ["outputs", "products"],
      },
    ],
  },
  null,
  2,
);

/** Deterministic fixed-size chunker — chunk boundaries land mid-line/mid-token. */
function chunk(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    out.push(text.slice(i, i + size));
  }
  return out;
}

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    // The accumulator attaches non-serializable-looking (but plain-JSON)
    // envelope objects at high frequency; the dev-mode checks just slow the
    // test down.
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

const REQUEST_ID = "req_direct_launch_test";
const CONVERSATION_ID = "conv_direct_launch_test";

describe("direct-launch live flashcards (root-cause chain)", () => {
  it("surfaces the requestId from Redux at connection time — the live derivation useGenerateCards now uses", () => {
    const store = makeStore();

    // What executeInstance dispatches BEFORE any network/stream work:
    store.dispatch(
      createRequest({ requestId: REQUEST_ID, conversationId: CONVERSATION_ID }),
    );
    store.dispatch(
      setRequestStatus({ requestId: REQUEST_ID, status: "connecting" }),
    );

    const state = store.getState() as unknown as RootState;
    const ids = selectConversationRequestIds(CONVERSATION_ID)(state);
    // The fix reads ids[ids.length - 1] the moment onConversationCreated +
    // createRequest have fired — long before the launch thunk resolves.
    expect(ids[ids.length - 1]).toBe(REQUEST_ID);
  });

  it("yields a flashcard_set envelope with visible cards MID-stream via selectKindEnvelope", () => {
    const store = makeStore();
    store.dispatch(
      createRequest({ requestId: REQUEST_ID, conversationId: CONVERSATION_ID }),
    );
    store.dispatch(
      setRequestStatus({ requestId: REQUEST_ID, status: "streaming" }),
    );

    // The exact wiring process-stream.ts uses for EVERY launch mode:
    const accumulator = new StreamBlockAccumulator(
      REQUEST_ID,
      upsertRenderBlock,
    );

    const chunks = chunk(USER_PAYLOAD, 24);
    const midpoint = Math.floor(chunks.length * 0.6);

    let sawLiveCardsMidStream = false;

    for (let i = 0; i < chunks.length; i++) {
      accumulator.ingest(chunks[i], store.dispatch);

      if (i === midpoint) {
        const state = store.getState() as unknown as RootState;

        // Still mid-stream — no terminal status anywhere.
        expect(selectRequestStatus(REQUEST_ID)(state)).toBe("streaming");

        // PRIMARY path: the accumulator's own envelope, read from Redux.
        const envelope = selectKindEnvelope(
          REQUEST_ID,
          "flashcard_set",
        )(state);
        expect(envelope).not.toBeNull();
        expect(envelope?.root.kind).toBe("flashcard_set");
        expect(envelope?.root.status).toBe("streaming");

        // What LiveGenerationPreview gates on: serverData with > 0 cards.
        const serverData = envelope
          ? flashcardsServerDataFromEnvelope(envelope)
          : undefined;
        expect(serverData).toBeDefined();
        expect(
          (serverData?.cards as Array<Record<string, unknown>>).length,
        ).toBeGreaterThan(0);
        sawLiveCardsMidStream = true;

        // FALLBACK path input: answerText (renderBlock-derived) carries the
        // streamed JSON — the useLiveJsonRegion session is fed, not starved.
        const answerText = selectAnswerText(REQUEST_ID)(state);
        expect(answerText.length).toBeGreaterThan(0);
        expect(answerText.startsWith("{")).toBe(true);
      }
    }

    expect(sawLiveCardsMidStream).toBe(true);

    // Kind-omitted variant: any resolved kind — same envelope.
    const preFinalState = store.getState() as unknown as RootState;
    expect(selectKindEnvelope(REQUEST_ID)(preFinalState)?.root.kind).toBe(
      "flashcard_set",
    );

    // Stream end: finalize (process-stream does this before the terminal
    // status flip) → the COMPLETE envelope drives the typed save path.
    accumulator.finalize(store.dispatch);
    store.dispatch(
      setRequestStatus({ requestId: REQUEST_ID, status: "complete" }),
    );

    const finalState = store.getState() as unknown as RootState;
    const finalEnvelope = selectKindEnvelope(
      REQUEST_ID,
      "flashcard_set",
    )(finalState);
    expect(finalEnvelope?.root.status).toBe("complete");

    const persisted = finalEnvelope
      ? generatedSetFromEnvelope(finalEnvelope)
      : null;
    expect(persisted).not.toBeNull();
    expect(persisted?.set_title).toBe("Photosynthesis Basics");
    expect(persisted?.cards).toHaveLength(5);
    expect(persisted?.cards[0]).toMatchObject({
      front: "What is photosynthesis?",
      card_kind: "concept",
      difficulty: "medium",
      topic: "Photosynthesis",
    });
  });
});
