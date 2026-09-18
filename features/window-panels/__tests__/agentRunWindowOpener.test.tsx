import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import overlayReducer from "@/lib/redux/slices/overlaySlice";
// eslint-disable-next-line no-restricted-syntax -- the opener reads the real Surface A organization selection.
import appContext, { setOrganization } from "@/lib/redux/slices/appContextSlice";
import userAuth, { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import {
  useOpenAgentRunWindow,
  type AgentRunWindowHandle,
} from "@/features/overlays/openers/agentRunWindow";

/**
 * The opener stamps the window with WHO is running it and WHICH workspace the
 * run is filed in, read out of the live store at press time. So the store here
 * carries the real `userAuth` and `appContext` reducers seeded the way boot
 * seeds them — never a stubbed selector, which would let the stamp silently
 * become null while this stayed green.
 */
const USER = "1f4d0b52-1b6e-4a0e-8f0c-9a1c2d3e4f50";
const ORG = "9a0a9f3c-1c2f-4a1b-9c0d-0b3b7e2f4a11";
function createStore(
  seed: { userId?: string; organizationId?: string } = {
    userId: USER,
    organizationId: ORG,
  },
) {
  const store = configureStore({
    reducer: { overlays: overlayReducer, userAuth, appContext },
  });
  if (seed.userId) store.dispatch(setUserAuth({ id: seed.userId }));
  if (seed.organizationId)
    store.dispatch(setOrganization({ id: seed.organizationId }));
  return store;
}

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

  it("carries the mandate door and the adopted surface into the overlay data", async () => {
    const store = createStore();
    let handle: AgentRunWindowHandle | null = null;

    function Harness() {
      const open = useOpenAgentRunWindow();
      return (
        <button
          type="button"
          onClick={() => {
            handle = open({
              instanceId: "goal-writer:research_client.output_slides",
              initialAgentId: "holder-under-test",
              mandateKey: "mandate.goal_writer",
              surfaceName: "matrx-admin/mandate-workspace",
              initialVariableValues: { task_overview: "Job: x" },
              initialAutoRun: true,
            });
          }}
        >
          Open on mandate
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
    await act(async () => {
      container.querySelector("button")?.click();
      await Promise.resolve();
    });

    expect(handle!.instanceId).toBe("goal-writer:research_client.output_slides");
    const inst =
      store.getState().overlays.overlays.agentRunWindow[handle!.instanceId];
    expect(inst?.data).toMatchObject({
      initialAgentId: "holder-under-test",
      mandateKey: "mandate.goal_writer",
      surfaceName: "matrx-admin/mandate-workspace",
      initialVariableValues: { task_overview: "Job: x" },
      initialAutoRun: true,
      // WHO pressed it and WHICH workspace the run belongs to, read from the
      // live store — a window opened without them files its work nowhere.
      initialResourceIdentity: { userId: USER, organizationId: ORG },
    });
  });

  // Break caught: inventing an identity when no workspace is selected. Half an
  // identity is worse than none — the run would be filed against a workspace
  // nobody chose. The opener must stamp null and let the run refuse.
  it("stamps no identity when no organization is selected", async () => {
    const store = createStore({ userId: USER });
    let handle: AgentRunWindowHandle | null = null;

    function Harness() {
      const open = useOpenAgentRunWindow();
      return (
        <button
          type="button"
          onClick={() => {
            handle = open({ initialAgentId: "holder-under-test" });
          }}
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
    await act(async () => {
      container.querySelector("button")?.click();
      await Promise.resolve();
    });

    const inst =
      store.getState().overlays.overlays.agentRunWindow[handle!.instanceId];
    expect(inst?.data).toMatchObject({ initialResourceIdentity: null });
  });

  it("opens and closes independent chat instances", async () => {
    const store = createStore();
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
