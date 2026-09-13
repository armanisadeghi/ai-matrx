/**
 * CANCEL MUST ACTUALLY CANCEL, AND A STOP IS NEVER AN ERROR.
 *
 * The defect (masterwork-methods-census REGISTER D4's open tail, 2026-09-12):
 * `platform.masterwork_run` had no cancel endpoint, so every ingest dialog's
 * Cancel could only close the dialog. The run — and the money it was spending —
 * carried on, the durable row went on saying `processing`, and the button was
 * documented as "leaving, not stopping". A control that looks like a stop and
 * is not one is the lying-screen defect, not a UX nit.
 *
 * The second half is quieter and was just as wrong: `cancelled` sat in the
 * hook's FAILED_STATUSES, so the moment a stop COULD be recorded, a person who
 * deliberately stopped their own run would have been shown a red failure
 * sentence with "Try it again" under it.
 *
 * These tests drive the REAL hook through the REAL `MASTERWORK_RUN_WIRE` and
 * render a REAL DOM. The only thing faked is the transport — what the server
 * said — which is the one thing a client test may fake.
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
import { useDurableRun, type DurableRunHandle } from "./useDurableRun";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const RUN_ID = "9cd6ff66-6804-4a2a-b560-eaf4ae8db2a9";
const LAUNCH_PATH = "/masterworks/ingest-corpus" as const;
const CANCEL_PATH = "/masterworks/runs/{run_id}/cancel";
const REJOIN_PATH = "/masterworks/runs/{run_id}/rejoin";

type Result = { added: number };

interface Probe {
  container: HTMLElement;
  run: () => DurableRunHandle<Result>;
  unmount: () => Promise<void>;
}

/**
 * The real dialog shape, reduced to what is under test: a Stop control that
 * exists ONLY when the run can really be stopped, and the stopped sentence.
 * `DurableRunFailure` is rendered too, so a stop leaking into the failure
 * channel shows up here as a visible "Try it again".
 */
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
      expectedMs: 160_000,
      finalEvent: "masterwork_ingest_complete",
      stageLabels: {},
      stageFallback: (_name, data) =>
        typeof data.message === "string" ? data.message : null,
    });
    latest = run;
    return (
      <div>
        {run.running ? <p data-testid="wait">{run.waitMessage}</p> : null}
        {run.cancel ? (
          <button onClick={() => void run.cancel?.("the person clicked Stop")}>
            {run.cancelling ? "Stopping…" : "Stop this run"}
          </button>
        ) : null}
        {run.stoppedMessage ? (
          <p data-testid="stopped">{run.stoppedMessage}</p>
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

function buttonLabelled(
  container: HTMLElement,
  label: string,
): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === label,
    ) ?? null
  );
}

type StreamRequest = {
  path: string;
  pathParams?: Record<string, string>;
  body?: Record<string, unknown>;
  onStreamEvent?: (event: {
    event: "data";
    data: Record<string, unknown>;
  }) => void;
};

describe("Cancel stops the run on the server, and a stop is not a failure", () => {
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
   * THE DEFECT ITSELF. Before the endpoint existed, `cancel` was null, no Stop
   * control could honestly be drawn, and closing the dialog left the run going.
   */
  it("calls the server's cancel endpoint for this run and settles as stopped", async () => {
    const cancels: StreamRequest[] = [];
    mockDispatch.mockImplementation(async (request: StreamRequest) => {
      if (request.path === LAUNCH_PATH) {
        request.onStreamEvent?.({
          event: "data",
          data: { type: "masterwork_run", run_id: RUN_ID },
        });
        request.onStreamEvent?.({
          event: "data",
          data: { type: "masterwork_step", message: "Reading piece 1 of 9" },
        });
        // The socket stays open, exactly as it does mid-distillation.
        return new Promise(() => {});
      }
      if (request.path === CANCEL_PATH) {
        cancels.push(request);
        return {
          data: {
            run_id: RUN_ID,
            status: "cancelled",
            cancelled: true,
            message: "Stopped.",
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const probe = await renderIngestDialog();
    await act(async () => {
      void probe.run().launch({ rulebook_id: "rb" }, "Everything I've published");
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });

    const stop = buttonLabelled(probe.container, "Stop this run");
    expect(stop).not.toBeNull();

    await act(async () => {
      stop?.click();
    });

    // It reached the SERVER, for THIS run, carrying the reason.
    expect(cancels).toHaveLength(1);
    expect(cancels[0]?.pathParams).toEqual({ run_id: RUN_ID });
    expect(cancels[0]?.body).toEqual({ reason: "the person clicked Stop" });

    // And the screen says stopped — honestly, including what survived.
    expect(probe.run().status).toBe("stopped");
    expect(probe.run().running).toBe(false);
    expect(probe.run().error).toBeNull();
    expect(probe.container.textContent).toContain("Stopped.");
    // Never through the failure channel: no alarm, no retry pressure.
    expect(buttonLabelled(probe.container, "Try it again")).toBeNull();
    // And it stops asking the server about a run it just stopped.
    expect(probe.container.querySelector('[data-testid="wait"]')).toBeNull();

    await probe.unmount();
  });

  /**
   * The same run stopped from somewhere else — another tab, another device, or
   * the server's own reply landing on the live stream. Every follower must stop
   * saying "working", and none of them may call it a failure.
   */
  it("treats a live cancelled event as stopped, not as an error", async () => {
    mockDispatch.mockImplementation(async (request: StreamRequest) => {
      if (request.path === LAUNCH_PATH) {
        request.onStreamEvent?.({
          event: "data",
          data: { type: "masterwork_run", run_id: RUN_ID },
        });
        request.onStreamEvent?.({
          event: "data",
          data: {
            type: "masterwork_run_cancelled",
            run_id: RUN_ID,
            error: {
              type: "run_cancelled",
              user_message:
                "Stopped. Nothing further was added — anything that already landed before you stopped it is saved.",
            },
          },
        });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    const probe = await renderIngestDialog();
    await act(async () => {
      void probe.run().launch({ rulebook_id: "rb" }, "Everything I've published");
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });

    expect(probe.run().status).toBe("stopped");
    expect(probe.run().error).toBeNull();
    expect(probe.container.textContent).toContain("anything that already landed");
    expect(buttonLabelled(probe.container, "Try it again")).toBeNull();

    await probe.unmount();
  });

  /**
   * And on a RELOAD. The durable row is the only truth a fresh page has; a
   * `cancelled` row must come back as a stop. (`cancelled` used to sit in
   * FAILED_STATUSES, which is what would have turned this into a red error.)
   */
  it("settles a rejoined cancelled row as stopped", async () => {
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
            status: "cancelled",
            error: {
              type: "run_cancelled",
              user_message: "Stopped. Anything already added is saved.",
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
      void probe.run().launch({ rulebook_id: "rb" }, "Everything I've published");
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });

    expect(probe.run().status).toBe("stopped");
    expect(probe.run().error).toBeNull();
    expect(probe.container.textContent).toContain("Anything already added is saved");
    expect(buttonLabelled(probe.container, "Try it again")).toBeNull();

    await probe.unmount();
  });
});
