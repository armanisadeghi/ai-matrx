/**
 * A DEPLOY IS NOT A LOSS — AND A RUN A DEPLOY REALLY DID LOSE IS NOT A GENERIC
 * FAILURE.
 *
 * aidream's deploy train replaces the ECS task under a run every ~20-30
 * minutes. It used to orphan whatever was in flight; now the recovery sweep
 * re-queues the row from its checkpoint and the run keeps going — but the
 * person watching still needs to be told THAT is what happened, not left to
 * read "Reconnecting…" and wonder whether the network is failing them.
 *
 * This drives the REAL hook through the REAL `MASTERWORK_RUN_WIRE` and renders
 * the REAL `DurableRunInterruption` / `DurableRunFailure` components into a
 * REAL DOM, exactly as `useDurableRun.honest-wait.test.tsx` does. The only
 * thing faked is the transport — what the SERVER said — which is the one
 * thing a client test may fake.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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

import { DurableRunFailure } from "./DurableRunFailure";
import { DurableRunInterruption } from "./DurableRunInterruption";
import {
  RESUMING_AFTER_RESTART_DETAIL,
  RESUMING_AFTER_RESTART_MESSAGE,
  useDurableRun,
  type DurableRunHandle,
} from "./useDurableRun";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const RUN_ID = "9c2e6a0e-2c8e-4a2a-9e1c-4a2f9d9a7b10";
const LAUNCH_PATH = "/masterworks/ingest-corpus" as const;
const REJOIN_PATH = "/masterworks/runs/{run_id}/rejoin";
const POINTER_KEY = `${MASTERWORK_RUN_WIRE.pointerPrefix}corpus:${RUN_ID}`;

type Result = { added: number };

interface Probe {
  container: HTMLElement;
  run: () => DurableRunHandle<Result>;
  unmount: () => Promise<void>;
}

/** Same reduced dialog shape as the honest-wait suite, plus the interruption
 *  notice a real Masterwork dialog now renders next to it. */
