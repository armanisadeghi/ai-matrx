/**
 * AN ERRORED RUN SETTLES FROM ITS OWN TERMINAL EVENT.
 *
 * The original guard (2026-08-18) drove a captured `onEvent` from the old
 * `attachWorkflowRun` thunk. That thunk is gone: the box now adopts its run
 * through the Run Stream Adapter, and every status fact reaches it through the
 * `workflowRuns` slice. The suite went dead at that rename (recorded in
 * FOUND_DEFECTS 2026-08-28) and is rewritten here to drive the STORE, which is
 * where the live terminal event now lands.
 *
 * What it still guards is the same defect, and the defect was live again: the
 * box asked the GENERATED `TERMINAL_RUN_STATUSES`, which answers the ENGINE's
 * "can this resume?" question and excludes `errored`. So a run the engine
 * recorded as errored left this box spinning — nothing told the caller, no
 * failure was explained, and only a row-poll recovery backstop could ever
 * settle the screen. `runIsOver` (features/workflow-runtime/types.ts) is the
 * watcher's question and the box asks that now.
 *
 * Only TRANSPORT is stubbed: the adapter thunk is replaced by one that
 * attaches the run the way the real adapter's first step does, and the test
 * then folds a real `run_errored` event through the real reducer.
 *
 * ── WALL W15 (Expert Book Challenge, 2026-09-10) ───────────────────────────
 * The box remembered the last run id in sessionStorage and RE-ATTACHED to it
 * on mount without asking whether it was still going. A run that had errored
 * or completed came back wearing "Working…", with nothing on screen to say it
 * was old; and when the Expert pressed Run, the new run started server-side
 * while the box stayed on the dead id. So the remembered id is a CANDIDATE
 * now: the row is read first, a run that `runIsOver` is forgotten rather than
 * adopted, a freshly started run always replaces it, and the box says which
 * run it is showing. The added tests below guard exactly that.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

import type { UnknownAction } from "@reduxjs/toolkit";

import { makeStore } from "@/lib/redux/store";
import { applyRunEvent } from "@/features/workflow-runtime/redux/workflow-runs.slice";
import type { WorkflowRunEvent } from "@/features/workflow-runtime/types";
import { TryMasterworkBox } from "./TryMasterworkBox";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// The served input controls measure themselves; jsdom has no ResizeObserver.
// Layout machinery, not the behaviour under test.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let adoptedRunId: string | null = null;
const getMasterworkRunVerdict = jest.fn();

// TRANSPORT ONLY. The real adapter opens SSE/pollers against the server; its
// first step is `attachRun`, and that is the part this test needs so the real
// reducer will accept the run's events.
jest.mock("@/features/workflow-runtime/redux/adopt-workflow-run.thunk", () => ({
  adoptWorkflowRun:
    ({ runId }: { runId: string }) =>
    (dispatch: (action: UnknownAction) => void) => {
      adoptedRunId = runId;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const slice = require("@/features/workflow-runtime/redux/workflow-runs.slice") as {
        attachRun: (payload: { runId: string }) => UnknownAction;
      };
      dispatch(slice.attachRun({ runId }));
      return {
        runId,
        stop: () => undefined,
        ensureLane: () => null,
      };
    },
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: () => ({ type: "test/call-api" }),
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: () => <textarea aria-label="Masterwork input" />,
}));

jest.mock("@/features/rich-document/RichDocument", () => ({
  RichDocument: () => <div>Rendered verdict</div>,
}));

jest.mock("../../service", () => ({
  getMasterworkDefinition: () => Promise.resolve(null),
  getMasterworkRunVerdict: (...args: unknown[]) =>
    getMasterworkRunVerdict(...args),
}));

jest.mock("@/features/workflow-runtime/run-failure-explanation", () => ({
  // The real primitive takes the WHOLE error record; the stub mirrors that so
  // this test would catch a caller that went back to passing one string.
  explainRunFailure: (input: unknown, whatItRuns: string) => ({
    headline: `${whatItRuns} stopped`,
    nextStep: "Try again.",
    technical:
      typeof input === "string"
        ? input
        : ((input as { message?: string } | null)?.message ?? null),
    unrecognized: false,
    action: null,
    cause: (input as { cause?: string } | null)?.cause ?? null,
  }),
}));

let container: HTMLDivElement;
let root: Root;
let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  store = makeStore();
  adoptedRunId = null;
  getMasterworkRunVerdict.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

/** The engine's own run_errored event, as the durable log records it. */
function runErrored(runId: string, message: string): WorkflowRunEvent {
  return {
    ts: new Date().toISOString(),
    event: "run_errored",
    run_id: runId,
    status: "errored",
    steps_executed: 1,
    node_id: "draft",
    step: 1,
    attempt: 1,
    error_type: "WorkerRejected",
    error_message: message,
    checkpoint_id: null,
  } as WorkflowRunEvent;
}

