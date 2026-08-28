/**
 * FAN-OUT LANE KEYING (SPEC-workflow-ui-contract §5.2).
 *
 * The gap this closes: `node_stream` carried no invocation identity, so a
 * frame from sibling 7 of a 50-item fan-out was indistinguishable from
 * sibling 8's and the client had to GUESS (land it on the one running
 * invocation). V3-A put `dispatch_id` + `item_index` on the wire. These tests
 * hold three things:
 *
 *  1. An ATTRIBUTED frame lands on its own lane, exactly — including a lane
 *     that is not the one a guess would have picked.
 *  2. An UNATTRIBUTED frame still lands on exactly one lane, never all N
 *     (the old behavior, which must not regress).
 *  3. The heartbeat's composite `node:dispatch:index` keys are read the same
 *     way, while a legacy bare-node-id key still works — both forms live in
 *     rows right now.
 */

import reducer, {
  applyNodeStreamMeta,
  applyRunEvent,
  attachRun,
  refreshHeartbeatTails,
  type WorkflowRunsState,
} from "../redux/workflow-runs.slice";
import {
  selectNodeSiblingLanes,
  selectNodeWorkSet,
  selectRunDecisions,
} from "../redux/workflow-runs.selectors";
import { invocationKeyOf } from "../types";
import type { NodeStreamEvent, RunRow, WorkflowRunEvent } from "../types";

const RUN = "run-fan";

function started(
  nodeId: string,
  dispatchId: string,
  itemIndex: number,
  invocationCount: number,
): WorkflowRunEvent {
  return {
    event: "node_started",
    run_id: RUN,
    ts: "2026-08-28T00:00:00Z",
    step: 1,
    node_id: nodeId,
    spec_type: "data.transform",
    attempt: 1,
    dispatch_id: dispatchId,
    item_index: itemIndex,
    invocation_count: invocationCount,
    inputs: {},
  } as WorkflowRunEvent;
}

function chunk(
  nodeId: string,
  delta: string,
  attribution?: { dispatch_id: string; item_index: number },
): NodeStreamEvent {
  return {
    event: "node_stream",
    run_id: RUN,
    node_id: nodeId,
    kind: "chunk",
    delta,
    stream_seq: 1,
    ts: "2026-08-28T00:00:01Z",
    chunks_received: 1,
    chars_streamed: delta.length,
    ...(attribution ?? {}),
  };
}

/** Three siblings of one `control.map` target, all running. */
function threeLanes(): WorkflowRunsState {
  let state = reducer(undefined, attachRun({ runId: RUN }));
  for (let index = 0; index < 3; index += 1) {
    state = reducer(
      state,
      applyRunEvent({
        runId: RUN,
        event: started("worker", "d1", index, 3),
        seq: index + 1,
        replay: false,
      }),
    );
  }
  return state;
}

const laneState = (state: WorkflowRunsState) => state.byRunId[RUN]!;

describe("an ATTRIBUTED node_stream frame lands on its own lane", () => {
  it("routes each sibling's tokens to that sibling, and to no other", () => {
    let state = threeLanes();
    state = reducer(
      state,
      applyNodeStreamMeta({
        runId: RUN,
        event: chunk("worker", "one ", { dispatch_id: "d1", item_index: 0 }),
      }),
    );
    state = reducer(
      state,
      applyNodeStreamMeta({
        runId: RUN,
        event: chunk("worker", "three ", { dispatch_id: "d1", item_index: 2 }),
      }),
    );
    const nodes = laneState(state).nodes;
    expect(nodes[invocationKeyOf("worker", "d1", 0)]!.textTail).toBe("one ");
    expect(nodes[invocationKeyOf("worker", "d1", 1)]!.textTail).toBe("");
    expect(nodes[invocationKeyOf("worker", "d1", 2)]!.textTail).toBe("three ");
  });

  it("beats the guess: the frame goes to item 2, not to the first running lane", () => {
    let state = threeLanes();
    state = reducer(
      state,
      applyNodeStreamMeta({
        runId: RUN,
        event: chunk("worker", "mine", { dispatch_id: "d1", item_index: 2 }),
      }),
    );
    // The un-attributed heuristic would have chosen item 0 (first running).
    expect(laneState(state).nodes[invocationKeyOf("worker", "d1", 0)]!.textTail).toBe(
      "",
    );
    expect(laneState(state).nodes[invocationKeyOf("worker", "d1", 2)]!.textTail).toBe(
      "mine",
    );
  });

  it("counts coalesced frames on the attributed lane alone", () => {
    let state = threeLanes();
    state = reducer(
      state,
      applyNodeStreamMeta({
        runId: RUN,
        event: chunk("worker", "abc", { dispatch_id: "d1", item_index: 1 }),
        extraChunks: 4,
      }),
    );
    const nodes = laneState(state).nodes;
    expect(nodes[invocationKeyOf("worker", "d1", 1)]!.chunksReceived).toBe(5);
    expect(nodes[invocationKeyOf("worker", "d1", 0)]!.chunksReceived).toBe(0);
  });
});

