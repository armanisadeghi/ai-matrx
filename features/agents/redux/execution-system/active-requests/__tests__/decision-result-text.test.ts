/**
 * REGRESSION GUARD: a decision turn's verdict reaches every STRING surface.
 *
 * THE BREAK THIS CATCHES. A decision agent's whole turn is one
 * `decision_answers` render block with `content: null` — no text at all.
 * Chat draws the block, but the surfaces that show a run as a string read
 * the text and got "": the toast preview said "Waiting..." forever over a
 * finished run, an agent app (public `/p/<slug>` included) painted nothing,
 * and a shortcut handed its caller an empty `responseText`.
 *
 * THE USE CASE: All Green Recycling's feedback inbox — a resident reports a
 * pickup marked complete that never happened, and the Feedback triage
 * decision agent answers is_defect / owning_surface / urgency.
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  upsertRenderBlock,
} from "../active-requests.slice";
import {
  deriveDecisionResultText,
  deriveResultText,
  selectResultText,
} from "../active-requests.selectors";
import { selectLatestAccumulatedText } from "../../selectors/aggregate.selectors";
import {
  DECISION_ANSWERS_BLOCK_TYPE,
  decisionAnswersMarkdownFromValue,
} from "@/features/content-ir/kinds/decision-answers";
import type { ActiveRequest } from "@/features/agents/types/request.types";
import type { RootState } from "@/lib/redux/store";

const REQ = "req_decision_text";
const CONV = "conv_decision_text";

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

function payload(opts: {
  model: string;
  method: "native" | "verbalized";
  defect: boolean;
  pTrue: number;
  surface: string;
}): Record<string, unknown> {
  return {
    __kind: DECISION_ANSWERS_BLOCK_TYPE,
    model: opts.model,
    method: opts.method,
    answers: {
      is_defect: {
        __kind: "decision_answer",
        type: "noul",
        answer: opts.defect,
        probability: opts.pTrue,
        confidence: 0.8,
      },
      owning_surface: {
        __kind: "decision_answer",
        type: "choice",
        answer: opts.surface,
        probabilities: { frontend: 0.15, server: 0.25, [opts.surface]: 0.6 },
        confidence: 0.6,
      },
    },
    unanswerable: { urgency: "The report does not say when pickup was due." },
    usage: { input_tokens: 1830, output_tokens: 0 },
    cost_usd: 0.000033,
  };
}

function run(blocks: Array<Record<string, unknown>>) {
  const store = makeStore();
  store.dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  blocks.forEach((block, i) =>
    store.dispatch(
      upsertRenderBlock({
        requestId: REQ,
        block: { blockIndex: i, status: "complete", ...block } as never,
      }) as never,
    ),
  );
  const state = store.getState() as unknown as RootState;
  const request = (
    state.activeRequests as unknown as {
      byRequestId: Record<string, ActiveRequest>;
    }
  ).byRequestId[REQ];
  return { state, request };
}

const decisionBlock = (p: Record<string, unknown>) => ({
  blockId: "decision_answers_1",
  type: DECISION_ANSWERS_BLOCK_TYPE,
  content: null,
  data: { payload: p },
});

// Two runs whose every answer differs, so no constant can pass.
const RUNS = [
  { model: "jev-1.13.0", method: "native" as const, defect: false, pTrue: 0.29, surface: "data", shownP: "71%" },
  { model: "claude-sonnet-5", method: "verbalized" as const, defect: true, pTrue: 0.93, surface: "frontend", shownP: "93%" },
];

test.each(RUNS)("a decision turn reads as its verdict ($model)", (r) => {
  const { state, request } = run([decisionBlock(payload(r))]);
  const text = deriveResultText(request);
  expect(text).toContain(`is_defect: ${r.defect ? "Yes" : "No"} (${r.shownP})`);
  expect(text).toContain(`owning_surface: ${r.surface} (60%)`);
  expect(text).toContain("urgency: not answered. The report does not say");
  expect(text).toContain(r.model);
  // The string surfaces: agent apps + the toast preview + the launch result.
  expect(selectResultText(REQ)(state)).toBe(text);
  expect(selectLatestAccumulatedText(CONV)(state)).toBe(text);
  expect(deriveDecisionResultText(request)).toBe(text);
});

test("a verbalized turn's raw JSON duplicate and its thinking are not the result", () => {
  const p = payload(RUNS[1]);
  const { request } = run([
    { blockId: "t0", type: "thinking", content: "Let me weigh the report." },
    { blockId: "t1", type: "text", content: JSON.stringify({ is_defect: true }) },
    decisionBlock(p),
  ]);
  const text = deriveResultText(request);
  expect(text).not.toContain("{");
  expect(text).not.toContain("Let me weigh");
  expect(text).toContain("is_defect: Yes (93%)");
});

test("a plain text turn is untouched", () => {
  const { state, request } = run([
    { blockId: "t1", type: "text", content: "Pickup rescheduled for Friday." },
  ]);
  expect(deriveDecisionResultText(request)).toBeNull();
  expect(deriveResultText(request)).toBe("Pickup rescheduled for Friday.");
  expect(selectLatestAccumulatedText(CONV)(state)).toBe(
    "Pickup rescheduled for Friday.",
  );
});

test("copy/export markdown gives the probability OF the answer, not P(true)", () => {
  const md = decisionAnswersMarkdownFromValue(payload(RUNS[0]));
  expect(md).toContain("**is_defect**: No (71%)");
  expect(md).not.toContain("No (29%)");
});
