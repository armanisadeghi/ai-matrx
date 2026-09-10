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

it("settles an errored run from its live terminal event without the row-poll recovery alarm", async () => {
  const masterworkId = "11111111-1111-4111-8111-111111111111";
  const runId = "22222222-2222-4222-8222-222222222222";
  sessionStorage.setItem(`matrx.masterwork.run.${masterworkId}`, runId);
  // The run ROW's recorded error is what the box reads once it has settled.
  getMasterworkRunVerdict.mockResolvedValue({
    status: "errored",
    error: { message: "The worker rejected the input." },
  });
  const onRunFinished = jest.fn();
  const consoleError = jest.spyOn(console, "error").mockImplementation();

  await act(async () => {
    root.render(
      <Provider store={store}>
        <TryMasterworkBox
          masterworkId={masterworkId}
          masterworkKind="edit"
          onRunFinished={onRunFinished}
        />
      </Provider>,
    );
  });

  // The remembered run is rejoined on the first render — no effect cascade.
  expect(adoptedRunId).toBe(runId);
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
  // Settled by the EVENT: exactly one row read, and it is the explanation
  // read, not a recovery poll that had to notice on its own.
  expect(getMasterworkRunVerdict).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Your Masterwork stopped");
  expect(container.textContent).toContain("The worker rejected the input.");
  expect(consoleError).not.toHaveBeenCalled();
});
