/**
 * Tracked-tier stream meta: a node-level delta (no invocation identity on
 * the wire) lands on exactly ONE target invocation — fanning it into every
 * sibling rendered N identical copies (adversarial finding 11). Also covers
 * the sticky whole-node completion fact used by the trigger system.
 */

import reducer, {
  applyNodeStreamMeta,
  applyRunEvent,
  attachRun,
  type WorkflowRunsState,
} from "../redux/workflow-runs.slice";
import type { NodeStreamEvent, WorkflowRunEvent } from "../types";

const RUN = "run-1";

function started(
  nodeId: string,
  dispatchId: string,
  itemIndex: number,
  invocationCount: number,
): WorkflowRunEvent {
  return {
    event: "node_started",
    run_id: RUN,
    ts: "2026-08-16T00:00:00Z",
    step: 1,
    node_id: nodeId,
    spec_type: "agent",
    attempt: 1,
    dispatch_id: dispatchId,
    item_index: itemIndex,
    invocation_count: invocationCount,
    inputs: {},
  } as WorkflowRunEvent;
}

function completed(
  nodeId: string,
  dispatchId: string,
  itemIndex: number,
): WorkflowRunEvent {
  return {
    event: "node_completed",
    run_id: RUN,
    ts: "2026-08-16T00:00:01Z",
    step: 1,
    node_id: nodeId,
    spec_type: "agent",
    attempt: 1,
    dispatch_id: dispatchId,
    item_index: itemIndex,
    invocation_count: 2,
    duration_ms: 10,
    output: { value: "done" },
    output_kind: null,
    output_kind_ok: null,
    output_kind_errors: [],
    metadata: {},
  } as unknown as WorkflowRunEvent;
}

function chunk(nodeId: string, delta: string): NodeStreamEvent {
  return {
    event: "node_stream",
    run_id: RUN,
    node_id: nodeId,
    kind: "chunk",
    delta,
    stream_seq: 1,
    ts: "2026-08-16T00:00:00Z",
    chunks_received: 1,
    chars_streamed: delta.length,
  };
}

function fanOutState(): WorkflowRunsState {
  let state = reducer(undefined, attachRun({ runId: RUN }));
  state = reducer(
    state,
    applyRunEvent({ runId: RUN, event: started("fan", "d1", 0, 2), seq: 1, replay: false }),
  );
  state = reducer(
    state,
    applyRunEvent({ runId: RUN, event: started("fan", "d2", 1, 2), seq: 2, replay: false }),
  );
  return state;
}

describe("applyNodeStreamMeta single-target", () => {
  it("appends the tail to exactly ONE invocation, never every sibling", () => {
    let state = fanOutState();
    state = reducer(
      state,
      applyNodeStreamMeta({ runId: RUN, event: chunk("fan", "hello ") }),
    );
    const run = state.byRunId[RUN];
    const withTail = Object.values(run.nodes).filter((n) => n.textTail.length > 0);
    expect(withTail).toHaveLength(1);
    expect(withTail[0].textTail).toBe("hello ");
  });

  it("coalesced frames count via extraChunks", () => {
    let state = fanOutState();
    state = reducer(
      state,
      applyNodeStreamMeta({
        runId: RUN,
        event: chunk("fan", "abc"),
        extraChunks: 4,
      }),
    );
    const run = state.byRunId[RUN];
    const target = Object.values(run.nodes).find((n) => n.textTail === "abc");
    expect(target?.chunksReceived).toBe(5);
  });
});

describe("sticky whole-node completion", () => {
  it("marks completedNodes only when EVERY expected invocation is terminal", () => {
    let state = fanOutState();
    state = reducer(
      state,
      applyRunEvent({ runId: RUN, event: completed("fan", "d1", 0), seq: 3, replay: false }),
    );
    expect(state.byRunId[RUN].sticky.completedNodes["fan"]).toBeUndefined();
    state = reducer(
      state,
      applyRunEvent({ runId: RUN, event: completed("fan", "d2", 1), seq: 4, replay: false }),
    );
    expect(state.byRunId[RUN].sticky.completedNodes["fan"]).toBe(true);
  });

  it("stays fired when a retry regresses the live phase", () => {
    let state = fanOutState();
    state = reducer(
      state,
      applyRunEvent({ runId: RUN, event: completed("fan", "d1", 0), seq: 3, replay: false }),
    );
    state = reducer(
      state,
      applyRunEvent({ runId: RUN, event: completed("fan", "d2", 1), seq: 4, replay: false }),
    );
    // A higher-attempt restart of one sibling regresses its live phase…
    const retry = {
      ...started("fan", "d1", 0, 2),
      attempt: 2,
    } as WorkflowRunEvent;
    state = reducer(
      state,
      applyRunEvent({ runId: RUN, event: retry, seq: 5, replay: false }),
    );
    // …but the sticky fact never unfires.
    expect(state.byRunId[RUN].sticky.completedNodes["fan"]).toBe(true);
  });
});
