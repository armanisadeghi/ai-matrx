import React from "react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { act } from "react";
import { createRoot } from "react-dom/client";
import reducer, { hydrateActor, upsertReceipt } from "@/lib/redux/slices/sandboxLifecycleSlice";
import { SandboxLifecycleController } from "./SandboxLifecycleController";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toastSuccess = jest.fn<string, [unknown, unknown?]>(() => "success-toast");
const toastWarning = jest.fn<string, [unknown, unknown?]>(() => "warning-toast");
const toastError = jest.fn<string, [unknown, unknown?]>(() => "error-toast");
jest.mock("@/lib/toast", () => ({
  toast: {
    success: (m: unknown, o?: unknown) => toastSuccess(m, o),
    warning: (m: unknown, o?: unknown) => toastWarning(m, o),
    error: (m: unknown, o?: unknown) => toastError(m, o),
    dismiss: jest.fn(),
  },
}));

/**
 * THE DEFECT: a stop that took still toasted "Could not confirm this sandbox operation; check status."
 * whenever the operation receipt was unreadable (the proxy answers 502 `outcome_unknown` once the
 * orchestrator no longer has it). The sandbox row is the second witness: stopped / shutting_down
 * means it stopped, so the toast must say so; it warns only when neither witness can confirm.
 */
const actorId = "11111111-1111-4111-8111-111111111111";
const receipt = {
  schema_version: 1 as const,
  row_id: "22222222-2222-4222-8222-222222222222",
  operation_id: "33333333-3333-4333-8333-333333333333",
  kind: "stop" as const,
  observation: "accepted" as const,
};
const receiptUnreadable = () =>
  ({ ok: false, status: 502, json: async () => ({ error: "Could not confirm sandbox lifecycle operation", status: "outcome_unknown" }) }) as Response;
const instance = (status: string) => ({ ok: true, status: 200, json: async () => ({ instance: { status } }) }) as Response;

function mount() {
  const store = configureStore({ reducer: { sandboxLifecycle: reducer } });
  // A stop the person just made in this tab (the seam `useSandboxLifecycleSubmission` publishes through):
  // not a restored receipt, so its terminal answer is announced.
  store.dispatch(hydrateActor({ actorId, receipts: [] }));
  act(() => { store.dispatch(upsertReceipt(receipt)); });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<Provider store={store}><SandboxLifecycleController /></Provider>); });
  return { store, unmount: () => act(() => { root.unmount(); container.remove(); }) };
}

describe("a stop whose receipt cannot be read is confirmed from the sandbox itself", () => {
  const originalFetch = global.fetch;
  beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); global.fetch = originalFetch; });

  it("says Stopped when the row went shutting_down after a poll or two, never the warning", async () => {
    const statuses = ["running", "shutting_down"];
    global.fetch = jest.fn(async (url: unknown) =>
      String(url).includes("lifecycle-operations") ? receiptUnreadable() : instance(statuses.shift() ?? "stopped"),
    ) as typeof fetch;
    const { store, unmount } = mount();
    await act(async () => { await jest.advanceTimersByTimeAsync(10_000); });
    expect(toastSuccess).toHaveBeenCalledWith("Stopped.", expect.anything());
    expect(toastWarning.mock.calls.map((c) => String(c[0]))).not.toContain("Could not confirm this sandbox operation; check status.");
    expect(store.getState().sandboxLifecycle.views[0]).toEqual(expect.objectContaining({ state: "success", message: "Stopped." }));
    unmount();
  });

  it("still warns when neither the receipt nor the sandbox can confirm", async () => {
    global.fetch = jest.fn(async (url: unknown) =>
      String(url).includes("lifecycle-operations") ? receiptUnreadable() : instance("running"),
    ) as typeof fetch;
    const { unmount } = mount();
    await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastWarning.mock.calls.map((c) => String(c[0]))).toContain("Could not confirm this sandbox operation; check status.");
    unmount();
  });
});
