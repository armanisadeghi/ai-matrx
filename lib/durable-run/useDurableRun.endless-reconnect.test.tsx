/**
 * "RECONNECTING…" IS NEVER FOREVER, AND A STOP STICKS.
 *
 * The incident (teach-recent-interview trial, 2026-09-15, Rulebook
 * e3b21d77-ddab-484f-b877-6b3ddffd5ddd): a non-technical Expert started a
 * YouTube ingest, watched it run for five minutes, and then watched
 *
 *   "Lost the live view — the run is still going on the server. Reconnecting…"
 *
 * sit on the screen and never resolve — including across a full page reload,
 * minutes later. Stop did nothing. Close did nothing. She gave up.
 *
 * Two mechanisms, both real, both here:
 *
 * 1. The loop could not age out. `unreachable` only counted TRANSPORT
 *    failures, and a cross-worker rejoin is not a transport failure — it is a
 *    perfectly successful HTTP 200 carrying one `processing` snapshot, because
 *    the live channel is a process-local dict on the server. So the ceiling
 *    never moved. The fifteen-minute deadline that should have caught it was a
 *    local inside each `startReconnect` call, so every reload — and every
 *    snapshot that re-entered the function — reset it to zero.
 *
 * 2. A stop did not stick. The rejoin request already in flight had read the
 *    row BEFORE the cancel landed, so it arrived afterwards still saying
 *    `processing`, and the snapshot branch started the loop again over the top
 *    of the user's stop.
 *
 * These tests drive the REAL hook through the REAL `MASTERWORK_RUN_WIRE`. The
 * only thing faked is what the server said — the one thing a client test may
 * fake. Restore either mechanism and they go red.
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
  // A PARTIAL MOCK OF A REAL MODULE DIES ON THE NEXT EXPORT (DD-239): spread
  // the real store so a new export can never take this suite down at import.
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

import { MASTERWORK_RUN_WIRE } from "@/features/masterwork/durable-run/useMasterworkRun";

import {
  STREAM_LOST_MESSAGE,
  useDurableRun,
  type DurableRunHandle,
} from "./useDurableRun";

const RUN_ID = "9d2c1f80-77ac-4d51-9a52-7b6f0e1c4aa3";
const LAUNCH_PATH = "/masterworks/ingest-dump" as const;
const REJOIN_PATH = "/masterworks/runs/{run_id}/rejoin";
const CANCEL_PATH = "/masterworks/runs/{run_id}/cancel";

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

async function tick(
  hook: HookHandle<DurableRunHandle<Result>>,
  ms: number,
): Promise<void> {
  await hook.act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

/**
 * The server this trial actually met: the socket dies mid-run, and then EVERY
 * rejoin succeeds and hands back the row, still `processing`, for ever. This
 * is the normal cross-worker answer, not an outage.
 */
function transportThatNeverGoesLiveAgain(): { rejoins: () => number } {
  let rejoins = 0;
  mockDispatch.mockImplementation(async (request: StreamRequest) => {
    if (request.path === LAUNCH_PATH) {
      request.onStreamEvent?.({
        event: "data",
        data: { type: "masterwork_run", run_id: RUN_ID },
      });
      request.onStreamEvent?.({
        event: "data",
        data: { type: "masterwork_step", message: "Reading…" },
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
      rejoins += 1;
      request.onStreamEvent?.({
        event: "data",
        data: {
          type: "masterwork_run_snapshot",
          run_id: RUN_ID,
          status: "processing",
          error: null,
          result: null,
        },
      });
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
  return { rejoins: () => rejoins };
}

describe("useDurableRun — reconnecting is never forever", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("stops claiming it is reconnecting once the rejoin keeps coming back not-live", async () => {
    const transport = transportThatNeverGoesLiveAgain();
    const hook = await renderHook(useIngestRun);

    await hook.act(() => hook.current.launch({ rulebook_id: "rb" }, "Dump"));
    expect(hook.current.status).toBe("rejoining");
    expect(hook.current.stage).toBe(STREAM_LOST_MESSAGE);

    // A minute of honest trying — the same minute the user sat through.
    await tick(hook, 120_000);

    // It must have actually TRIED, and then stopped lying about it.
    expect(transport.rejoins()).toBeGreaterThan(1);
    expect(hook.current.status).toBe("error");
    expect(hook.current.running).toBe(false);

    // And the terminal sentence is honest and has a remedy: it never claims
    // the run failed, and it tells the person what to do next.
    const error = hook.current.error ?? "";
    expect(error).toContain("lost the live view");
    expect(error).toMatch(/reopen/i);
    expect(error).not.toMatch(/\bfailed\b/i);

    await hook.unmount();
  });

  it("does not restart the fifteen-minute clock every time the loop re-enters", async () => {
    transportThatNeverGoesLiveAgain();
    const hook = await renderHook(useIngestRun);
    await hook.act(() => hook.current.launch({ rulebook_id: "rb" }, "Dump"));
    await tick(hook, 120_000);
    expect(hook.current.status).toBe("error");

    // The moment the live view was first lost is recorded against the RUN, not
    // against a single call — which is what let a page reload buy another
    // fifteen minutes, for ever.
    const pointer = Object.entries(localStorage)
      .filter(([k]) => k.includes(RUN_ID) || k.includes("dump:"))
      .map(([, v]) => {
        try {
          return JSON.parse(v as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((p) => p && typeof p.lostLiveViewAt === "number");
    expect(pointer).toBeTruthy();

    await hook.unmount();
  });

  it("a stop is not undone by the rejoin that was already in flight", async () => {
    let rejoinEmit: ((data: Record<string, unknown>) => void) | null = null;
    mockDispatch.mockImplementation(async (request: StreamRequest) => {
      if (request.path === LAUNCH_PATH) {
        request.onStreamEvent?.({
          event: "data",
          data: { type: "masterwork_run", run_id: RUN_ID },
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
        // Hold the emitter: this attempt read the row BEFORE the cancel and
        // will deliver its stale `processing` snapshot afterwards.
        rejoinEmit = (data) =>
          request.onStreamEvent?.({ event: "data", data });
        return { data: null, error: null };
      }
      if (request.path === CANCEL_PATH) {
        return { data: { status: "cancelled" }, error: null };
      }
      return { data: null, error: null };
    });

    const hook = await renderHook(useIngestRun);
    await hook.act(() => hook.current.launch({ rulebook_id: "rb" }, "Dump"));
    await tick(hook, 2_000);
    expect(hook.current.status).toBe("rejoining");

    // She presses Stop.
    await hook.act(async () => {
      await hook.current.cancel?.();
    });
    const afterStop = hook.current.status;
    expect(afterStop).not.toBe("rejoining");

    // The orphaned rejoin now answers, still saying `processing`.
    await hook.act(async () => {
      rejoinEmit?.({
        type: "masterwork_run_snapshot",
        run_id: RUN_ID,
        status: "processing",
        error: null,
        result: null,
      });
      await jest.advanceTimersByTimeAsync(10_000);
    });

    // Her stop stands. "Reconnecting…" does not come back over the top of it.
    expect(hook.current.status).not.toBe("rejoining");
    expect(hook.current.stage).not.toBe(STREAM_LOST_MESSAGE);

    await hook.unmount();
  });
});
