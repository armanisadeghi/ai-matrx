import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { useSyncActiveFileToVariable } from "../useSyncActiveFileToVariable";
import { setHostVariableValues } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";

const dispatched: unknown[] = [];
function makeStore(defs: Array<{ name: string }>, tabs: Record<string, unknown>, activeId: string | null) {
  return configureStore({
    reducer: (state: Record<string, unknown> = {}, action: { type: string }) => {
      dispatched.push(action);
      return {
        codeTabs: { byId: tabs, order: Object.keys(tabs), activeId, recentTabIds: Object.keys(tabs) },
        instanceVariableValues: { byConversationId: { c1: { definitions: defs, userValues: {} } } },
        ...state,
      };
    },
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
}

jest.useFakeTimers();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ name }: { name: string }) {
  useSyncActiveFileToVariable("c1", name);
  return null;
}
function mount(store: ReturnType<typeof makeStore>) {
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Provider store={store}><Probe name="current_code" /></Provider>));
  act(() => { jest.advanceTimersByTime(300); });
  act(() => root.unmount());
}

it("fills the declared variable with the open source file, as a host variable", () => {
  dispatched.length = 0;
  const store = makeStore([{ name: "current_code" }], { a: { id: "a", content: "export const x = 1;", kind: "source" } }, "a");
  mount(store);
  expect(dispatched).toContainEqual(
    setHostVariableValues({ conversationId: "c1", values: { current_code: "export const x = 1;" } }),
  );
});

it("does nothing when the agent declares no such variable", () => {
  dispatched.length = 0;
  const store = makeStore([{ name: "other" }], { a: { id: "a", content: "x", kind: "source" } }, "a");
  mount(store);
  expect(dispatched.filter((a) => (a as { type: string }).type.includes("setHostVariableValues"))).toHaveLength(0);
});
