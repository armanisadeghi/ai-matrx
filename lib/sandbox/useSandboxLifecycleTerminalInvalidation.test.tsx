import { configureStore } from "@reduxjs/toolkit";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import userAuthReducer, { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import sandboxLifecycleReducer, {
  applyView,
  hydrateActor,
} from "@/lib/redux/slices/sandboxLifecycleSlice";
import type { SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";
import { useSandboxLifecycleTerminalInvalidation } from "./useSandboxLifecycleTerminalInvalidation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const actorA = "11111111-1111-4111-8111-111111111111";
const actorB = "22222222-2222-4222-8222-222222222222";
const receipt: SandboxOperationReceipt = {
  schema_version: 1,
  row_id: "33333333-3333-4333-8333-333333333333",
  operation_id: "44444444-4444-4444-8444-444444444444",
  kind: "stop",
  graceful: true,
  observation: "accepted",
};

const makeStore = () => configureStore({
  reducer: { sandboxLifecycle: sandboxLifecycleReducer, userAuth: userAuthReducer },
});

function TerminalHarness({ refresh, current }: {
  refresh: (value: SandboxOperationReceipt) => void;
  current: () => boolean;
}) {
  useSandboxLifecycleTerminalInvalidation(refresh, current);
  return null;
}

describe("useSandboxLifecycleTerminalInvalidation", () => {
  it("delivers each real terminal receipt once and refuses a mismatched actor", async () => {
    const store = makeStore();
    store.dispatch(setUserAuth({ id: actorA }));
    store.dispatch(hydrateActor({ actorId: actorA, receipts: [receipt] }));
    const refresh = jest.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => root.render(
      <Provider store={store}>
        <TerminalHarness refresh={refresh} current={() => true} />
      </Provider>,
    ));
    act(() => store.dispatch(applyView({
      actorId: actorA,
      generation: store.getState().sandboxLifecycle.generation,
      view: { operation_id: receipt.operation_id, state: "success", message: "Stopped.", sandboxId: "runtime-a", action: null, dismissed: false },
    })));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(receipt);

    act(() => store.dispatch(applyView({
      actorId: actorA,
      generation: store.getState().sandboxLifecycle.generation,
      view: { operation_id: receipt.operation_id, state: "success", message: "Still stopped.", sandboxId: "runtime-a", action: null, dismissed: true },
    })));
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => {
      store.dispatch(setUserAuth({ id: actorB }));
      store.dispatch(hydrateActor({ actorId: actorA, receipts: [{ ...receipt, operation_id: "55555555-5555-4555-8555-555555555555" }] }));
      store.dispatch(applyView({
        actorId: actorA,
        generation: store.getState().sandboxLifecycle.generation,
        view: { operation_id: "55555555-5555-4555-8555-555555555555", state: "success", message: "Stopped again.", sandboxId: "runtime-a", action: null, dismissed: false },
      }));
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("checks the mounted consumer scope again before delivering a terminal receipt", async () => {
    const store = makeStore();
    store.dispatch(setUserAuth({ id: actorA }));
    store.dispatch(hydrateActor({ actorId: actorA, receipts: [receipt] }));
    const refresh = jest.fn();
    let current = true;
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <Provider store={store}>
        <TerminalHarness refresh={refresh} current={() => current} />
      </Provider>,
    ));

    current = false;
    act(() => store.dispatch(applyView({
      actorId: actorA,
      generation: store.getState().sandboxLifecycle.generation,
      view: { operation_id: receipt.operation_id, state: "success", message: "Stopped.", sandboxId: "runtime-a", action: null, dismissed: false },
    })));
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("rechecks scope immediately before invoking the consumer callback", async () => {
    const store = makeStore();
    store.dispatch(setUserAuth({ id: actorA }));
    store.dispatch(hydrateActor({ actorId: actorA, receipts: [receipt] }));
    const refresh = jest.fn();
    let scopeChecks = 0;
    const current = () => {
      scopeChecks += 1;
      return scopeChecks === 1;
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <Provider store={store}>
        <TerminalHarness refresh={refresh} current={current} />
      </Provider>,
    ));
    scopeChecks = 0;

    act(() => store.dispatch(applyView({
      actorId: actorA,
      generation: store.getState().sandboxLifecycle.generation,
      view: { operation_id: receipt.operation_id, state: "success", message: "Stopped.", sandboxId: "runtime-a", action: null, dismissed: false },
    })));
    expect(scopeChecks).toBe(2);
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});
