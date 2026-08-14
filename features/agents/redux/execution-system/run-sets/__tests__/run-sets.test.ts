/**
 * Guard tests for the run-set contract (multi-run surfaces).
 *
 * The invariants proven here are the ones whose loss re-creates the
 * disappearing-run class on multi-call surfaces — read
 * features/agents/docs/LIVE_RUN_RETENTION.md before weakening any of them.
 */

import { configureStore } from "@reduxjs/toolkit";

import type { AppDispatch } from "@/lib/redux/store";

import activeRequestsReducer, {
  createRequest,
  removeRequest,
} from "../../active-requests/active-requests.slice";
import runSetsReducer, {
  RUN_SET_MAX_ENTRIES,
  selectRunSetEntries,
} from "../run-sets.slice";
import {
  addRunToSet,
  clearRunSet,
  removeRunSetEntry,
} from "../run-sets.thunks";

function makeStore() {
  return configureStore({
    reducer: { activeRequests: activeRequestsReducer, runSets: runSetsReducer },
  });
}
type Store = ReturnType<typeof makeStore>;

/** House pattern for dispatching AppThunks on a partial test store. */
const thunkDispatch = (store: Store) => store.dispatch as unknown as AppDispatch;

const SET_KEY = "test-surface:phrase";

function seedRequest(store: Store, requestId: string) {
  store.dispatch(
    createRequest({ requestId, conversationId: `conv:${requestId}` }),
  );
}

test("set membership holds the row through an owner reap (remount survival)", () => {
  const store = makeStore();
  seedRequest(store, "run-1");
  thunkDispatch(store)(
    addRunToSet({ setKey: SET_KEY, requestId: "run-1", label: "Run 1" }),
  );

  // Owner hook unmounts and reaps — the set hold must defer the delete.
  store.dispatch(removeRequest("run-1"));
  expect(store.getState().activeRequests.byRequestId["run-1"]).toBeDefined();

  // Clearing the set completes the deferred delete.
  thunkDispatch(store)(clearRunSet(SET_KEY));
  expect(store.getState().activeRequests.byRequestId["run-1"]).toBeUndefined();
  expect(selectRunSetEntries(store.getState(), SET_KEY)).toHaveLength(0);
});

test("re-adding the same run is idempotent (re-adoption updates the label)", () => {
  const store = makeStore();
  seedRequest(store, "run-1");
  thunkDispatch(store)(
    addRunToSet({ setKey: SET_KEY, requestId: "run-1", label: "First" }),
  );
  thunkDispatch(store)(
    addRunToSet({ setKey: SET_KEY, requestId: "run-1", label: "Rejoined" }),
  );

  const entries = selectRunSetEntries(store.getState(), SET_KEY);
  expect(entries).toHaveLength(1);
  expect(entries[0].label).toBe("Rejoined");

  // One add, one hold: a single clear releases the row fully.
  store.dispatch(removeRequest("run-1"));
  thunkDispatch(store)(clearRunSet(SET_KEY));
  expect(store.getState().activeRequests.byRequestId["run-1"]).toBeUndefined();
});

test("removing one entry releases only that run", () => {
  const store = makeStore();
  seedRequest(store, "run-1");
  seedRequest(store, "run-2");
  thunkDispatch(store)(
    addRunToSet({ setKey: SET_KEY, requestId: "run-1", label: "Run 1" }),
  );
  thunkDispatch(store)(
    addRunToSet({ setKey: SET_KEY, requestId: "run-2", label: "Run 2" }),
  );
  store.dispatch(removeRequest("run-1"));
  store.dispatch(removeRequest("run-2"));

  thunkDispatch(store)(removeRunSetEntry({ setKey: SET_KEY, id: "run-1" }));

  expect(store.getState().activeRequests.byRequestId["run-1"]).toBeUndefined();
  expect(store.getState().activeRequests.byRequestId["run-2"]).toBeDefined();
  expect(selectRunSetEntries(store.getState(), SET_KEY)).toHaveLength(1);
});

test("overflow evicts oldest-first and releases evicted rows", () => {
  const store = makeStore();
  for (let i = 0; i < RUN_SET_MAX_ENTRIES + 2; i += 1) {
    const requestId = `run-${i}`;
    seedRequest(store, requestId);
    thunkDispatch(store)(
      addRunToSet({ setKey: SET_KEY, requestId, label: `Run ${i}` }),
    );
  }

  const entries = selectRunSetEntries(store.getState(), SET_KEY);
  expect(entries).toHaveLength(RUN_SET_MAX_ENTRIES);
  expect(entries[0].id).toBe("run-2");
  // Evicted rows lost their hold; with no pending owner reap they survive
  // until the owner reaps — simulate that reap and confirm deletion.
  store.dispatch(removeRequest("run-0"));
  expect(store.getState().activeRequests.byRequestId["run-0"]).toBeUndefined();
});