describe("an UNATTRIBUTED frame keeps the old single-target behavior", () => {
  it("lands on exactly ONE lane, never on every sibling", () => {
    let state = threeLanes();
    state = reducer(
      state,
      applyNodeStreamMeta({ runId: RUN, event: chunk("worker", "hello") }),
    );
    const withTail = Object.values(laneState(state).nodes).filter(
      (n) => n.textTail.length > 0,
    );
    expect(withTail).toHaveLength(1);
  });

  it("`item_index: 0` with no dispatch_id is the ROOT invocation, not a fan-out", () => {
    // The wire's non-fan-out default is dispatch_id "" / item_index 0; reading
    // that as an attribution would split every ordinary node's lane.
    let state = reducer(undefined, attachRun({ runId: RUN }));
    state = reducer(
      state,
      applyRunEvent({
        runId: RUN,
        event: started("solo", "", 0, 1),
        seq: 1,
        replay: false,
      }),
    );
    state = reducer(
      state,
      applyNodeStreamMeta({
        runId: RUN,
        event: chunk("solo", "tokens", { dispatch_id: "", item_index: 0 }),
      }),
    );
    expect(laneState(state).nodes[invocationKeyOf("solo", null, 0)]!.textTail).toBe(
      "tokens",
    );
  });
});

describe("the heartbeat's reconnect tails", () => {
  function pollingRowState(byNode: Record<string, unknown>): WorkflowRunsState {
    let state = threeLanes();
    state = reducer(
      state,
      // The refresh only applies on the poller — SSE tails are assembled from
      // deltas and must never roll back to a throttled snapshot.
      { type: "workflowRuns/setTransportMode", payload: { runId: RUN, mode: "polling" } },
    );
    const row = {
      id: RUN,
      definition_id: "def",
      status: "running",
      input: null,
      output: null,
      error: null,
      created_at: "2026-08-28T00:00:00Z",
      completed_at: null,
      conversation_id: null,
      metadata: { _heartbeat: { _streaming_by_node: byNode } },
    } as unknown as RunRow;
    return reducer(state, refreshHeartbeatTails({ runId: RUN, row }));
  }

  it("reads the composite node:dispatch:index key onto its own lane", () => {
    const state = pollingRowState({
      "worker:d1:2": { live_text_tail: "sibling two's text" },
    });
    const nodes = laneState(state).nodes;
    expect(nodes[invocationKeyOf("worker", "d1", 2)]!.textTail).toBe(
      "sibling two's text",
    );
    expect(nodes[invocationKeyOf("worker", "d1", 0)]!.textTail).toBe("");
  });

  it("still reads a LEGACY bare node-id key (runs started before §5.2)", () => {
    const state = pollingRowState({ worker: { live_text_tail: "legacy tail" } });
    const withTail = Object.values(laneState(state).nodes).filter(
      (n) => n.textTail.length > 0,
    );
    expect(withTail).toHaveLength(1);
    expect(withTail[0]!.textTail).toBe("legacy tail");
  });
});

