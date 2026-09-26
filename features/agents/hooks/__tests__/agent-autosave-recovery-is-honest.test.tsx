/**
 * Unsaved builder edits recovered from this browser are shown as UNSAVED.
 *
 * Real use: the author changes Product Shot Studio's moderation to "auto",
 * does not save, and reloads. The builder restored "auto" from the local
 * backup but marked the agent clean — "No unsaved changes" beside a value the
 * database never held, with Save disabled — and then deleted the backup. A
 * recovery that races the server fetch was silently overwritten instead.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), error: jest.fn(), success: jest.fn(), warning: jest.fn() },
}));

import agentDefinitionReducer, {
  mergePartialAgent,
  setAgentFetchStatus,
} from "@/features/agents/redux/agent-definition/slice";
import { useAgentAutoSave } from "../useAgentAutoSave";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const AGENT = "3bf7e37d-26b4-4581-ac29-450462c18b22";
const KEY = `agent-autosave:${AGENT}`;
const SAVED = { moderation: "low" };

function makeStore() {
  return configureStore({
    reducer: { agentDefinition: agentDefinitionReducer },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }),
  });
}
type Store = ReturnType<typeof makeStore>;

function serverFetch(store: Store) {
  store.dispatch(
    mergePartialAgent({
      id: AGENT,
      modelId: "gpt-image-2",
      settings: SAVED,
      isOwner: true,
    } as Parameters<typeof mergePartialAgent>[0]),
  );
  store.dispatch(setAgentFetchStatus({ id: AGENT, status: "full" }));
}

function Probe() {
  useAgentAutoSave(AGENT);
  return null;
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    KEY,
    JSON.stringify({ _dirty: true, settings: { moderation: "auto" } }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(store: Store) {
  act(() => {
    root.render(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
  });
}

const record = (store: Store) => store.getState().agentDefinition.agents[AGENT];

test("recovered edits on an already-loaded agent are marked unsaved", () => {
  const store = makeStore();
  serverFetch(store);
  mount(store);
  expect(record(store).settings).toEqual({ moderation: "auto" });
  expect(record(store)._dirty).toBe(true);
  expect(localStorage.getItem(KEY)).not.toBeNull();
});

test("recovered edits survive a server fetch that lands after mount", () => {
  const store = makeStore();
  mount(store);
  act(() => serverFetch(store));
  expect(record(store).settings).toEqual({ moderation: "auto" });
  expect(record(store)._dirty).toBe(true);
});

test("a backup equal to the saved agent changes nothing and is cleared", () => {
  localStorage.setItem(KEY, JSON.stringify({ _dirty: true, settings: SAVED }));
  const store = makeStore();
  serverFetch(store);
  mount(store);
  expect(record(store)._dirty).toBe(false);
  expect(localStorage.getItem(KEY)).toBeNull();
});
