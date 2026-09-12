/**
 * A LOST STREAM IS NEVER A FAILED RUN.
 *
 * The incident this guards (2026-09-12 03:10Z, Rulebook
 * 1505da2a-2820-436c-8a55-95ff3e48ee85): the ingest run's socket was cut at
 * +60s, the rejoin landed on a worker that was not executing the run, and the
 * durable ROW — still `processing` — came back as a snapshot. The hook printed
 * the Masterwork wire's `unfinishedMessage`, "This run stopped before it
 * finished — nothing was saved. You can start it again." The row went
 * `completed` at 03:15:15 with 115 rules and `error` NULL, and the person paid
 * for a second full distillation.
 *
 * So these tests drive the REAL `MASTERWORK_RUN_WIRE` (the one that carries
 * that sentence) through a mid-run transport loss, mocked at the transport
 * boundary the hook actually calls, and assert the hook never says a run
 * failed unless the ROW says it failed.
 */

import { renderHook, type HookHandle } from "@/test-utils/renderHook";

const mockDispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (request: Record<string, unknown>) => request,
}));

jest.mock(
  "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream",
  () => ({ adoptForeignStream: jest.fn() }),
);

jest.mock(
  "@/features/agents/redux/execution-system/active-requests/active-requests.slice",
  () => ({ removeRequest: jest.fn() }),
);

jest.mock("@/features/overlays/openers/liveRunWindow", () => ({
  useFloatingLiveRun: jest.fn(),
}));

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(),
}));

import { MASTERWORK_RUN_WIRE } from "@/features/masterwork/durable-run/useMasterworkRun";

import {
  STREAM_LOST_MESSAGE,
  useDurableRun,
  type DurableRunHandle,
} from "./useDurableRun";

/** Under fake timers the reconnect loop only moves when we move it. */
async function tick(
  hook: HookHandle<DurableRunHandle<Result>>,
  ms = 30_000,
): Promise<void> {
  await hook.act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

const RUN_ID = "4587e534-316c-4db1-af3a-02241f7b551f";
const LAUNCH_PATH = "/masterworks/ingest-dump" as const;
const REJOIN_PATH = "/masterworks/runs/{run_id}/rejoin";

/** The sentence that must NEVER appear over a run the row says is alive. */
const FALSE_FAILURE = MASTERWORK_RUN_WIRE.unfinishedMessage as string;

type StreamRequest = {
  path: string;
  onStreamEvent?: (event: {
    event: "data";
    data: Record<string, unknown>;
  }) => void;
};

type Result = { added: number };

function useIngestRun(): DurableRunHandle<Result> {
  return useDurableRun<Result>({
    wire: MASTERWORK_RUN_WIRE,
    key: `dump:${RUN_ID}`,
    path: LAUNCH_PATH,
    finalEvent: "masterwork_dump_complete",
    stageLabels: {},
    stageFallback: (_name, data) =>
      typeof data.message === "string" ? data.message : null,
  });
}

/**
 * The transport. The launch stream announces the run, narrates one stage, and
 * then DIES mid-run exactly as a proxy idle-cut does — `callApi` classifies a
 * broken body as `stream_transport_lost` (`lib/api/stream-parser.ts`). Each
 * rejoin then answers with whatever the durable row says next.
 */
function transport(rejoinSnapshots: Record<string, unknown>[]): void {
  let rejoins = 0;
  mockDispatch.mockImplementation(async (request: StreamRequest) => {
    if (request.path === LAUNCH_PATH) {
      request.onStreamEvent?.({
        event: "data",
        data: { type: "masterwork_run", run_id: RUN_ID },
      });
      request.onStreamEvent?.({
        event: "data",
        data: { type: "masterwork_step", message: "Reading your sources" },
      });
      return {
        data: null,
        error: {
          type: "network_error",
          message: "The connection dropped.",
          code: "stream_transport_lost",
        },
      };
    }
    if (request.path === REJOIN_PATH) {
      const snapshot =
        rejoinSnapshots[Math.min(rejoins, rejoinSnapshots.length - 1)];
      rejoins += 1;
      request.onStreamEvent?.({
        event: "data",
        data: { type: "masterwork_run_snapshot", run_id: RUN_ID, ...snapshot },
      });
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
}

describe("useDurableRun — a lost stream is never a failed run", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("says it is reconnecting while the row is still processing, then renders the result", async () => {
    transport([
      { status: "processing", error: null, result: null },
      { status: "processing", error: null, result: null },
      {
        status: "completed",
        error: null,
        result: { added: 115 },
      },
    ]);
    const hook = await renderHook(useIngestRun);
    const seenErrors: (string | null)[] = [];
    const record = (): void => {
      seenErrors.push(hook.current.error);
    };

    await hook.act(() => hook.current.launch({ rulebook_id: "rb" }, "Dump"));
    record();

    // The socket is gone. The run is not.
    expect(hook.current.status).toBe("rejoining");
    expect(hook.current.running).toBe(true);
    expect(hook.current.error).toBeNull();
    expect(hook.current.stage).toBe(STREAM_LOST_MESSAGE);
    expect(hook.current.stages).toContain(STREAM_LOST_MESSAGE);

    // Two rejoins that still find the row processing must change nothing but
    // the fact that we are still asking.
    for (let i = 0; i < 2; i += 1) {
      await tick(hook, 5_000);
      record();
      expect(hook.current.status).toBe("rejoining");
      expect(hook.current.error).toBeNull();
    }

    // The row completes; the rejoin renders the same answer the live path would.
    await tick(hook, 30_000);
    record();

    expect(hook.current.result).toEqual({ added: 115 });
    expect(hook.current.error).toBeNull();
    expect(hook.current.running).toBe(false);
    expect(seenErrors).not.toContain(FALSE_FAILURE);
    await hook.unmount();
  });

  it("shows the ROW's own error, once the row itself says it failed", async () => {
    transport([
      { status: "processing", error: null, result: null },
      {
        status: "failed",
        error: {
          type: "run_lost",
          message: "worker died",
          user_message: "We lost this run before anything was saved.",
        },
        result: null,
      },
    ]);
    const hook = await renderHook(useIngestRun);

    await hook.act(() => hook.current.launch({ rulebook_id: "rb" }, "Dump"));
    expect(hook.current.status).toBe("rejoining");

    // Only the FIRST rejoin (t+1.5s) has fired: the row still says processing.
    await tick(hook, 2_000);
    expect(hook.current.status).toBe("rejoining");
    expect(hook.current.error).toBeNull();

    // The next one finds the row failed.
    await tick(hook, 30_000);
    expect(hook.current.status).toBe("error");
    expect(hook.current.error).toBe(
      "We lost this run before anything was saved.",
    );
    expect(hook.current.running).toBe(false);
    await hook.unmount();
  });

  it("falls back to the wire's sentence only when a failed row recorded no reason", async () => {
    transport([{ status: "failed", error: null, result: null }]);
    const hook = await renderHook(useIngestRun);

    await hook.act(() => hook.current.launch({ rulebook_id: "rb" }, "Dump"));
    await tick(hook, 5_000);
    expect(hook.current.status).toBe("error");
    expect(hook.current.error).toBe(FALSE_FAILURE);
    await hook.unmount();
  });
});
