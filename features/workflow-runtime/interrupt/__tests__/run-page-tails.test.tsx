/** @jest-environment jsdom */
//
// RUN-PAGE-TAILS (2026-09-27) — the run page for a step held for approval.
//
// THE USE CASE. Harbor Dental Group's "Morning recall confirmations" is paused
// on saving Marisol Okafor's confirmation into the Hygiene Recall Schedule.
// Dana Whitfield (the office manager) is looking at the run page; the change is
// decided somewhere else — in the chat card, or on the table's page.
//
//   1. The page follows the approval row and carries the run on BY ITSELF — no
//      button press — once the row is no longer pending. "Carry on" stays as
//      the honest fallback: "If nothing happens, carry on here".
//   3. After a refusal the step list stops saying "Waiting for your approval"
//      and says "Refused; the run ended here".
//
// Both fail against the HEAD HeldInterrupt / slice / activity-copy / RunJourney.

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

const answerInterrupt = jest.fn(async () => true);
jest.mock("@/features/workflow-runtime/hooks/useWorkflowRunControls", () => ({
  useWorkflowRunControls: () => ({ answerInterrupt, retryNode: jest.fn(), skipNode: jest.fn() }),
}));
jest.mock("@/features/record-change-approvals/HeldStepCard", () => ({
  HeldStepCard: () => <div data-testid="held-step-card" />,
}));
const HARBOR = "11f4e747-c13a-49c7-81a3-66e6391f8a9b";
jest.mock("@/features/workflow-runtime/runOrganization", () => ({
  runOrganizationId: async () => HARBOR,
  runScope: async () => ({ scopeOverrides: { organization_id: HARBOR } }),
}));
const approvalStates: string[] = [];
// The approval row, read through the store's own door (`custom.work_approval_read`).
const readApprovalState = jest.fn(async (_organizationId: string, _approvalId: string) => ({
  data: { state: approvalStates.shift() ?? "pending" },
  error: null,
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@ai-matrx/records-ui", () => ({
  recordsDataSource: () => ({
    rpc: async (door: string, args: { p_organization_id: string; p_approval_id: string }) => {
      if (door !== "work_approval_read") throw new Error(`unexpected door ${door}`);
      return readApprovalState(args.p_organization_id, args.p_approval_id);
    },
  }),
}));

import workflowRunsReducer, {
  applyRunEvent,
  attachRun,
  type WorkflowRunsState,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import type { WorkflowRunEvent } from "@/features/workflow-runtime/types";
import type { RecordChangeWait } from "@/features/record-change-approvals/recordChangeApproval";
import { activityLine } from "@/features/workflow-runtime/components/run/activity-copy";

import { HeldInterrupt } from "../HeldInterrupt";
import { RunJourney } from "../../components/run/RunJourney";

const RUN = "run-harbor-morning-recalls";
const CHECKPOINT = "cp-0000-held";
const APPROVAL = "c0ffee00-0000-4000-8000-000000000003";
const WAIT = { approvalId: APPROVAL } as unknown as RecordChangeWait;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  jest.useFakeTimers();
  answerInterrupt.mockClear();
  readApprovalState.mockClear();
  approvalStates.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

async function flush(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe("tail 1 — the run page follows the approval and carries on by itself", () => {
  test("decided elsewhere (refused): the run is carried on once, with no press", async () => {
    approvalStates.push("pending", "declined");
    act(() => root.render(<HeldInterrupt runId={RUN} checkpointId={CHECKPOINT} wait={WAIT} />));
    await flush(0);
    expect(readApprovalState).toHaveBeenCalledWith(HARBOR, APPROVAL);
    expect(answerInterrupt).not.toHaveBeenCalled();
    await flush(10_000);
    expect(answerInterrupt).toHaveBeenCalledTimes(1);
    expect(answerInterrupt).toHaveBeenCalledWith(RUN, CHECKPOINT, {});
    await flush(20_000);
    expect(answerInterrupt).toHaveBeenCalledTimes(1);
  });

  test("decided elsewhere (approved) carries on too", async () => {
    approvalStates.push("approved");
    act(() => root.render(<HeldInterrupt runId={RUN} checkpointId={CHECKPOINT} wait={WAIT} />));
    await flush(0);
    expect(answerInterrupt).toHaveBeenCalledTimes(1);
  });

  test("still waiting: nothing happens by itself, and the fallback is honest", async () => {
    act(() => root.render(<HeldInterrupt runId={RUN} checkpointId={CHECKPOINT} wait={WAIT} />));
    await flush(30_000);
    expect(answerInterrupt).not.toHaveBeenCalled();
    expect(host.textContent).toContain("If nothing happens, carry on here");
  });
});

describe("tail 3 — the step list reads the refusal", () => {
  function refusedState(): WorkflowRunsState {
    let state = workflowRunsReducer(undefined, attachRun({ runId: RUN }));
    const events = [
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
        event: "run_cancelled",
        run_id: RUN,
        status: "cancelled",
        steps_executed: 0,
        reason: "graceful",
        error: { cause: "refused", message: "1 record was not written to Hygiene Recall Schedule." },
        ts: "2026-09-27T09:05:00Z",
      },
    ];
    events.forEach((event, index) => {
      state = workflowRunsReducer(
        state,
        applyRunEvent({ runId: RUN, event: event as unknown as WorkflowRunEvent, seq: index + 1, replay: false }),
      );
    });
    return state;
  }

  test("the feed records the refusal on the held step, in its own words", () => {
    const activity = (refusedState().byRunId[RUN] as unknown as {
      activity: { kind: string; nodeId: string | null }[];
    }).activity;
    const refused = activity.find((entry) => (entry.kind as string) === "refused");
    expect(refused?.nodeId).toBe("save_confirmation");
    expect(activityLine(refused as never, {}).text).toBe("Refused; the run ended here");
  });

  test("the step list on the right no longer says 'Waiting for your approval'", () => {
    const store = configureStore({
      reducer: { workflowRuns: workflowRunsReducer },
      preloadedState: { workflowRuns: refusedState() },
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
    expect(host.textContent).toContain("Refused; the run ended here");
    expect(host.textContent).not.toContain("Waiting for your approval");
    expect(host.textContent).not.toContain("now");
  });
});
