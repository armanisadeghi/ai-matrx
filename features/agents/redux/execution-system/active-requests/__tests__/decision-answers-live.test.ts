/**
 * REGRESSION GUARD: a decision turn's answers survive the LIVE run.
 *
 * THE BREAK THIS CATCHES. A decision agent returns no prose at all — its whole
 * turn is one `decision_answers` part. The server emits it as a typed `data`
 * event; the stream client makes a render block of it; `assembleMessageParts`
 * commits it to the message record; and an agent-battle column reads that
 * record. Every one of those links is invisible to the others, and on
 * 2026-09-21 two of them were missing at once: nothing was emitted, and a
 * block that is neither media nor text-carrying was silently dropped by the
 * commit pass. The run succeeded, the answers persisted, the reloaded page
 * rendered them — and the live column said "This run finished without writing
 * an answer" over a paid verdict (feedback efc7c841).
 *
 * So this drives the REAL reducer with the dispatch process-stream.ts produces
 * for the event, and asserts the two ends: the committed part, and what the
 * battle column reads out of it.
 *
 * THE USE CASE: All Green Recycling's customer portal — a resident reports a
 * pickup marked complete that never happened, and the `feedback.item_triage`
 * decision agent answers is_defect / owning_surface / urgency.
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  upsertRenderBlock,
  appendTimeline,
} from "../active-requests.slice";
import { assembleMessageParts } from "../../utils/assemble-cx-content-blocks";
import { readAnswersFromContent } from "@/features/agent-comparison/decisions/readColumnAnswers";
import { DECISION_ANSWERS_BLOCK_TYPE } from "@/features/content-ir/kinds/decision-answers";
import type { ActiveRequest } from "@/features/agents/types/request.types";

const REQ = "req_decision_1";
const CONV = "conv_decision_1";

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

function getRequest(store: ReturnType<typeof makeStore>): ActiveRequest {
  return (
    store.getState() as {
      activeRequests: { byRequestId: Record<string, ActiveRequest> };
    }
  ).activeRequests.byRequestId[REQ];
}

/** The server's wire payload for one decision turn. */
function decisionEvent(opts: {
  model: string;
  method: "native" | "verbalized";
  defect: boolean;
  probability: number;
  surface: string;
  urgency: number;
}) {
  return {
    type: DECISION_ANSWERS_BLOCK_TYPE,
    __kind: DECISION_ANSWERS_BLOCK_TYPE,
    model: opts.model,
    method: opts.method,
    answers: {
      is_defect: {
        __kind: "decision_answer",
        type: "noul",
        answer: opts.defect,
        probability: opts.probability,
        confidence: opts.probability,
      },
      owning_surface: {
        __kind: "decision_answer",
        type: "choice",
        answer: opts.surface,
        probabilities: { frontend: 0.2, server: 0.2, data: 0.6 },
        confidence: 0.6,
      },
      urgency: {
        __kind: "decision_answer",
        type: "score",
        answer: opts.urgency,
        probabilities: { "1": 0.1, "2": 0.2, "3": 0.4, "4": 0.3 },
        confidence: 0.4,
      },
    },
    unanswerable: {},
    usage: { input_tokens: 1830, output_tokens: 0 },
    cost_usd: 0.000033,
  } as unknown as Record<string, unknown>;
}

/** Exactly what process-stream.ts dispatches for a `decision_answers` event. */
function streamDecision(
  store: ReturnType<typeof makeStore>,
  payload: Record<string, unknown>,
) {
  const blockId = "decision_answers_1";
  store.dispatch(
    upsertRenderBlock({
      requestId: REQ,
      block: {
        blockId,
        blockIndex: 0,
        type: DECISION_ANSWERS_BLOCK_TYPE,
        status: "complete",
        content: null,
        data: { payload },
      },
    }) as never,
  );
  store.dispatch(
    appendTimeline({
      requestId: REQ,
      entry: { kind: "data", seq: 0, timestamp: 1, data: payload, blockId },
    }) as never,
  );
}

// TWO runs whose every answer differs, so a committed constant cannot pass.
const RUNS = [
  {
    model: "jev-1.13.0",
    method: "native" as const,
    defect: true,
    probability: 0.96,
    surface: "frontend",
    urgency: 3.2,
  },
  {
    model: "claude-sonnet-5",
    method: "verbalized" as const,
    defect: false,
    probability: 0.31,
    surface: "data",
    urgency: 1.4,
  },
];

test.each(RUNS)(
  "a live decision turn commits its answers part ($model)",
  (run) => {
    const store = makeStore();
    store.dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
    streamDecision(store, decisionEvent(run));

    const parts = assembleMessageParts(getRequest(store));
    expect(parts.map((p) => p.type)).toEqual([DECISION_ANSWERS_BLOCK_TYPE]);

    // BOTH KEYS on the committed part — `type` is how every part reader
    // dispatches, `__kind` is the kind marker and is data.
    const part = parts[0] as unknown as Record<string, unknown>;
    expect(part.__kind).toBe(DECISION_ANSWERS_BLOCK_TYPE);
    expect(part.model).toBe(run.model);
    expect(part.method).toBe(run.method);
  },
);

test.each(RUNS)(
  "the battle column reads the live verdict out of that part ($model)",
  (run) => {
    const store = makeStore();
    store.dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
    streamDecision(store, decisionEvent(run));

    // This is exactly what DecisionComparisonTable does with the message
    // record's content once the stream commits it.
    const content = assembleMessageParts(getRequest(store));
    const view = readAnswersFromContent(content);

    expect(view).not.toBeNull();
    const answers = (view as unknown as { answers: Record<string, unknown> })
      .answers;
    expect(answers).toBeTruthy();
    const serialized = JSON.stringify(view);
    expect(serialized).toContain(run.surface);
    expect(serialized).toContain(String(run.urgency));
  },
);
