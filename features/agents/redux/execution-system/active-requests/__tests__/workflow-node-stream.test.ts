/**
 * REGRESSION GUARD: workflow per-node live-stream accumulation, driven through
 * the REAL reducers and selectors — the dispatch sequence
 * `followWorkflowRunStream` produces from the run's SSE events feed.
 *
 * The load-bearing facts (mirrors collab-child-stream.test.ts for the
 * workflow lane):
 *  - `node_stream` frames carry EXPLICIT attribution (`node_id`) and a
 *    per-node monotonic `stream_seq`; concurrent nodes accumulate into
 *    independent entries on ONE request row.
 *  - SSE reconnect replays/duplicates (stream_seq at or below the cursor)
 *    are dropped — text never doubles.
 *  - `chunk` builds `text`, `reasoning` builds `reasoningText`, `phase`
 *    overwrites `phase`; hint kinds only advance the cursor.
 *  - `node_completed`/`node_failed` settle the entry; a later frame
 *    (retry) reopens it.
 */

import { configureStore } from "@reduxjs/toolkit";
import activeRequestsReducer, {
  createRequest,
  appendWorkflowNodeStream,
  settleWorkflowNodeStream,
} from "../active-requests.slice";
import {
  selectWorkflowNodeStream,
  selectWorkflowNodeStreams,
} from "../active-requests.selectors";

const REQ = "req_wf_run_1";
const CONV = "conv_wf_run_1";

type StoreState = { activeRequests: ReturnType<typeof activeRequestsReducer> };

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

function setup() {
  const store = makeStore();
  store.dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  const frame = (
    nodeId: string,
    kind: string,
    delta: string,
    streamSeq: number,
  ) =>
    store.dispatch(
      appendWorkflowNodeStream({ requestId: REQ, nodeId, kind, delta, streamSeq }),
    );
  const state = () => store.getState() as unknown as StoreState;
  return { store, frame, state };
}

test("concurrent nodes accumulate independently, attributed by node_id", () => {
  const { frame, state } = setup();

  frame("role_amplifier", "chunk", "Bigger ", 1);
  frame("role_cartographer", "chunk", "Map: ", 1);
  frame("role_amplifier", "chunk", "vision.", 2);
  frame("role_cartographer", "chunk", "three territories.", 2);

  const amplifier = selectWorkflowNodeStream(REQ, "role_amplifier")(
    state() as never,
  );
  const cartographer = selectWorkflowNodeStream(REQ, "role_cartographer")(
    state() as never,
  );
  expect(amplifier?.text).toBe("Bigger vision.");
  expect(cartographer?.text).toBe("Map: three territories.");
  expect(amplifier?.status).toBe("streaming");

  const all = selectWorkflowNodeStreams(REQ)(state() as never);
  expect(all.map((s) => s.nodeId)).toEqual([
    "role_amplifier",
    "role_cartographer",
  ]);
});

test("duplicate/replayed frames (stream_seq <= cursor) are dropped", () => {
  const { frame, state } = setup();

  frame("role_amplifier", "chunk", "one ", 1);
  frame("role_amplifier", "chunk", "two", 2);
  // SSE reconnect replays the same deltas — must not double the text.
  frame("role_amplifier", "chunk", "one ", 1);
  frame("role_amplifier", "chunk", "two", 2);

  expect(
    selectWorkflowNodeStream(REQ, "role_amplifier")(state() as never)?.text,
  ).toBe("one two");
});

test("reasoning and phase land in their own fields; hint kinds only advance the cursor", () => {
  const { frame, state } = setup();

  frame("role_adversary", "reasoning", "Weighing the risks. ", 1);
  frame("role_adversary", "phase", "generating", 2);
  frame("role_adversary", "record_update", '{"table":"interview.turn"}', 3);
  frame("role_adversary", "chunk", "Here is the flaw.", 4);

  const entry = selectWorkflowNodeStream(REQ, "role_adversary")(
    state() as never,
  );
  expect(entry?.reasoningText).toBe("Weighing the risks. ");
  expect(entry?.phase).toBe("generating");
  expect(entry?.text).toBe("Here is the flaw.");
  expect(entry?.lastStreamSeq).toBe(4);
});

test("node_completed settles the entry; a later frame (retry) reopens it", () => {
  const { store, frame, state } = setup();

  frame("role_scribe", "chunk", "Draft.", 1);
  store.dispatch(
    settleWorkflowNodeStream({
      requestId: REQ,
      nodeId: "role_scribe",
      status: "done",
    }),
  );
  expect(
    selectWorkflowNodeStream(REQ, "role_scribe")(state() as never)?.status,
  ).toBe("done");

  frame("role_scribe", "chunk", " More.", 2);
  const entry = selectWorkflowNodeStream(REQ, "role_scribe")(state() as never);
  expect(entry?.status).toBe("streaming");
  expect(entry?.text).toBe("Draft. More.");
});

test("node_failed settles as failed; settling an unknown node is a no-op", () => {
  const { store, frame, state } = setup();

  frame("role_architect", "chunk", "Half-built ", 1);
  store.dispatch(
    settleWorkflowNodeStream({
      requestId: REQ,
      nodeId: "role_architect",
      status: "failed",
    }),
  );
  expect(
    selectWorkflowNodeStream(REQ, "role_architect")(state() as never)?.status,
  ).toBe("failed");

  // Never-streamed node — settle must not create a phantom entry.
  store.dispatch(
    settleWorkflowNodeStream({
      requestId: REQ,
      nodeId: "role_ghost",
      status: "done",
    }),
  );
  expect(
    selectWorkflowNodeStream(REQ, "role_ghost")(state() as never),
  ).toBeUndefined();
});
