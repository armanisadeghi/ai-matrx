import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import overlayReducer from "@/lib/redux/slices/overlaySlice";
import {
  useOpenAgentRunWindow,
  type AgentRunWindowHandle,
} from "@/features/overlays/openers/agentRunWindow";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("agentRunWindow opener", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens and closes independent chat instances", async () => {
    const store = configureStore({ reducer: { overlays: overlayReducer } });
    const handles: AgentRunWindowHandle[] = [];

    function Harness() {
      const open = useOpenAgentRunWindow();
      return (
        <button
          type="button"
          onClick={() =>
            handles.push(open({ initialAgentId: "agent-under-test" }))
          }
        >
          Open chat
        </button>
      );
    }

    await act(async () => {
      root.render(
        <Provider store={store}>
          <Harness />
        </Provider>,
      );
      await Promise.resolve();
    });

    const button = container.querySelector("button");
    await act(async () => {
      button?.click();
      button?.click();
      await Promise.resolve();
    });

    expect(handles).toHaveLength(2);
    expect(handles[0].instanceId).not.toBe(handles[1].instanceId);
    expect(
      Object.keys(store.getState().overlays.overlays.agentRunWindow),
    ).toHaveLength(2);

    await act(async () => {
      handles[0].close();
      await Promise.resolve();
    });

    expect(
      store.getState().overlays.overlays.agentRunWindow[handles[0].instanceId],
    ).toBeUndefined();
    expect(
      store.getState().overlays.overlays.agentRunWindow[handles[1].instanceId]
        ?.isOpen,
    ).toBe(true);
  });
});
