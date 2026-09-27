/** @jest-environment jsdom */
//
// HELD-STEP-WORDS (2026-09-26) — a screen never lies for a held step, once
// somebody decides it.
//
// THE USE CASE. Harbor Dental Group's "Morning recall confirmations" pauses
// on saving Marisol Okafor's confirmation. Dana Whitfield decides it.
//
//   1. APPROVED: the engine resumes a held step through the same door it
//      resumes a `control.human_input` question — it settles as
//      `node_skipped`, answer in `output`. Read naively, the step list showed
//      a "skipped" icon and the activity feed said "Not needed this time",
//      although the step was needed and DID write. It must read as done, with
//      "Approved; the change was written" (and the row id, when the output
//      named one).
//   2. REFUSED: the deliverable body for a step with no recognizable output
//      fell through to the generic agent-step sentence "This step ran, and
//      handed its result to the next one." — false for a refused write:
//      nothing ran, and nothing was handed off.
//
// Both fail against HEAD (workflow-runs.slice / activity-copy / RunJourney /
// SettledOutputBody before lane HELD-STEP-WORDS).

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import workflowRunsReducer, {
  applyRunEvent,
  attachRun,
  type WorkflowRunsState,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import type { WorkflowRunEvent } from "@/features/workflow-runtime/types";
import { activityLine } from "@/features/workflow-runtime/components/run/activity-copy";
import { RunJourney } from "@/features/workflow-runtime/components/run/RunJourney";
import { SettledOutputBody } from "@/features/workflow-runtime/components/SettledOutputBody";

const RUN = "run-harbor-morning-recalls-2";
const CHECKPOINT = "cp-0000-held";
const APPROVAL = "c0ffee00-0000-4000-8000-000000000004";
const WRITTEN_ROW_ID = "865ed468-1111-4222-8333-444455556666";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function foldEvents(events: Record<string, unknown>[]): WorkflowRunsState {
  let state = workflowRunsReducer(undefined, attachRun({ runId: RUN }));
  events.forEach((event, index) => {
    state = workflowRunsReducer(
      state,
      applyRunEvent({ runId: RUN, event: event as unknown as WorkflowRunEvent, seq: index + 1, replay: false }),
    );
  });
  return state;
}

function approvedState(): WorkflowRunsState {
  return foldEvents([
    {
      event: "node_started",
      run_id: RUN,
      step: 1,
      node_id: "save_confirmation",
      spec_type: "data.table.upsert",
      attempt: 1,
      dispatch_id: "",
      item_index: 0,
      invocation_count: 1,
      ts: "2026-09-27T09:00:00Z",
    },
    {
      event: "run_interrupted",
      run_id: RUN,
      node_id: "save_confirmation",
      payload: {
        title: "Waiting for your approval",
        held_write: {},
        matrx_held_write: { approval_id: APPROVAL, node_id: "save_confirmation" },
      },
      checkpoint_id: CHECKPOINT,
      ts: "2026-09-27T09:00:01Z",
    },
    {
      event: "run_resumed",
      run_id: RUN,
      ts: "2026-09-27T09:05:00Z",
    },
    // The engine resumes a held step the same way it resumes a
    // `control.human_input` question: it settles as `node_skipped`, the
    // written row's id riding in `output` beside the decision's provenance.
    {
      event: "node_skipped",
      run_id: RUN,
      step: 2,
      node_id: "save_confirmation",
      attempt: 1,
      dispatch_id: "",
      item_index: 0,
      output: { row_id: WRITTEN_ROW_ID, matrx_decision: { authority: "human", actor_label: "admin" } },
      ts: "2026-09-27T09:05:01Z",
    },
  ]);
}

describe("a held step, APPROVED", () => {
  test("the activity feed says it was approved and written, with the row id — never 'Not needed this time'", () => {
    const activity = (approvedState().byRunId[RUN] as unknown as {
      activity: { kind: string; nodeId: string | null; detail: string | null }[];
    }).activity;
    const entry = activity.find((e) => e.nodeId === "save_confirmation" && e.kind !== "started" && e.kind !== "held");
    expect(entry?.kind).toBe("approved");
    const line = activityLine(entry as never, {});
    expect(line.text).toBe("Approved; the change was written");
    expect(line.text).not.toBe("Not needed this time");
    expect(line.detail).toBe(`row ${WRITTEN_ROW_ID.slice(0, 8)}`);
  });

  test("the node settles DONE, not skipped — the step list never shows the skip icon or 'Not needed this time'", () => {
    const state = approvedState();
    const nodes = (state.byRunId[RUN] as unknown as {
      nodes: Record<string, { phase: string }>;
    }).nodes;
    const invocation = Object.values(nodes).find((n) => true);
    expect(invocation?.phase).toBe("settled");

    const store = configureStore({
      reducer: { workflowRuns: workflowRunsReducer },
      preloadedState: { workflowRuns: state },
    });
    act(() =>
      root.render(
        <Provider store={store}>
          <RunJourney
            runId={RUN}
            steps={[
              {
                nodeId: "save_confirmation",
                label: "Save recall confirmation",
                family: "deliver",
                iconName: null,
                outputKind: null,
                specType: "data.table.upsert",
                collectsInput: false,
              },
            ]}
          />
        </Provider>,
      ),
    );
    expect(host.textContent).not.toContain("Not needed this time");
    expect(host.querySelector('[data-step-id="save_confirmation"] svg.lucide-skip-forward')).toBeNull();
  });
});

describe("a held step's deliverable body, REFUSED", () => {
  test("says the refusal, never the generic 'handed its result to the next one'", () => {
    act(() =>
      root.render(
        <SettledOutputBody output={{}} heldOutcome="refused" />,
      ),
    );
    expect(host.textContent).toBe("Refused; nothing was written and the run ended here.");
    expect(host.textContent).not.toContain("handed its result to the next one");
  });

  test("approved-with-empty-output says the approval, not the generic hand-off sentence", () => {
    // An agent-run envelope with nothing to show — the shape the original
    // fallback sentence was written for (a database write has no final_text).
    act(() =>
      root.render(<SettledOutputBody output={{ final_text: "" }} heldOutcome="approved" />),
    );
    expect(host.textContent).toBe("Approved; the change was written.");
  });

  test("an ordinary settled step with no held decision keeps the original honest fallback", () => {
    act(() => root.render(<SettledOutputBody output={{ final_text: "" }} />));
    expect(host.textContent).toBe("This step ran, and handed its result to the next one.");
  });
});
