import { renderHook } from "@/test-utils/renderHook";

const mockDispatch = jest.fn();
const mockCallApi = jest.fn((request: Record<string, unknown>) => request);

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (request: Record<string, unknown>) => mockCallApi(request),
}));

jest.mock("@/features/agents/redux/execution-system/thunks/adopt-foreign-stream", () => ({
  adoptForeignStream: jest.fn(),
}));

jest.mock("@/features/agents/redux/execution-system/active-requests/active-requests.slice", () => ({
  removeRequest: jest.fn(),
}));

jest.mock("@/features/overlays/openers/liveRunWindow", () => ({
  useFloatingLiveRun: jest.fn(),
}));

import {
  useDurableRun,
  type DurableRunHandle,
  type DurableRunWire,
} from "./useDurableRun";

const WIRE: DurableRunWire = {
  pointerPrefix: "test.durable-run.organization.",
  discriminator: "kind",
  runStartedEvent: "test.run_started",
  snapshotEvent: "test.run_snapshot",
  failedEvent: "test.run_failed",
  rejoinPath: "/seo/public/runs/{run_id}/rejoin",
  relation: "test.run",
};

type LaunchWithScope<TResult> = DurableRunHandle<TResult>["launch"] &
  ((
    body: Record<string, unknown>,
    target: string,
    options: { scopeOverrides: Record<string, string> },
  ) => Promise<void>);

describe("useDurableRun launch organization context", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockDispatch.mockImplementation(async (request: Record<string, unknown>) => {
      const onStreamEvent = request.onStreamEvent as
        | ((event: { event: "data"; data: Record<string, unknown> }) => void)
        | undefined;
      if (request.path === "/seo/keywords/topics/backfill") {
        onStreamEvent?.({
          event: "data",
          data: { kind: "test.run_started", run_id: "run-1" },
        });
      }
      return { data: null, error: null };
    });
  });

  it("keeps a per-launch organization on both launch and rejoin", async () => {
    const hook = await renderHook(() =>
      useDurableRun<Record<string, unknown>>({
        wire: WIRE,
        key: "topic-placement",
        path: "/seo/keywords/topics/backfill",
        finalEvent: "test.result",
        stageLabels: {},
        scopeOverrides: { organization_id: "system-org" },
      }),
    );

    await hook.act(() =>
      (hook.current.launch as LaunchWithScope<Record<string, unknown>>)(
        { site_id: "site-1" },
        "Data Destruction",
        { scopeOverrides: { organization_id: "site-org" } },
      ),
    );

    expect(mockCallApi).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: "/seo/keywords/topics/backfill",
        scopeOverrides: { organization_id: "site-org" },
      }),
    );
    await hook.unmount();

    const rejoined = await renderHook(() =>
      useDurableRun<Record<string, unknown>>({
        wire: WIRE,
        key: "topic-placement",
        path: "/seo/keywords/topics/backfill",
        finalEvent: "test.result",
        stageLabels: {},
        scopeOverrides: { organization_id: "system-org" },
      }),
    );

    expect(mockCallApi).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: "/seo/public/runs/{run_id}/rejoin",
        scopeOverrides: { organization_id: "site-org" },
      }),
    );
    await rejoined.unmount();
  });
});
