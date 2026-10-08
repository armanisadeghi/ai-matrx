/** @jest-environment jsdom */

/**
 * A Model-battle column is named after its model, read from the model catalog.
 * The catalog is not Redux state, so a plain `useAppSelector(selectActiveBattleColumns)`
 * kept "Model 3" on screen after the model list finished loading. The columns
 * the screen reads must update when the catalog loads, with NO store change.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveBattleColumns } from "../activeBattleColumns";
import { useCatalogBoundSelector } from "../useCatalogBoundSelector";

const catalog = {
  state: { entities: {} as Record<string, unknown>, identityById: {} as Record<string, unknown> },
  listeners: new Set<() => void>(),
  load(entities: Record<string, unknown>) {
    this.state = { ...this.state, entities };
    this.listeners.forEach((l) => l());
  },
};
jest.mock("@ai-matrx/chat/agents/identity/model-catalog", () => {
  const { useSyncExternalStore } = jest.requireActual("react");
  return {
    readModelRecords: () => catalog.state,
    useModelRecords: <T,>(select: (s: typeof catalog.state) => T): T =>
      useSyncExternalStore(
        (cb: () => void) => {
          catalog.listeners.add(cb);
          return () => catalog.listeners.delete(cb);
        },
        () => select(catalog.state),
      ),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeStore() {
  const reducer = createSlimRootReducer();
  const base = reducer(undefined, { type: "init" }) as any;
  return configureStore({
    reducer: (s: any = {
      ...base,
      agentComparison: { ...base.agentComparison, mountedMode: "model" },
      agentComparisonModel: {
        ...base.agentComparisonModel,
        locked: { agentId: "a", agentVersion: "current", agentVersionId: null },
        columns: [{ columnId: "c1", conversationId: "conv", label: "Model 3", collapsed: false }],
      },
      instanceModelOverrides: {
        byConversationId: { conv: { overrides: { model: "astra" }, removals: [], baseSettings: {} } },
      },
    }) => s,
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
}

function labelOf(useIt: (sel: typeof selectActiveBattleColumns) => ReturnType<typeof selectActiveBattleColumns>) {
  const store = makeStore();
  catalog.state = { entities: {}, identityById: {} };
  const host = document.createElement("div");
  function Probe() {
    const cols = useIt(selectActiveBattleColumns);
    return <span data-testid="label">{cols[0]?.label}</span>;
  }
  const root = createRoot(host);
  act(() => root.render(<Provider store={store}><Probe /></Provider>));
  return { text: () => host.textContent, root };
}

describe("battle column names follow the model catalog", () => {
  it("renames the column when the catalog loads, with no Redux change", () => {
    const { text, root } = labelOf(useCatalogBoundSelector);
    expect(text()).toBe("Model 3");
    act(() => catalog.load({ astra: { name: "GPT-6 Astra" } }));
    expect(text()).toBe("GPT-6 Astra");
    act(() => root.unmount());
  });

  it("(control) a plain useAppSelector does not see the load — the bug this guards", () => {
    const { text, root } = labelOf(useAppSelector);
    expect(text()).toBe("Model 3");
    act(() => catalog.load({ astra: { name: "GPT-6 Astra" } }));
    expect(text()).toBe("Model 3");
    act(() => root.unmount());
  });
});
