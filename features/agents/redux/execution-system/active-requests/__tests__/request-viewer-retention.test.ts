import { configureStore } from "@reduxjs/toolkit";

import { destroyInstance } from "../../conversations/conversations.slice";
import activeRequestsReducer, {
  createRequest,
  releaseRequestForViewer,
  removeRequest,
  retainRequestForViewer,
} from "../active-requests.slice";

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer },
  });
}

const REQUEST_ID = "request-retention-test";
const CONVERSATION_ID = "conversation-retention-test";

function createTestRequest(store: ReturnType<typeof makeStore>) {
  store.dispatch(
    createRequest({
      requestId: REQUEST_ID,
      conversationId: CONVERSATION_ID,
    }),
  );
}

test("owner cleanup keeps a request until its mounted viewer releases it", () => {
  const store = makeStore();
  createTestRequest(store);

  store.dispatch(
    retainRequestForViewer({ requestId: REQUEST_ID, viewerId: "window" }),
  );
  store.dispatch(removeRequest(REQUEST_ID));

  expect(store.getState().activeRequests.byRequestId[REQUEST_ID]).toBeDefined();
  expect(
    store.getState().activeRequests.pendingRemovalByRequestId[REQUEST_ID],
  ).toBe(true);

  store.dispatch(
    releaseRequestForViewer({ requestId: REQUEST_ID, viewerId: "window" }),
  );

  expect(
    store.getState().activeRequests.byRequestId[REQUEST_ID],
  ).toBeUndefined();
  expect(
    store.getState().activeRequests.byConversationId[CONVERSATION_ID],
  ).toBeUndefined();
});

test("duplicate retain is idempotent and every distinct viewer must release", () => {
  const store = makeStore();
  createTestRequest(store);

  store.dispatch(
    retainRequestForViewer({ requestId: REQUEST_ID, viewerId: "window-a" }),
  );
  store.dispatch(
    retainRequestForViewer({ requestId: REQUEST_ID, viewerId: "window-a" }),
  );
  store.dispatch(
    retainRequestForViewer({ requestId: REQUEST_ID, viewerId: "window-b" }),
  );
  store.dispatch(removeRequest(REQUEST_ID));

  expect(
    store.getState().activeRequests.viewerIdsByRequestId[REQUEST_ID],
  ).toEqual(["window-a", "window-b"]);

  store.dispatch(
    releaseRequestForViewer({ requestId: REQUEST_ID, viewerId: "window-a" }),
  );
  expect(store.getState().activeRequests.byRequestId[REQUEST_ID]).toBeDefined();

  store.dispatch(
    releaseRequestForViewer({ requestId: REQUEST_ID, viewerId: "window-b" }),
  );
  expect(
    store.getState().activeRequests.byRequestId[REQUEST_ID],
  ).toBeUndefined();
});

test("destroying an execution instance also defers cleanup for a viewer", () => {
  const store = makeStore();
  createTestRequest(store);
  store.dispatch(
    retainRequestForViewer({ requestId: REQUEST_ID, viewerId: "window" }),
  );

  store.dispatch(destroyInstance(CONVERSATION_ID));

  expect(store.getState().activeRequests.byRequestId[REQUEST_ID]).toBeDefined();
  expect(
    store.getState().activeRequests.byConversationId[CONVERSATION_ID],
  ).toEqual([REQUEST_ID]);

  store.dispatch(
    releaseRequestForViewer({ requestId: REQUEST_ID, viewerId: "window" }),
  );
  expect(
    store.getState().activeRequests.byRequestId[REQUEST_ID],
  ).toBeUndefined();
});

test("requests without viewers are removed immediately", () => {
  const store = makeStore();
  createTestRequest(store);

  store.dispatch(removeRequest(REQUEST_ID));

  expect(
    store.getState().activeRequests.byRequestId[REQUEST_ID],
  ).toBeUndefined();
});

test("re-creating an existing request NEVER resets its streamed state", () => {
  // The disappearing-run class, mechanism #2: a rejoin / second surface
  // adopting the same server-side pipeline run dispatches createRequest under
  // the SAME server X-Request-ID. That must continue into the existing row —
  // a reset would blank every mounted viewer and silently drop all later
  // events. See features/agents/docs/LIVE_RUN_RETENTION.md.
  const store = makeStore();
  createTestRequest(store);

  const before = store.getState().activeRequests.byRequestId[REQUEST_ID];
  store.dispatch(
    createRequest({ requestId: REQUEST_ID, conversationId: CONVERSATION_ID }),
  );
  const after = store.getState().activeRequests.byRequestId[REQUEST_ID];

  // Same object, not a fresh empty row.
  expect(after).toBe(before);
  expect(
    store.getState().activeRequests.byConversationId[CONVERSATION_ID],
  ).toEqual([REQUEST_ID]);
});

test("re-adoption cancels a deferred (viewer-retained) removal", () => {
  const store = makeStore();
  createTestRequest(store);
  store.dispatch(
    retainRequestForViewer({ requestId: REQUEST_ID, viewerId: "window" }),
  );
  store.dispatch(removeRequest(REQUEST_ID));
  expect(
    store.getState().activeRequests.pendingRemovalByRequestId[REQUEST_ID],
  ).toBe(true);

  // A rejoin re-adopts under the same id — the deferred removal must die,
  // or the row would evaporate on the next viewer release mid-stream.
  store.dispatch(
    createRequest({ requestId: REQUEST_ID, conversationId: CONVERSATION_ID }),
  );
  expect(
    store.getState().activeRequests.pendingRemovalByRequestId[REQUEST_ID],
  ).toBeUndefined();

  store.dispatch(
    releaseRequestForViewer({ requestId: REQUEST_ID, viewerId: "window" }),
  );
  expect(store.getState().activeRequests.byRequestId[REQUEST_ID]).toBeDefined();
});

test("a viewer can retain BEFORE the row exists (mount/adoption race)", () => {
  const store = makeStore();

  store.dispatch(
    retainRequestForViewer({ requestId: REQUEST_ID, viewerId: "early" }),
  );
  createTestRequest(store);
  store.dispatch(removeRequest(REQUEST_ID));

  expect(store.getState().activeRequests.byRequestId[REQUEST_ID]).toBeDefined();

  store.dispatch(
    releaseRequestForViewer({ requestId: REQUEST_ID, viewerId: "early" }),
  );
  expect(
    store.getState().activeRequests.byRequestId[REQUEST_ID],
  ).toBeUndefined();
});
