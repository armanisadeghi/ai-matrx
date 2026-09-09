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
jest.mock("./converters", () => ({}));
jest.mock("./request-ledger", () => ({ ledgerSize: () => 0 }));
jest.mock("./thunks", () => ({
  loadUserFileTree: { fulfilled: { match: () => false } },
  reconcileTree: jest.fn(),
}));
jest.mock("./slice", () => ({
  setRealtimeStatus: (payload: unknown) => ({ type: "status", payload }),
}));
jest.mock("@/features/files/utils/folder-conventions", () => ({}));
jest.mock("@/features/files/hooks/blob-cache", () => ({}));
jest.mock("@/features/files/hooks/office-extraction-cache", () => ({}));
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
