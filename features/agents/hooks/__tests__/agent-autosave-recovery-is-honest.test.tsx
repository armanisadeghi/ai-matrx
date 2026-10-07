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

jest.mock("@ai-matrx/chat/host/notify", () => ({
  toast: { info: jest.fn(), error: jest.fn(), success: jest.fn(), warning: jest.fn() },
}));

import {
  mergePartialAgent,
  setAgentFetchStatus,
} from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import { useAgentAutoSave } from "../useAgentAutoSave";
import { toast } from "@ai-matrx/chat/host/notify";

import {
  agentDefinitionWithBuilderReducer,
  setAgentField,
} from "@/features/agents/redux/agent-builder.slice";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const AGENT = "3bf7e37d-26b4-4581-ac29-450462c18b22";
const KEY = `agent-autosave:${AGENT}`;
const SAVED = { moderation: "low" } as const;

function makeStore() {
  return configureStore({
    reducer: { agentDefinition: agentDefinitionWithBuilderReducer },
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

test("the restore notice's Discard returns to the saved agent and drops the backup", () => {
  const store = makeStore();
  serverFetch(store);
  mount(store);
  const info = toast.info as jest.Mock;
  const options = info.mock.calls[info.mock.calls.length - 1][1];
  expect(options.action.label).toBe("Discard");
  act(() => options.action.onClick());
  expect(record(store).settings).toEqual(SAVED);
  expect(record(store)._dirty).toBe(false);
  expect(localStorage.getItem(KEY)).toBeNull();
});

test("an editor writing back the value a clean field already holds is not an unsaved change", () => {
  localStorage.clear();
  const store = makeStore();
  serverFetch(store);
  mount(store);
  act(() => {
    store.dispatch(setAgentField({ id: AGENT, field: "settings", value: { ...SAVED } }));
  });
  expect(record(store)._dirty).toBe(false);
});

test("a settings-only edit backs up the model with it, so a class pin never restores beside another model", () => {
  // Captured 2026-10-07: a restore brought back settings.offering_id (a class
  // of another model) without that model — ai.resolve_model_config refused the
  // pair with P0002 and the settings panel locked.
  jest.useFakeTimers();
  try {
    localStorage.clear();
    const store = makeStore();
    serverFetch(store);
    mount(store);
    act(() => {
      store.dispatch(
        setAgentField({
          id: AGENT,
          field: "settings",
          value: { ...SAVED, offering_id: "cb1f1119-911a-49f7-8bf1-fbc28e21f8ae" },
        }),
      );
    });
    act(() => {
      jest.advanceTimersByTime(2_500);
    });
    const backup = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    expect(backup.settings).toMatchObject({ offering_id: "cb1f1119-911a-49f7-8bf1-fbc28e21f8ae" });
    expect(backup.modelId).toBe("gpt-image-2");
  } finally {
    jest.useRealTimers();
  }
});