const MASTERWORK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function renderBox(onRunFinished: jest.Mock) {
  return act(async () => {
    root.render(
      <Provider store={store}>
        <TryMasterworkBox
          masterworkId={MASTERWORK_ID}
          masterworkKind="edit"
          onRunFinished={onRunFinished}
        />
      </Provider>,
    );
  });
}

/** The re-attach check reads the run row before adopting anything. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

it("settles an errored run from its live terminal event without the row-poll recovery alarm", async () => {
  const masterworkId = MASTERWORK_ID;
  const runId = RUN_ID;
  sessionStorage.setItem(`matrx.masterwork.run.${masterworkId}`, runId);
  // The remembered run is still GOING — that is what makes it rejoinable at
  // all. Its row is read once to decide that, and again for the explanation
  // once the live terminal event lands.
  getMasterworkRunVerdict
    .mockResolvedValueOnce({ status: "running", error: null })
    .mockResolvedValue({
      status: "errored",
      error: { message: "The worker rejected the input." },
    });
  const onRunFinished = jest.fn();
  const consoleError = jest.spyOn(console, "error").mockImplementation();

  await renderBox(onRunFinished);
  await settle();

  // A LIVE remembered run is rejoined, and the box says which run it is.
  expect(adoptedRunId).toBe(runId);
  expect(container.textContent).toContain(
    "Rejoined the run you started earlier",
  );
  expect(onRunFinished).not.toHaveBeenCalled();

  await act(async () => {
    store.dispatch(
      applyRunEvent({
        runId,
        event: runErrored(runId, "The worker rejected the input."),
        seq: 1,
        replay: false,
      }),
    );
  });

  expect(onRunFinished).toHaveBeenCalledTimes(1);
  // Settled by the EVENT: the SECOND row read is the explanation read (the
  // first was the re-attach check), not a recovery poll that had to notice on
  // its own.
  expect(getMasterworkRunVerdict).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Your Masterwork stopped");
  expect(container.textContent).toContain("The worker rejected the input.");
  expect(consoleError).not.toHaveBeenCalled();
});

it("never re-attaches to a remembered run that is already OVER", async () => {
  sessionStorage.setItem(`matrx.masterwork.run.${MASTERWORK_ID}`, RUN_ID);
  // THE DEFECT: this run errored minutes ago. The box used to adopt it on the
  // first render and wear "Working…" with nothing to say it was old.
  getMasterworkRunVerdict.mockResolvedValue({
    status: "errored",
    error: { message: "The worker rejected the input." },
  });
  const onRunFinished = jest.fn();

  await renderBox(onRunFinished);
  await settle();

  expect(adoptedRunId).toBeNull();
  // Forgotten, so a later mount cannot resurrect it either.
  expect(
    sessionStorage.getItem(`matrx.masterwork.run.${MASTERWORK_ID}`),
  ).toBeNull();
  expect(container.textContent).not.toContain("Working…");
  expect(container.textContent).not.toContain("Rejoined the run");
  // Nothing finished while this box was watching, so nobody is told one did.
  expect(onRunFinished).not.toHaveBeenCalled();
  // The re-attach question is CLOSED, not left hanging — the other half of
  // the defect was a box still holding a dead id when the Expert pressed Run.
  expect(container.textContent).not.toContain("Checking");
});

it("forgets a remembered run whose row cannot be read at all", async () => {
  sessionStorage.setItem(`matrx.masterwork.run.${MASTERWORK_ID}`, RUN_ID);
  getMasterworkRunVerdict.mockResolvedValue(null);

  await renderBox(jest.fn());
  await settle();

  expect(adoptedRunId).toBeNull();
  expect(
    sessionStorage.getItem(`matrx.masterwork.run.${MASTERWORK_ID}`),
  ).toBeNull();
  expect(container.textContent).not.toContain("Working…");
});
