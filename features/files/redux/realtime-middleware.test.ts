import {
  attachCloudFilesRealtime,
  detachCloudFilesRealtime,
  cloudFilesRealtimeMiddleware,
} from "./realtime-middleware";
import { subscribeToRealtimeManager } from "@ai-matrx/realtime";
jest.mock("@ai-matrx/realtime", () => ({
  defineChannelNamespace: () => ({
    topic: ({ userId }: { userId: string }) => `cloud:${userId}`,
  }),
  subscribeToRealtimeManager: jest.fn(),
}));
jest.mock("@ai-matrx/media/files/engine/redux/converters", () => ({}));
jest.mock("@ai-matrx/media/files/engine/redux/request-ledger", () => ({ ledgerSize: () => 0 }));
jest.mock("@ai-matrx/media/files/engine/redux/thunks", () => ({
  loadUserFileTree: { fulfilled: { match: () => false } },
  reconcileTree: jest.fn(),
}));
jest.mock("@ai-matrx/media/files/engine/redux/slice", () => ({
  setRealtimeStatus: (payload: unknown) => ({ type: "status", payload }),
}));
jest.mock("@/features/files/utils/folder-conventions", () => ({}));
jest.mock("@ai-matrx/media/files/engine/hooks/blob-cache", () => ({}));
jest.mock("@ai-matrx/media/files/engine/hooks/office-extraction-cache", () => ({}));
const subscribe = jest.mocked(subscribeToRealtimeManager);
beforeEach(() => subscribe.mockReset());
function setup() {
  const dispatch = jest.fn();
  const invoke = cloudFilesRealtimeMiddleware({
    dispatch,
    getState: () => ({}),
  })((a) => a);
  return { invoke, dispatch };
}
it("does not leave a subscription after same-turn attach and detach", async () => {
  const stop = jest.fn();
  subscribe.mockReturnValue(stop);
  const { invoke } = setup();
  invoke(attachCloudFilesRealtime("a"));
  invoke(detachCloudFilesRealtime());
  await Promise.resolve();
  await Promise.resolve();
  expect(subscribe).toHaveBeenCalledTimes(1);
  expect(stop).toHaveBeenCalledTimes(1);
});
it("closes the first identity before a same-turn replacement", async () => {
  const stopA = jest.fn(),
    stopB = jest.fn();
  subscribe.mockReturnValueOnce(stopA).mockReturnValueOnce(stopB);
  const { invoke } = setup();
  invoke(attachCloudFilesRealtime("a"));
  invoke(attachCloudFilesRealtime("b"));
  await Promise.resolve();
  await Promise.resolve();
  expect(stopA).toHaveBeenCalledTimes(1);
  invoke(detachCloudFilesRealtime());
  expect(stopB).toHaveBeenCalledTimes(1);
});

type SpecFactory = Parameters<typeof subscribeToRealtimeManager>[0];
/** The channel spec the middleware registered; onBackfill fired as a reconnect. */
function specOf(factory: SpecFactory) {
  const spec = factory({} as Parameters<SpecFactory>[0]);
  const ctx = { reason: "reconnect", topic: "cloud:x", gapMs: null } as const;
  return { onBackfill: () => void spec.onBackfill?.(ctx) };
}

describe("background backfill while the tab is hidden", () => {
  let visibility: DocumentVisibilityState = "visible";
  beforeAll(() =>
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    }),
  );
  const setVisibility = (next: DocumentVisibilityState) => {
    visibility = next;
    document.dispatchEvent(new Event("visibilitychange"));
  };
  afterEach(() => setVisibility("visible"));

  it("defers the whole-tree reconcile until the tab is visible again", async () => {
    const reconcile = jest.requireMock("@ai-matrx/media/files/engine/redux/thunks").reconcileTree as jest.Mock;
    reconcile.mockReset();
    const loaded = jest.requireMock("@ai-matrx/media/files/engine/redux/thunks").loadUserFileTree.fulfilled;
    loaded.match = (a: { type: string }) => a.type === "tree-loaded";
    subscribe.mockReturnValue(jest.fn());
    const { invoke } = setup();
    invoke(attachCloudFilesRealtime("a"));
    await Promise.resolve();
    await Promise.resolve();
    invoke({ type: "tree-loaded" }); // the initial snapshot resolved
    const spec = specOf(subscribe.mock.calls[0][0]);

    setVisibility("hidden");
    spec.onBackfill();
    spec.onBackfill();
    expect(reconcile).not.toHaveBeenCalled();

    setVisibility("visible");
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith({ userId: "a" });
    invoke(detachCloudFilesRealtime());
  });

  it("drops a deferred reconcile when the channel is torn down", async () => {
    const reconcile = jest.requireMock("@ai-matrx/media/files/engine/redux/thunks").reconcileTree as jest.Mock;
    reconcile.mockReset();
    subscribe.mockReturnValue(jest.fn());
    const { invoke } = setup();
    // Past the reconcile cooldown, so only the teardown can stop it.
    const now = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 3_600_000);
    invoke(attachCloudFilesRealtime("b"));
    await Promise.resolve();
    await Promise.resolve();
    invoke({ type: "tree-loaded" });
    const spec = specOf(subscribe.mock.calls.at(-1)![0]);
    setVisibility("hidden");
    spec.onBackfill();
    invoke(detachCloudFilesRealtime());
    setVisibility("visible");
    expect(reconcile).not.toHaveBeenCalled();
    now.mockRestore();
  });
});
