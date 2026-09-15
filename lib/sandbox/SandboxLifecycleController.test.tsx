import React from "react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { act } from "react";
import { createRoot } from "react-dom/client";
import reducer, { applyView, hydrateActor } from "@/lib/redux/slices/sandboxLifecycleSlice";
import { SandboxLifecycleController } from "./SandboxLifecycleController";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockToastSuccess = jest.fn<string, [unknown, unknown?]>(() => "success-toast");
const mockToastWarning = jest.fn<string, [unknown, unknown?]>(() => "warning-toast");
const mockToastError = jest.fn<string, [unknown, unknown?]>(() => "error-toast");
const mockToastDismiss = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { success: (message: unknown, options?: unknown) => mockToastSuccess(message, options), warning: (message: unknown, options?: unknown) => mockToastWarning(message, options), error: (message: unknown, options?: unknown) => mockToastError(message, options), dismiss: (id?: unknown) => mockToastDismiss(id) } }));

const actorId = "11111111-1111-4111-8111-111111111111";
const receipt = { schema_version: 1 as const, row_id: "22222222-2222-4222-8222-222222222222", operation_id: "33333333-3333-4333-8333-333333333333", kind: "stop" as const, observation: "accepted" as const };
const response = (state: "running" | "succeeded") => ({ ok: true, status: 200, json: async () => ({ row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: receipt.kind, state }) }) as Response;
const makeStore = () => configureStore({ reducer: { sandboxLifecycle: reducer } });
function mount(store: ReturnType<typeof makeStore>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Provider store={store}><SandboxLifecycleController /></Provider>); });
  return { unmount: () => act(() => { root.unmount(); container.remove(); }) };
}

describe("mounted sandbox lifecycle observer", () => {
  const originalFetch = global.fetch;
  beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); global.fetch = jest.fn(); });
  afterEach(() => { jest.useRealTimers(); global.fetch = originalFetch; });

  it("keeps a current actor dismissal closed across later polling views", async () => {
    const store = makeStore();
    store.dispatch(hydrateActor({ actorId, receipts: [receipt] }));
    jest.mocked(global.fetch).mockResolvedValue(response("running"));
    const mounted = mount(store);
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    expect(mockToastWarning).toHaveBeenCalled();
    const options = mockToastWarning.mock.calls.at(-1)?.[1] as { onDismiss(): void } | undefined;
    expect(options).toBeDefined();
    act(() => options?.onDismiss());
    const emittedBeforePoll = mockToastWarning.mock.calls.length;
    act(() => { store.dispatch(applyView({ actorId, generation: store.getState().sandboxLifecycle.generation, view: { operation_id: receipt.operation_id, state: "pending", message: "Still running.", sandboxId: "runtime-a", action: "check", dismissed: false } })); });
    expect(store.getState().sandboxLifecycle.views[0].dismissed).toBe(true);
    expect(mockToastWarning).toHaveBeenCalledTimes(emittedBeforePoll);
    expect(mockToastDismiss).toHaveBeenCalledWith("warning-toast");
    mounted.unmount();
  });

  it("refreshes an initially restored terminal receipt without creating a new infinite success toast", async () => {
    const store = makeStore();
    store.dispatch(hydrateActor({ actorId, receipts: [receipt] }));
    jest.mocked(global.fetch).mockResolvedValue(response("succeeded"));
    const mounted = mount(store);
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    expect(store.getState().sandboxLifecycle.views[0]).toEqual(expect.objectContaining({ state: "success", dismissed: true, restored: false }));
    expect(mockToastSuccess).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it("drops the old actor result after logout and relogin as the same actor generation", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    jest.mocked(global.fetch).mockImplementation(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const store = makeStore();
    store.dispatch(hydrateActor({ actorId, receipts: [receipt] }));
    const mounted = mount(store);
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    const oldGeneration = store.getState().sandboxLifecycle.generation;
    act(() => { store.dispatch(hydrateActor({ actorId, receipts: [] })); });
    expect(store.getState().sandboxLifecycle.generation).toBe(oldGeneration + 1);
    await act(async () => { resolveFetch?.(response("succeeded")); await Promise.resolve(); });
    expect(store.getState().sandboxLifecycle.views).toEqual([]);
    expect(mockToastSuccess).not.toHaveBeenCalled();
    mounted.unmount();
  });
});
