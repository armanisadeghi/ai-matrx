/**
 * REGRESSION GUARD: collaboration `agent_call` child-stream attribution,
 * driven through the REAL reducers, the REAL StreamBlockAccumulator, and the
 * REAL timeline walker — the dispatch sequence process-stream.ts produces for
 * a `history_mode` agent_call.
 *
 * The load-bearing fact: a collaboration child streams its tokens on the
 * PARENT's wire, and `ChunkPayload` is `{ text }` — there is no per-chunk
 * attribution. The only anchor is the `sub_agent` operation's block range
 * (`blockAnchor` at INIT, `blockEnd` at COMPLETION).
 *
 * Pins:
 *  - The child's blocks are HIDDEN from the main transcript slots (they never
 *    persist to the parent conversation, so showing them live would make the
 *    transcript change on reload).
 *  - The caller's own text before AND after the call still renders, in order,
 *    with the tool card between them.
 *  - `selectAgentCallChildStream` returns exactly the child's text, bound to
 *    the owning call id, with the label + child conversation id from INIT.
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  appendChunk,
  markTextStreamStart,
  upsertRenderBlock,
  appendTimeline,
  upsertToolLifecycle,
  trackOperationInit,
  trackOperationCompletion,
} from "../active-requests.slice";
import {
  selectAgentCallChildStream,
  selectUnifiedSlots,
} from "../active-requests.selectors";
import { StreamBlockAccumulator } from "../../utils/stream-block-accumulator";
import type { ActiveRequest } from "@/features/agents/types/request.types";

type AnyState = Parameters<ReturnType<typeof selectUnifiedSlots>>[0];

const REQ = "req_collab_1";
const CONV = "conv_caller";
const CALL = "call_collab_1";
const OP = "op_sub_agent_1";
const CHILD_CONV = "conv_child_fork";

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

function setup() {
  const store = makeStore();
  const dispatch = (a: unknown) => store.dispatch(a as never);
  const getRequest = () =>
    (store.getState() as AnyState).activeRequests.byRequestId[
      REQ
    ] as ActiveRequest;
  dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const acc = new StreamBlockAccumulator(REQ, (payload) =>
    upsertRenderBlock(payload),
  );
  const textRun = (text: string) => {
    dispatch(markTextStreamStart({ requestId: REQ, timestamp: 1 }));
    dispatch(appendChunk({ requestId: REQ, content: text }));
    acc.ingest(text, dispatch);
  };
  return { store, dispatch, getRequest, acc, textRun };
}

function slotKinds(store: ReturnType<typeof makeStore>) {
  return selectUnifiedSlots(REQ)(store.getState() as AnyState).map(
    (s) => s.kind,
  );
}

function visibleText(store: ReturnType<typeof makeStore>): string {
  const state = store.getState() as AnyState;
  const request = state.activeRequests.byRequestId[REQ] as ActiveRequest;
  return selectUnifiedSlots(REQ)(state)
    .filter((s): s is { kind: "render_block"; blockId: string; seq: number } =>
      s.kind === "render_block",
    )
    .map((s) => request.renderBlocks[s.blockId]?.content ?? "")
    .join("");
}

function runCollabCall(opts: { complete: boolean }) {
  const ctx = setup();
  const { dispatch, getRequest, acc, textRun, store } = ctx;

  // 1. Caller's own text.
  textRun("Let me get a second opinion. ");
  acc.breakTextBlock(dispatch);

  // 2. The agent_call tool starts.
  dispatch(
    upsertToolLifecycle({
      requestId: REQ,
      callId: CALL,
      toolName: "agent_call",
      status: "started",
      arguments: { agent_id: "a1", history_mode: "fork" },
    }),
  );
  dispatch(
    appendTimeline({
      requestId: REQ,
      entry: {
        kind: "tool_event",
        seq: 0,
        timestamp: 1,
        data: { event: "tool_started", call_id: CALL, tool_name: "agent_call" },
      },
    }),
  );

  // 3. sub_agent INIT — anchors the child's block range.
  dispatch(
    trackOperationInit({
      requestId: REQ,
      operationId: OP,
      operation: "sub_agent",
      metadata: { label: "Reviewer", conversation_id: CHILD_CONV },
      timestamp: 2,
    }),
  );

  // 4. The CHILD streams on the parent's wire.
  textRun("CHILD-ANSWER-ONE ");
  textRun("CHILD-ANSWER-TWO");
  acc.breakTextBlock(dispatch);

  if (opts.complete) {
    dispatch(
      trackOperationCompletion({
        requestId: REQ,
        operationId: OP,
        operation: "sub_agent",
        status: "completed",
        result: {},
        timestamp: 3,
      }),
    );
    dispatch(
      upsertToolLifecycle({
        requestId: REQ,
        callId: CALL,
        toolName: "agent_call",
        status: "completed",
        result: { child_conversation_id: CHILD_CONV },
      }),
    );
    // 5. The caller resumes.
    textRun("Here is what they said.");
    acc.breakTextBlock(dispatch);
  }

  return { store, getRequest };
}

test("the child's blocks are hidden from the transcript; caller text and the tool card survive in order", () => {
  const { store } = runCollabCall({ complete: true });

  expect(slotKinds(store)).toEqual(["render_block", "tool", "render_block"]);

  const text = visibleText(store);
  expect(text).toContain("Let me get a second opinion.");
  expect(text).toContain("Here is what they said.");
  expect(text).not.toContain("CHILD-ANSWER-ONE");
  expect(text).not.toContain("CHILD-ANSWER-TWO");
});

test("selectAgentCallChildStream returns the child's text bound to its call, with INIT metadata", () => {
  const { store } = runCollabCall({ complete: true });

  const stream = selectAgentCallChildStream(REQ, CALL)(
    store.getState() as AnyState,
  );
  expect(stream).not.toBeNull();
  expect(stream!.status).toBe("done");
  expect(stream!.label).toBe("Reviewer");
  expect(stream!.childConversationId).toBe(CHILD_CONV);
  expect(stream!.text).toBe("CHILD-ANSWER-ONE CHILD-ANSWER-TWO");
});

test("while the child is still running its range stays open and hidden", () => {
  const { store } = runCollabCall({ complete: false });

  const stream = selectAgentCallChildStream(REQ, CALL)(
    store.getState() as AnyState,
  );
  expect(stream!.status).toBe("running");
  expect(stream!.text).toBe("CHILD-ANSWER-ONE CHILD-ANSWER-TWO");
  expect(visibleText(store)).not.toContain("CHILD-ANSWER");
});

test("an unrelated call id gets no child stream", () => {
  const { store } = runCollabCall({ complete: true });
  expect(
    selectAgentCallChildStream(REQ, "some_other_call")(
      store.getState() as AnyState,
    ),
  ).toBeNull();
});
