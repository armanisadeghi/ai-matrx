/**
 * REGRESSION GUARD (D209): an ADOPTED pipeline stream's output must survive the
 * end of the run.
 *
 * A server-orchestrated command adopted through `adoptForeignStream` (the SEO
 * commands, keyword research, reputation, YouTube) emits `sub_agent`
 * INIT/COMPLETION for the mandate the SERVER runs — with NO `agent_call` tool
 * call, because there is no parent transcript calling out to a specialist: the
 * sub-agent IS the whole run.
 *
 * `selectUnifiedSlots` hides a `sub_agent` operation's block range so the
 * owning `agent_call` card can render it instead. With no card to hand off to,
 * that hide rendered the run's ONLY content nowhere — the window went blank the
 * instant the stream ended (measured live on
 * /marketing/admin/keyword-data-quality, 2026-08-17). The hide is a HANDOFF, so
 * it is conditional on an owner (`OperationEntry.toolCallId`).
 *
 * The chat half of the contract is pinned by collab-child-stream.test.ts —
 * where an `agent_call` IS in flight and the hide must still happen.
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  appendChunk,
  markTextStreamStart,
  closeTextRun,
  upsertRenderBlock,
  appendTimeline,
  trackOperationInit,
  trackOperationCompletion,
} from "../active-requests.slice";
import { selectUnifiedSlots } from "../active-requests.selectors";
import { StreamBlockAccumulator } from "../../utils/stream-block-accumulator";
import type { ActiveRequest } from "@/features/agents/types/request.types";
import type { UntypedDataPayload } from "@/types/python-generated/stream-events";

type AnyState = Parameters<ReturnType<typeof selectUnifiedSlots>>[0];

const REQ = "req_adopted_1";
const CONV = "conv_adopted_1";
const OP = "op_mandate_run";

/** The classifier's real payload shape, trimmed to two results. */
const PAYLOAD = JSON.stringify(
  {
    __kind: "keyword_classification_batch_v1",
    classifier_version: "kwclass-v1",
    results: [
      {
        __kind: "keyword_classification_v1",
        phrase: "rhinoplasty surgeon fee breakdown",
        overall_confidence: 92,
      },
      {
        __kind: "keyword_classification_v1",
        phrase: "rhinoplasty financing options",
        overall_confidence: 88,
      },
    ],
  },
  null,
  2,
);

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

/**
 * Replays the dispatch sequence process-stream produces for an adopted SEO
 * command run: typed `data` milestones, a `sub_agent` init with NO agent_call,
 * the mandate's streamed payload, the sub_agent completion, and the terminal
 * close (which is where the run's reasoning bracket lands and flips the
 * renderer onto the unified-slot path).
 */
function runAdoptedCommand() {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (payload) =>
    upsertRenderBlock(payload),
  );

  // The command's own typed milestones — each one creates a data block, so the
  // mandate's blockAnchor is NOT 0 (exactly as measured).
  for (const kind of [
    "seo.command_run",
    "seo.classify_started",
    "seo.classify_batch_started",
  ]) {
    const blockId = `data_unknown_${kind}`;
    dispatch(
      upsertRenderBlock({
        requestId: REQ,
        block: {
          blockId,
          blockIndex: 0,
          type: "unknown_data_event",
          status: "complete",
          content: null,
          data: { kind },
          metadata: undefined,
        },
      }),
    );
    dispatch(
      appendTimeline({
        requestId: REQ,
        entry: {
          kind: "data",
          seq: 0,
          timestamp: 1,
          blockId,
          // The SEO milestones are kind-discriminated and carry no `type`
          // (the generated union's fallback still requires one) — matching the
          // wire exactly is the point of this fixture.
          data: { kind } as unknown as UntypedDataPayload,
        },
      }),
    );
  }

  // The SERVER's mandate run announces itself — no agent_call anywhere.
  dispatch(
    trackOperationInit({
      requestId: REQ,
      operationId: OP,
      operation: "sub_agent",
      metadata: { label: "mandate:seo.keyword_classifier" },
      timestamp: 2,
    }),
  );

  // The mandate streams its payload.
  dispatch(markTextStreamStart({ requestId: REQ, timestamp: 3 }));
  for (let i = 0; i < PAYLOAD.length; i += 40) {
    const piece = PAYLOAD.slice(i, i + 40);
    dispatch(appendChunk({ requestId: REQ, content: piece }));
    acc.ingest(piece, dispatch);
  }

  dispatch(
    trackOperationCompletion({
      requestId: REQ,
      operationId: OP,
      operation: "sub_agent",
      status: "success",
      result: {},
      timestamp: 4,
    }),
  );

  // Terminal: process-stream's end-of-loop flush + run close.
  acc.finalize(dispatch);
  dispatch(closeTextRun({ requestId: REQ, timestamp: 5 }));

  return store;
}

function slots(store: ReturnType<typeof makeStore>) {
  return selectUnifiedSlots(REQ)(store.getState() as AnyState);
}

test("an adopted server-run's output stays visible after the run completes", () => {
  const store = runAdoptedCommand();
  const state = store.getState() as AnyState;
  const request = state.activeRequests.byRequestId[REQ] as ActiveRequest;

  const rendered = slots(store)
    .filter((s) => s.kind === "render_block")
    .map((s) => request.renderBlocks[s.blockId]?.content ?? "")
    .join("");

  expect(rendered).toContain("keyword_classification_batch_v1");
  expect(rendered).toContain("rhinoplasty surgeon fee breakdown");
});

test("the mandate's operation carries no owning tool call", () => {
  const store = runAdoptedCommand();
  const state = store.getState() as AnyState;
  const request = state.activeRequests.byRequestId[REQ] as ActiveRequest;
  const op = request.completedOperations[OP];

  // The anchor is still recorded (the agent_call card reads it when there IS
  // one) — what changed is that an OWNERLESS anchor no longer hides content.
  expect(op.blockAnchor).toBe(3);
  expect(op.toolCallId ?? null).toBeNull();
});
