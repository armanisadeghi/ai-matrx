/** @jest-environment jsdom */
//
// HELD-WRITE-RESUME (2026-09-26) — a run PAUSED on a held change is answered by
// the approval card, and deciding carries the run on.
//
// THE USE CASE. Harbor Dental Group keeps "Agent changes to this organization's
// data" on Ask. "Morning recall confirmations" saves Marisol Okafor's
// confirmation into the Hygiene Recall Schedule (step one) and then links the
// reminder to the saved row (step two). The save is held, so the run pauses
// exactly as a Pause & Ask does. Before this lane the run STOPPED instead: the
// page said the step "hit a problem", the activity line was in the error
// colour, and approving landed the row while step two never ran.
//
// Every clause fails against the HEAD copies of InterruptQuestion.tsx,
// recordChangeApproval.ts, workflow-runs.slice.ts and activity-copy.ts.

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

const answerInterrupt = jest.fn(async () => true);
jest.mock("@/features/workflow-runtime/hooks/useWorkflowRunControls", () => ({
  useWorkflowRunControls: () => ({ answerInterrupt }),
}));
jest.mock("@/features/record-change-approvals/RecordChangeApprovalCard", () => ({
  RecordChangeApprovalCard: ({
    wait,
    onDecided,
  }: {
    wait: { approvalId: string };
    onDecided?: () => void;
  }) => (
    <div data-testid="held-write-card" data-approval-id={wait.approvalId}>
      <button type="button" data-testid="approve" onClick={() => onDecided?.()}>
        Approve
      </button>
    </div>
  ),
}));
jest.mock("@/features/record-change-approvals/useHeldWriteTableName", () => ({
  useHeldWriteTableName: () => "Hygiene Recall Schedule",
}));

