/**
 * WALL W47 — the mid-run pause, on the screen, from the REAL run that proved
 * the primitive exists.
 *
 * A Conductor told a parent this platform had no step that pauses mid-run to
 * ask a follow-up question. Run `10af94fd` had already done it: the Montessori
 * adviser stopped at `consult_pause` (`control.human_input`), the page showed
 * seven questions with an answer box, the parent typed an answer and the run
 * carried on. Nothing in this repo guarded any of that.
 *
 * NOTHING HERE IS HAND-SHAPED. `pause-run-10af94fd.json` is that run's verbatim
 * `workflow.node_events` rows (node_started / run_interrupted / run_resumed /
 * node_skipped) and its `workflow.node_outcome` row, read out of the live
 * database — the same four events a page replays on RELOAD.
 *
 * ONE-LINE BUGS THIS CATCHES: a pause that renders no question; an answer box
 * with no way to send; a stale question left on screen after the run resumed;
 * and the one this test was written red for — a run that reloads after the
 * parent answered and shows "Decided by admin@admin.com" with no trace of the
 * seven answers she actually typed.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { TooltipProvider } from "@/components/ui/tooltip";
import { configureStore } from "@reduxjs/toolkit";

import workflowRunsReducer, {
  applyRunEvent,
  attachRun,
  type WorkflowRunsState,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import { selectRunDecisions } from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import type { WorkflowRunEvent } from "@/features/workflow-runtime/types";

import { InterruptQuestion } from "../InterruptQuestion";
import { RunDecisions } from "../RunDecisions";
import fixture from "@/features/workflow-runtime/__tests__/fixtures/pause-run-10af94fd.json";

type EventRow = {
  seq: number;
  event_type: string;
  payload: Record<string, unknown>;
};
const RUN: string = (fixture as { run_id: string }).run_id;
const ROWS = (fixture as unknown as { events: EventRow[] }).events;

/** Exactly what a reloaded page does: refold the durable log. */
function stateAfter(upToEventType: string): WorkflowRunsState {
  let state = workflowRunsReducer(undefined, attachRun({ runId: RUN }));
  for (const row of ROWS) {
    const event = { ...row.payload, event: row.event_type } as WorkflowRunEvent;
    state = workflowRunsReducer(
      state,
      applyRunEvent({ runId: RUN, event, seq: row.seq, replay: true }),
    );
    if (row.event_type === upToEventType) break;
  }
  return state;
}

function markup(state: WorkflowRunsState, node: React.ReactElement): string {
  // The question box reads the signed-in identity (for the voice-input
  // affordance); a bare slice stands in for it — nothing here asserts on it.
  const store = configureStore({
    reducer: {
      workflowRuns: workflowRunsReducer,
      userAuth: (s: unknown = { id: "test-user", createdAt: null }) => s,
      recordings: (
        s: unknown = { isRecording: false, isFinalizing: false, context: null },
      ) => s,
      userPreferences: (
        s: unknown = { mediaDevices: {}, organization: {} },
      ) => s,
    },
    preloadedState: { workflowRuns: state },
  });
  return renderToStaticMarkup(
    <Provider store={store}>
      <TooltipProvider>{node}</TooltipProvider>
    </Provider>,
  );
}

it("shows the question and a way to answer it while the run is parked", () => {
  const html = markup(
    stateAfter("run_interrupted"),
    <InterruptQuestion runId={RUN} />,
  );

  expect(html).toContain("Montessori has questions before she will advise");
  expect(html).toContain("what does he do? Tell me what he actually did, once");
  // A question with no way to answer is a dead end, not a pause.
  expect(html).toContain("Send answer");
  expect(html).toMatch(/<textarea|<input/);
});

it("takes the stale question off the screen once the run resumed", () => {
  const html = markup(stateAfter("node_skipped"), <InterruptQuestion runId={RUN} />);
  expect(html).toBe("");
});

it("still shows what the person actually answered after a reload", () => {
  // The answer is durable — it is the pause node's own outcome row. The screen
  // is where it was being dropped: `decision.answer` was parsed and then read
  // by nothing, so a reloaded run said only who decided.
  const state = stateAfter("node_skipped");
  const decisions = selectRunDecisions(RUN)({ workflowRuns: state } as never);
  expect(decisions).toHaveLength(1);
  expect(String(decisions[0].answer)).toContain("Tupperware cupboard");

  const html = markup(state, <RunDecisions runId={RUN} />);
  expect(html).toContain("admin@admin.com");
  expect(html).toContain("Tupperware cupboard");
});