describe("selectNodeSiblingLanes", () => {
  it("orders the lanes by item_index, whatever order they started in", () => {
    let state = reducer(undefined, attachRun({ runId: RUN }));
    // Siblings arrive out of item order but IN seq order — the durable cursor
    // is monotonic, so a lower seq would be dropped as a redelivery.
    [2, 0, 1].forEach((index, seq) => {
      state = reducer(
        state,
        applyRunEvent({
          runId: RUN,
          event: started("worker", "d1", index, 3),
          seq: seq + 1,
          replay: false,
        }),
      );
    });
    const lanes = selectNodeSiblingLanes(RUN, "worker")({ workflowRuns: state });
    expect(lanes.map((lane) => lane.itemIndex)).toEqual([0, 1, 2]);
  });

  it("a step that ran ONCE has no lanes — the step row already is that lane", () => {
    let state = reducer(undefined, attachRun({ runId: RUN }));
    state = reducer(
      state,
      applyRunEvent({
        runId: RUN,
        event: started("solo", "", 0, 1),
        seq: 1,
        replay: false,
      }),
    );
    expect(
      selectNodeSiblingLanes(RUN, "solo")({ workflowRuns: state }),
    ).toHaveLength(0);
  });
});

describe("a resumed question leaves a decision record", () => {
  it("reads the answer off node_skipped — which is how the engine settles it", () => {
    // Proven live on run 6ffdc118: a resumed `control.human_input` settles as
    // `node_skipped` (it never executed; its output IS the answer), and the
    // fold used to discard that event's `output` entirely.
    let state = reducer(undefined, attachRun({ runId: RUN }));
    state = reducer(
      state,
      applyRunEvent({
        runId: RUN,
        event: {
          event: "node_started",
          run_id: RUN,
          ts: "2026-08-28T00:00:00Z",
          step: 1,
          node_id: "ask",
          spec_type: "control.human_input",
          attempt: 1,
          inputs: {},
        } as WorkflowRunEvent,
        seq: 1,
        replay: false,
      }),
    );
    state = reducer(
      state,
      applyRunEvent({
        runId: RUN,
        event: {
          event: "node_skipped",
          run_id: RUN,
          ts: "2026-08-28T00:00:05Z",
          step: 1,
          node_id: "ask",
          spec_type: "control.human_input",
          attempt: 1,
          output: {
            extras: { approved: true, note: "Looks right - ship it." },
            matrx_decision: {
              authority: "human",
              actor_label: "Dana Reyes",
              decided_at: "2026-08-28T00:00:05Z",
              escalated: false,
            },
          },
        } as unknown as WorkflowRunEvent,
        seq: 2,
        replay: false,
      }),
    );
    const decisions = selectRunDecisions(RUN)({ workflowRuns: state });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].approved).toBe(true);
    expect(decisions[0].note).toBe("Looks right - ship it.");
    expect(decisions[0].provenance?.actorLabel).toBe("Dana Reyes");
  });
});

describe("work_set_progress reaches a reader", () => {
  it("the folded set is selectable per node (nine fields, latest wave wins)", () => {
    let state = reducer(undefined, attachRun({ runId: RUN }));
    const progress = (wave: number, succeeded: number): WorkflowRunEvent =>
      ({
        event: "work_set_progress",
        run_id: RUN,
        ts: "2026-08-28T00:00:02Z",
        step: 1,
        node_id: "queue",
        set_name: "pages",
        wave,
        dispatched: 10,
        pending: 0,
        in_progress: 1,
        succeeded,
        failed: 1,
        dead_letter: 0,
        discovered: 12,
        done: false,
      }) as unknown as WorkflowRunEvent;

    state = reducer(
      state,
      applyRunEvent({ runId: RUN, event: progress(1, 3), seq: 1, replay: false }),
    );
    state = reducer(
      state,
      applyRunEvent({ runId: RUN, event: progress(2, 7), seq: 2, replay: false }),
    );
    const set = selectNodeWorkSet(RUN, "queue")({ workflowRuns: state });
    expect(set?.setName).toBe("pages");
    expect(set?.wave).toBe(2);
    expect(set?.succeeded).toBe(7);
    expect(set?.failed).toBe(1);
    expect(selectNodeWorkSet(RUN, "nothing")({ workflowRuns: state })).toBeNull();
  });
});