async function renderIngestDialog(): Promise<Probe> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  let latest!: DurableRunHandle<Result>;

  function Dialog(): React.ReactElement {
    const run = useDurableRun<Result>({
      wire: MASTERWORK_RUN_WIRE,
      key: `corpus:${RUN_ID}`,
      path: LAUNCH_PATH,
      finalEvent: "masterwork_ingest_complete",
      stageLabels: {},
      stageFallback: (_name, data) =>
        typeof data.message === "string" ? data.message : null,
    });
    latest = run;
    return (
      <div>
        {run.running ? <p data-testid="wait">{run.waitMessage}</p> : null}
        {run.running ? (
          <DurableRunInterruption interruption={run.interruption} />
        ) : null}
        <DurableRunFailure
          error={run.error}
          retry={run.retry}
          running={run.running}
        />
      </div>
    );
  }

  await act(async () => {
    root = createRoot(container);
    root.render(<Dialog />);
  });

  return {
    container,
    run: () => latest,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

type StreamRequest = {
  path: string;
  onStreamEvent?: (event: {
    event: "data";
    data: Record<string, unknown>;
  }) => void;
};

describe("a durable run tells a person a deploy resumed it, and only that", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  /**
   * THE LIVE PATH. The stream stays open through the drain — exactly what
   * `detach_on_disconnect` plus a checkpointed resume produces when the
   * recovery sweep wins the race before the socket dies.
   */
  it("shows the sentence the moment the live stream announces a drain, without touching status", async () => {
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
        request.onStreamEvent?.({
          event: "data",
          data: {
            type: "masterwork_run_draining",
            run_id: RUN_ID,
            reason: "deploy_drain",
            user_message:
              "The server is restarting. This run will pick up where it left off — nothing you have already paid for is repeated.",
          },
        });
        // The stream stays open — the recovery sweep won before the socket died.
        return new Promise(() => {});
      }
      return { data: null, error: null };
    });

    const probe = await renderIngestDialog();
    await act(async () => {
      void probe.run().launch({ rulebook_id: "rb" }, "Write Simply");
    });

    expect(probe.run().status).toBe("running");
    expect(probe.run().error).toBeNull();
    expect(probe.container.textContent).toContain(
      RESUMING_AFTER_RESTART_MESSAGE,
    );
    expect(probe.container.textContent).toContain(
      RESUMING_AFTER_RESTART_DETAIL,
    );

    await probe.unmount();
  });

  /**
   * THE REJOIN PATH. A reload lands on a fresh mount with nothing but the
   * pointer — the durable snapshot's OWN metadata is the only thing that can
   * say a deploy is why we're picking this back up.
   */
  it("shows the sentence on a reload, from the rejoin snapshot's own _drain metadata", async () => {
    localStorage.setItem(
      POINTER_KEY,
      JSON.stringify({
        runId: RUN_ID,
        startedAt: Date.now(),
        target: "Write Simply",
        settled: false,
      }),
    );
    let rejoins = 0;
    mockDispatch.mockImplementation(async (request: StreamRequest) => {
      if (request.path === REJOIN_PATH) {
        rejoins += 1;
        if (rejoins === 1) {
          request.onStreamEvent?.({
            event: "data",
            data: {
              type: "masterwork_run_snapshot",
              run_id: RUN_ID,
              status: "processing",
              error: null,
              result: null,
              metadata: { _drain: { reason: "deploy_drain", at: "now" } },
            },
          });
          return { data: null, error: null };
        }
        // End the reconnect loop the first snapshot starts, so the test settles.
        request.onStreamEvent?.({
          event: "data",
          data: {
            type: "masterwork_run_snapshot",
            run_id: RUN_ID,
            status: "completed",
            error: null,
            result: { added: 13 },
          },
        });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    const probe = await renderIngestDialog();
    await act(async () => {
      await Promise.resolve();
    });

    expect(probe.container.textContent).toContain(
      RESUMING_AFTER_RESTART_MESSAGE,
    );
    expect(probe.container.textContent).toContain(
      RESUMING_AFTER_RESTART_DETAIL,
    );

    // Let the reconnect loop it kicked off reach the completed snapshot so
    // nothing is left in flight when the test ends.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(probe.run().result).toEqual({ added: 13 });

    await probe.unmount();
  });

  /**
   * THE NEGATIVE. An ordinary run that nobody's deploy ever touched must never
   * show a sentence about restarting — the hook only ever sets this from a
   * real signal, never as ambient copy on every long run.
   */
  it("never shows the sentence for a normal run nobody's deploy touched", async () => {
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
        return new Promise(() => {});
      }
      return { data: null, error: null };
    });

    const probe = await renderIngestDialog();
    await act(async () => {
      void probe.run().launch({ rulebook_id: "rb" }, "Write Simply");
    });

    expect(probe.run().running).toBe(true);
    expect(probe.run().interruption).toBeNull();
    expect(probe.container.textContent).not.toContain(
      RESUMING_AFTER_RESTART_MESSAGE,
    );

    await probe.unmount();
  });

  /**
   * THE GENUINELY LOST RUN. `run_lost` is the server's verdict that a restart
   * did NOT resume this one — its `user_message` already says it was not the
   * person's fault, and `remedy` says what to actually do. Both survive to the
   * screen verbatim; a generic "Something went wrong" is exactly the class
   * this closes.
   */
  it("renders the run_lost document's own user_message and remedy, verbatim", async () => {
    const USER_MESSAGE =
      "The server restarted and this run could not be picked back up.";
    const REMEDY = "Start it again — nothing you already approved was lost.";
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
        request.onStreamEvent?.({
          event: "data",
          data: {
            type: "masterwork_run_snapshot",
            run_id: RUN_ID,
            status: "failed",
            error: {
              type: "run_lost",
              operation: "ingest-corpus",
              message: "worker died mid-checkpoint",
              user_message: USER_MESSAGE,
              remedy: REMEDY,
            },
            result: null,
          },
        });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    const probe = await renderIngestDialog();
    await act(async () => {
      void probe.run().launch(
        { rulebook_id: "rb", urls: ["https://www.paulgraham.com/simply.html"] },
        "Write Simply",
      );
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });

    expect(probe.run().status).toBe("error");
    expect(probe.container.textContent).toContain(USER_MESSAGE);
    expect(probe.container.textContent).toContain(REMEDY);
    // Never the generic stand-in this class replaces.
    expect(probe.container.textContent).not.toContain(
      "Something went wrong",
    );

    await probe.unmount();
  });
});
