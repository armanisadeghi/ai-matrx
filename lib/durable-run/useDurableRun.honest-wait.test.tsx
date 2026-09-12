/**
 * A WORKING SCREEN MAY NOT KEEP A PROMISE IT HAS ALREADY BROKEN, AND A FAILED
 * RUN MAY NOT LEAVE THE PERSON WITH NOTHING TO PRESS.
 *
 * The incident (2026-09-12, masterwork-methods-census rows 5 and D4): the
 * "Everything you've published" dialog read ONE live URL
 * (`paulgraham.com/simply.html`) and sat on "Working — this takes a minute."
 * The person left at ~90 seconds and reported a hang. Nothing had hung: corpus
 * item 1a5fd47d SUCCEEDED at 19:57:06 with 13 rules, 2m57s after it was
 * claimed — and the live medians on `platform.masterwork_run` say that is
 * NORMAL for this lane (ingest 157s, ingest_corpus 156s). The sentence was the
 * defect. A run that then really does fail was reported by a toast that
 * removed itself, over a dialog that showed the empty form again.
 *
 * These tests drive the REAL hook through the REAL `MASTERWORK_RUN_WIRE` and
 * render the REAL failure notice into a REAL DOM. The only thing faked is the
 * transport — i.e. what the SERVER said — which is the one thing a client test
 * may fake.
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

const RUN_ID = "1a5fd47d-67be-480a-ba2a-638ed19edccd";
const LAUNCH_PATH = "/masterworks/ingest-corpus" as const;
const REJOIN_PATH = "/masterworks/runs/{run_id}/rejoin";
/** The measured expectation for the body-of-work lane (`useMasterworkRun`). */
const EXPECTED_MS = 160_000;
/** The sentence the dialogs hardcoded, and that must never outlive its promise. */
const THE_OLD_PROMISE = "Working — this takes a minute.";

type Result = { added: number };

interface Probe {
  container: HTMLElement;
  run: () => DurableRunHandle<Result>;
  unmount: () => Promise<void>;
}

/**
 * The real dialog shape, reduced to the two things under test: the ONE sentence
 * shown while working, and the failure notice. Both come from the shared
 * primitives — a surface that wrote its own would be the defect back again.
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
      expectedMs: EXPECTED_MS,
      finalEvent: "masterwork_ingest_complete",
      stageLabels: {},
      stageFallback: (_name, data) =>
        typeof data.message === "string" ? data.message : null,
    });
    latest = run;
    return (
      <div>
        {run.running ? <p data-testid="wait">{run.waitMessage}</p> : null}
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

function buttonLabelled(container: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === label,
    ) ?? null
  );
}

type StreamRequest = {
  path: string;
  onStreamEvent?: (event: {
    event: "data";
    data: Record<string, unknown>;
  }) => void;
};

describe("a long ingest dialog is honest under time and under loss", () => {
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
   * THE INCIDENT ITSELF. The run is fine and still going — exactly the
   * 2m57s that actually happened — and the screen must stop promising a
   * minute it has already spent, without ever claiming a failure.
   */
  it("stops promising once the run outlives the expectation, and never invents a failure", async () => {
    mockDispatch.mockImplementation(async (request: StreamRequest) => {
      if (request.path === LAUNCH_PATH) {
        request.onStreamEvent?.({
          event: "data",
          data: { type: "masterwork_run", run_id: RUN_ID },
        });
        request.onStreamEvent?.({
          event: "data",
          data: {
            type: "masterwork_step",
            message: "Reading https://www.paulgraham.com/simply.html",
          },
        });
        // The socket stays open and the server keeps working, exactly as it did.
        return new Promise(() => {});
      }
      return { data: null, error: null };
    });

    const probe = await renderIngestDialog();
    await act(async () => {
      void probe.run().launch({ rulebook_id: "rb" }, "Write Simply");
    });

    // Inside the expectation: the promise is allowed, and it is the MEASURED
    // one — not the minute the dialogs used to hardcode.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(probe.run().overdue).toBe(false);
    expect(probe.container.textContent).toContain("about 3 min");
    expect(probe.container.textContent).not.toContain(THE_OLD_PROMISE);

    // 90 seconds — where the person gave up. Still honest, still working.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(probe.run().error).toBeNull();

    // Past three times the expectation the sentence must REPORT, not promise:
    // the real clock, the real state, and no verdict.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(EXPECTED_MS * 3);
    });
    const text = probe.container.textContent ?? "";
    expect(probe.run().overdue).toBe(true);
    expect(text).toContain("This is taking longer than it should");
    expect(text).toContain("still running on the server");
    expect(text).toMatch(/\d+m \d+s so far/);
    expect(text).not.toContain("about 3 min");
    // A slow run is not a failed run — the row never said so.
    expect(probe.run().status).toBe("running");
    expect(probe.run().error).toBeNull();
    expect(buttonLabelled(probe.container, "Try it again")).toBeNull();

    await probe.unmount();
  });

  /**
   * AND WHEN IT REALLY DOES FAIL. The row itself says so — the only thing
   * allowed to. The reason must be on screen, in the server's own words, with
   * a way out attached that actually re-runs the same launch.
   */
  it("renders the row's own reason and a Retry that repeats the launch", async () => {
    const launches: Record<string, unknown>[] = [];
    let rejoins = 0;
    mockDispatch.mockImplementation(
      async (request: StreamRequest & { body?: Record<string, unknown> }) => {
        if (request.path === LAUNCH_PATH) {
          launches.push(request.body ?? {});
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
          rejoins += 1;
          request.onStreamEvent?.({
            event: "data",
            data: {
              type: "masterwork_run_snapshot",
              run_id: RUN_ID,
              status: "failed",
              error: {
                type: "run_lost",
                message:
                  "This run stopped without recording a result — nothing you did caused it.",
              },
              result: null,
            },
          });
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
    );

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

    expect(rejoins).toBeGreaterThan(0);
    expect(probe.run().status).toBe("error");
    // The reason STAYS on the screen — it is not a toast that removes itself.
    expect(probe.container.textContent).toContain(
      "This run stopped without recording a result",
    );

    const retryButton = buttonLabelled(probe.container, "Try it again");
    expect(retryButton).not.toBeNull();

    // And it does what it says: the SAME launch, not an empty form.
    expect(launches).toHaveLength(1);
    await act(async () => {
      retryButton?.click();
    });
    expect(launches).toHaveLength(2);
    expect(launches[1]).toEqual(launches[0]);

    await probe.unmount();
  });
});