import workflowRunsReducer, {
  applyRunEvent,
  attachRun,
  type WorkflowRunsState,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import type { WorkflowRunEvent } from "@/features/workflow-runtime/types";
import * as approval from "@/features/record-change-approvals/recordChangeApproval";
import { activityLine } from "@/features/workflow-runtime/components/run/activity-copy";

import { InterruptQuestion } from "../InterruptQuestion";

const RUN = "run-harbor-morning-recalls";
const CHECKPOINT = "cp-0000-held";
const WAIT = {
  action: "record_write",
  applied: false,
  table_id: "b00bde4d-0000-4000-8000-000000000002",
  records: [{ patient: "Marisol Okafor", hygienist: "Dana Whitfield", recall_due: "2026-11-03" }],
  approval_id: "c0ffee00-0000-4000-8000-000000000003",
  approvers: [{ user_id: "87a6e699-3622-4869-8843-d0867456c0dd", name: "admin" }],
  approval: {
    setting: "ask",
    approval_required: true,
    own_table: false,
    reason: "existing_table_needs_a_person",
    why: "An agent asked to change a table that already existed.",
    how_to_change: "An owner or admin changes this in the organization's Settings, Configuration.",
  },
  awaiting_approval: true,
  not_done: "1 record was NOT written, and is waiting for a person.",
};
const HELD_PAYLOAD = {
  prompt: "Held for approval: nothing was written yet.",
  title: "Waiting for your approval",
  held_write: WAIT,
  matrx_held_write: {
    approval_id: WAIT.approval_id,
    node_id: "save_confirmation",
    ids_into: "row_id",
    when_applied: { row_id: "", table_id: WAIT.table_id },
  },
};

function pausedState(payload: Record<string, unknown>): WorkflowRunsState {
  let state = workflowRunsReducer(undefined, attachRun({ runId: RUN }));
  const interrupted = {
    event: "run_interrupted",
    run_id: RUN,
    node_id: "save_confirmation",
    payload,
    checkpoint_id: CHECKPOINT,
    ts: "2026-09-26T21:00:00Z",
  } as unknown as WorkflowRunEvent;
  state = workflowRunsReducer(
    state,
    applyRunEvent({ runId: RUN, event: interrupted, seq: 4, replay: false }),
  );
  return state;
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  answerInterrupt.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function renderPaused(state: WorkflowRunsState) {
  const store = configureStore({
    reducer: {
      workflowRuns: workflowRunsReducer,
      userAuth: (s: unknown = { id: "test-user", createdAt: null }) => s,
      recordings: (s: unknown = { isRecording: false, isFinalizing: false, context: null }) => s,
      userPreferences: (s: unknown = { mediaDevices: {}, organization: {} }) => s,
    },
    preloadedState: { workflowRuns: state },
  });
  act(() =>
    root.render(
      <Provider store={store}>
        <InterruptQuestion runId={RUN} />
      </Provider>,
    ),
  );
}

describe("a run paused on a held change", () => {
  test("the interrupt is read as the same wait the chat reads", () => {
    const read = (approval as Record<string, unknown>)["heldWriteOfInterrupt"] as
      | ((payload: unknown) => approval.RecordChangeWait | null)
      | undefined;
    expect(typeof read).toBe("function");
    expect(read!(HELD_PAYLOAD)?.approvalId).toBe(WAIT.approval_id);
    // An ordinary Pause & Ask is not a held change.
    expect(read!({ prompt: "How old is she?", preset: "free_text" })).toBeNull();
  });

  test("the page draws the approval card, not a question form", () => {
    renderPaused(pausedState(HELD_PAYLOAD));
    expect(host.querySelector('[data-testid="held-write-card"]')).not.toBeNull();
    expect(host.textContent).toContain("Held for your approval: 1 new record on Hygiene Recall Schedule");
    expect(host.textContent).toContain("the run is paused here");
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).not.toContain("Send answer");
  });

  test("Approve carries the run on through the ordinary resume, sending no answer of its own", async () => {
    renderPaused(pausedState(HELD_PAYLOAD));
    await act(async () => {
      (host.querySelector('[data-testid="approve"]') as HTMLButtonElement).click();
    });
    expect(answerInterrupt).toHaveBeenCalledWith(RUN, CHECKPOINT, {});
  });

  test("the activity line is held, in the held colour — never 'ran into a problem'", () => {
    const run = pausedState(HELD_PAYLOAD).byRunId[RUN]!;
    const entries = (run as unknown as { activity: { kind: string }[] }).activity ?? [];
    const held = entries.find((entry) => entry.kind === "held");
    expect(held).toBeDefined();
    const line = activityLine(held as never, { save_confirmation: "Save recall confirmation" });
    expect(line.tone).not.toBe("fail");
    expect(line.text).toContain("Waiting for your approval");
  });

  test("an older run STOPPED on a held change reads held in the feed too", () => {
    let state = workflowRunsReducer(undefined, attachRun({ runId: RUN }));
    const failed = {
      event: "node_failed",
      run_id: RUN,
      step: 1,
      node_id: "save_confirmation",
      spec_type: "data.table.upsert",
      attempt: 1,
      dispatch_id: "",
      item_index: 0,
      invocation_count: 1,
      error_type: "held_for_approval",
      error_message: "data.table.upsert: Held for approval: nothing was written yet.",
      error: { code: "held_for_approval", message: "Held", details: { held_write: WAIT } },
      ts: "2026-09-26T19:00:00Z",
    } as unknown as WorkflowRunEvent;
    state = workflowRunsReducer(state, applyRunEvent({ runId: RUN, event: failed, seq: 3, replay: false }));
    const kinds = ((state.byRunId[RUN] as unknown as { activity: { kind: string }[] }).activity ?? []).map(
      (entry) => entry.kind,
    );
    expect(kinds).toContain("held");
    expect(kinds).not.toContain("failed");
  });

  test("Refuse ends the run as refused, and the page reads the refusal live", () => {
    let state = pausedState(HELD_PAYLOAD);
    const cancelled = {
      event: "run_cancelled",
      run_id: RUN,
      status: "cancelled",
      steps_executed: 0,
      reason: "graceful",
      error: { cause: "refused", message: "Tobias Lindqvist was left as it was." },
      ts: "2026-09-26T21:05:00Z",
    } as unknown as WorkflowRunEvent;
    state = workflowRunsReducer(state, applyRunEvent({ runId: RUN, event: cancelled, seq: 5, replay: false }));
    expect(state.byRunId[RUN]?.status).toBe("cancelled");
    expect((state.byRunId[RUN]?.error as Record<string, unknown> | null)?.["cause"]).toBe("refused");
    expect(state.byRunId[RUN]?.interrupt).toBeNull();
  });
});
