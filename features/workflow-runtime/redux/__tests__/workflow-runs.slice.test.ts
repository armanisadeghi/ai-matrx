/**
 * Reducer-direct tests for the workflow-runs slice — no store needed.
 * Events are built minimally inline and narrowed through the real
 * WorkflowRunEvent union; the reducer's structural readers tolerate the
 * omitted optional fields exactly as they tolerate them on the wire.
 */

import reducer, {
  applyNodeStreamMeta,
  applyRunEvent,
  attachRun,
  detachRun,
  seedRunRow,
  refreshHeartbeatTails,
  setTransportMode,
  TEXT_TAIL_CAP,
  type WorkflowRunsState,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import {
  invocationKeyOf,
  type NodeStreamEvent,
  type RunRow,
  type WorkflowRunEvent,
} from "@/features/workflow-runtime/types";

const RUN_ID = "run-1";

function initial(): WorkflowRunsState {
  return reducer(undefined, { type: "@@INIT" });
}

function attached(): WorkflowRunsState {
  return reducer(initial(), attachRun({ runId: RUN_ID }));
}

let seqCounter = 0;

function apply(
  state: WorkflowRunsState,
  event: WorkflowRunEvent,
  opts?: { seq?: number | null; replay?: boolean; runId?: string },
): WorkflowRunsState {
  seqCounter += 1;
  return reducer(
    state,
    applyRunEvent({
      runId: opts?.runId ?? RUN_ID,
      event,
      seq: opts?.seq === undefined ? seqCounter : opts.seq,
      replay: opts?.replay ?? false,
    }),
  );
}

function runStartedEvent(): WorkflowRunEvent {
  return {
    event: "run_started",
    run_id: RUN_ID,
    ts: "2026-08-16T00:00:00Z",
  } as WorkflowRunEvent;
}

function nodeStarted(
  nodeId: string,
  overrides: Record<string, unknown> = {},
): WorkflowRunEvent {
  return {
    event: "node_started",
    run_id: RUN_ID,
    node_id: nodeId,
    step: 1,
    attempt: 1,
    ts: "2026-08-16T00:00:01Z",
    ...overrides,
  } as WorkflowRunEvent;
}

function nodeCompleted(
  nodeId: string,
  overrides: Record<string, unknown> = {},
): WorkflowRunEvent {
  return {
    event: "node_completed",
    run_id: RUN_ID,
    node_id: nodeId,
    spec_type: "action.test",
    step: 1,
    attempt: 1,
    output: { value: "done" },
    duration_ms: 120,
    output_kind: null,
    output_kind_ok: null,
    output_kind_errors: null,
    output_kind_version: null,
    output_kind_degraded: null,
    metadata: null,
    ts: "2026-08-16T00:00:02Z",
    ...overrides,
  } as WorkflowRunEvent;
}

describe("workflow-runs slice", () => {
  beforeEach(() => {
    seqCounter = 0;
  });

  test("full lifecycle fold — fan-out settles only when all invocations complete", () => {
    let state = attached();
    state = apply(state, runStartedEvent());
    expect(state.byRunId[RUN_ID]?.status).toBe("running");

    // Fan-out: same node, two items, invocation_count 2.
    state = apply(
      state,
      nodeStarted("n1", { dispatch_id: "d1", item_index: 0, invocation_count: 2 }),
    );
    state = apply(
      state,
      nodeStarted("n1", { dispatch_id: "d1", item_index: 1, invocation_count: 2 }),
    );

    const run = state.byRunId[RUN_ID];
    expect(run?.nodeOrder).toEqual(["n1"]);
    const aggregate = run?.nodeAggregates["n1"];
    expect(aggregate?.expectedCount).toBe(2);
    expect(aggregate?.invocationKeys).toHaveLength(2);

    // First sibling completes — the second is still running: node_id alone is
    // never a completion key.
    state = apply(
      state,
      nodeCompleted("n1", { dispatch_id: "d1", item_index: 0, invocation_count: 2 }),
    );
    const keyA = invocationKeyOf("n1", "d1", 0);
    const keyB = invocationKeyOf("n1", "d1", 1);
    expect(state.byRunId[RUN_ID]?.nodes[keyA]?.phase).toBe("settled");
    expect(state.byRunId[RUN_ID]?.nodes[keyB]?.phase).toBe("running");

    // Second sibling completes — everything settled.
    state = apply(
      state,
      nodeCompleted("n1", { dispatch_id: "d1", item_index: 1, invocation_count: 2 }),
    );
    expect(state.byRunId[RUN_ID]?.nodes[keyB]?.phase).toBe("settled");
    expect(state.byRunId[RUN_ID]?.nodes[keyB]?.output).toEqual({ value: "done" });
    expect(state.byRunId[RUN_ID]?.nodes[keyB]?.durationMs).toBe(120);

    state = apply(state, {
      event: "run_completed",
      run_id: RUN_ID,
      ts: "2026-08-16T00:00:05Z",
    } as WorkflowRunEvent);
    expect(state.byRunId[RUN_ID]?.status).toBe("completed");
    expect(state.byRunId[RUN_ID]?.statusTs).toBe("2026-08-16T00:00:05Z");
  });

  test("failure then retry then success clears the error", () => {
    let state = attached();
    state = apply(state, runStartedEvent());
    state = apply(state, nodeStarted("n1"));
    state = apply(state, {
      event: "node_failed",
      run_id: RUN_ID,
      node_id: "n1",
      step: 1,
      attempt: 1,
      error_type: "ToolError",
      error_message: "boom",
      ts: "t",
    } as WorkflowRunEvent);

    const key = invocationKeyOf("n1", null, 0);
    expect(state.byRunId[RUN_ID]?.nodes[key]?.phase).toBe("failed");
    expect(state.byRunId[RUN_ID]?.nodes[key]?.error).toEqual({
      type: "ToolError",
      message: "boom",
    });

    state = apply(state, {
      event: "node_retry_scheduled",
      run_id: RUN_ID,
      node_id: "n1",
      step: 1,
      attempt: 2,
      ts: "t",
    } as WorkflowRunEvent);
    expect(state.byRunId[RUN_ID]?.nodes[key]?.phase).toBe("retrying");
    expect(state.byRunId[RUN_ID]?.nodes[key]?.attempt).toBe(2);

    state = apply(state, nodeStarted("n1", { attempt: 2 }));
    expect(state.byRunId[RUN_ID]?.nodes[key]?.phase).toBe("running");

    state = apply(state, nodeCompleted("n1", { attempt: 2 }));
    expect(state.byRunId[RUN_ID]?.nodes[key]?.phase).toBe("settled");
    expect(state.byRunId[RUN_ID]?.nodes[key]?.error).toBeNull();
  });

  test("regress guard — a late node_started at the same attempt cannot reopen a settled invocation", () => {
    let state = attached();
    state = apply(state, nodeStarted("n1"));
    state = apply(state, nodeCompleted("n1"));
    state = apply(state, nodeStarted("n1")); // late redelivery, attempt 1
    const key = invocationKeyOf("n1", null, 0);
    expect(state.byRunId[RUN_ID]?.nodes[key]?.phase).toBe("settled");
  });

  test("interrupt is set by run_interrupted and cleared by run_resumed", () => {
    let state = attached();
    state = apply(state, runStartedEvent());
    state = apply(state, {
      event: "run_interrupted",
      run_id: RUN_ID,
      node_id: "ask",
      payload: { question: "proceed?" },
      checkpoint_id: "cp-1",
      ts: "t",
    } as WorkflowRunEvent);

    expect(state.byRunId[RUN_ID]?.status).toBe("interrupted");
    expect(state.byRunId[RUN_ID]?.interrupt).toEqual({
      nodeId: "ask",
      payload: { question: "proceed?" },
      checkpointId: "cp-1",
    });

    state = apply(state, {
      event: "run_resumed",
      run_id: RUN_ID,
      ts: "t2",
    } as WorkflowRunEvent);
    expect(state.byRunId[RUN_ID]?.status).toBe("running");
    expect(state.byRunId[RUN_ID]?.interrupt).toBeNull();
  });

  test("seq dedup — the same seq applies once; replay bypasses the guard", () => {
    let state = attached();
    state = apply(state, nodeStarted("n1"), { seq: 5 });
    // Duplicate delivery of seq 5 with a different payload must be ignored.
    state = apply(state, nodeCompleted("n1"), { seq: 5 });
    const key = invocationKeyOf("n1", null, 0);
    expect(state.byRunId[RUN_ID]?.nodes[key]?.phase).toBe("running");

    // Replay mode still applies.
    state = apply(state, nodeCompleted("n1"), { seq: 5, replay: true });
    expect(state.byRunId[RUN_ID]?.nodes[key]?.phase).toBe("settled");
  });

  test("lastEventSeq is monotonic and null seq leaves it untouched", () => {
    let state = attached();
    state = apply(state, nodeStarted("n1"), { seq: 10 });
    expect(state.byRunId[RUN_ID]?.lastEventSeq).toBe(10);
    // Replayed lower seq applies but never rolls the cursor back.
    state = apply(state, nodeCompleted("n1"), { seq: 3, replay: true });
    expect(state.byRunId[RUN_ID]?.lastEventSeq).toBe(10);
    state = apply(state, {
      event: "run_completed",
      run_id: RUN_ID,
      ts: "t",
    } as WorkflowRunEvent, { seq: null });
    expect(state.byRunId[RUN_ID]?.lastEventSeq).toBe(10);
    expect(state.byRunId[RUN_ID]?.status).toBe("completed");
  });

  test("subgraph_run_linked dedupes childRunIds and auto-attaches the child with parentRunId", () => {
    let state = attached();
    const link = {
      event: "subgraph_run_linked",
      run_id: RUN_ID,
      node_id: "sub",
      step: 2,
      attempt: 1,
      child_run_id: "run-child",
      child_definition_id: "def-9",
      child_definition_name: "Child",
      child_status: "running",
      reattached: false,
      ts: "t",
    } as WorkflowRunEvent;
    state = apply(state, link);
    state = apply(state, link);

    expect(state.byRunId[RUN_ID]?.childRunIds).toEqual(["run-child"]);
    expect(state.byRunId[RUN_ID]?.childRunsByNode).toEqual({
      sub: "run-child",
    });
    expect(state.byRunId["run-child"]?.parentRunId).toBe(RUN_ID);
    expect(state.byRunId["run-child"]?.definitionId).toBe("def-9");

    // A re-run of the node relinks to its fresh child — latest link wins.
    state = apply(state, {
      ...(link as unknown as Record<string, unknown>),
      child_run_id: "run-child-2",
    } as WorkflowRunEvent);
    expect(state.byRunId[RUN_ID]?.childRunsByNode["sub"]).toBe("run-child-2");
    expect(state.byRunId[RUN_ID]?.childRunIds).toEqual([
      "run-child",
      "run-child-2",
    ]);
  });

  test("node_cost folds idempotently by invocation identity", () => {
    let state = attached();
    const cost = {
      event: "node_cost",
      run_id: RUN_ID,
      node_id: "n1",
      step: 1,
      attempt: 1,
      cost_usd: 0.5,
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      model: "m",
      ts: "t",
    } as WorkflowRunEvent;
    state = apply(state, cost);
    // Replayed duplicate overwrites the same key — never double-counts.
    state = apply(state, cost, { replay: true });
    expect(state.byRunId[RUN_ID]?.costTotalUsd).toBeCloseTo(0.5);

    state = apply(state, {
      event: "node_cost",
      run_id: RUN_ID,
      node_id: "n1",
      step: 3,
      attempt: 1,
      cost_usd: 0.25,
      ts: "t",
    } as WorkflowRunEvent);
    expect(state.byRunId[RUN_ID]?.costTotalUsd).toBeCloseTo(0.75);
    expect(state.byRunId[RUN_ID]?.costsByNode["n1:1:1"]).toBeCloseTo(0.5);
    expect(state.byRunId[RUN_ID]?.costsByNode["n1:3:1"]).toBeCloseTo(0.25);
    expect(state.byRunId[RUN_ID]?.stepsExecuted).toBe(3);
  });

  test("textTail append keeps the END under the cap", () => {
    let state = attached();
    state = apply(state, nodeStarted("n1"));
    const key = invocationKeyOf("n1", null, 0);

    const big = "a".repeat(TEXT_TAIL_CAP);
    const streamBig = {
      kind: "chunk",
      delta: big,
      node_id: "n1",
      stream_seq: 1,
    } as NodeStreamEvent;
    state = reducer(state, applyNodeStreamMeta({ runId: RUN_ID, event: streamBig }));
    const tailSuffix = {
      kind: "chunk",
      delta: "THE-END",
      node_id: "n1",
      stream_seq: 2,
    } as NodeStreamEvent;
    state = reducer(
      state,
      applyNodeStreamMeta({ runId: RUN_ID, event: tailSuffix }),
    );

    const invocation = state.byRunId[RUN_ID]?.nodes[key];
    expect(invocation?.textTail.length).toBe(TEXT_TAIL_CAP);
    expect(invocation?.textTail.endsWith("THE-END")).toBe(true);
    expect(invocation?.chunksReceived).toBe(2);
    expect(invocation?.lastStreamKind).toBe("chunk");
  });

  test("detachRun cascades to children recursively", () => {
    let state = attached();
    state = reducer(
      state,
      attachRun({ runId: "run-child", parentRunId: RUN_ID }),
    );
    state = reducer(
      state,
      attachRun({ runId: "run-grandchild", parentRunId: "run-child" }),
    );
    state = reducer(state, attachRun({ runId: "run-unrelated" }));

    state = reducer(state, detachRun({ runId: RUN_ID }));
    expect(state.byRunId[RUN_ID]).toBeUndefined();
    expect(state.byRunId["run-child"]).toBeUndefined();
    expect(state.byRunId["run-grandchild"]).toBeUndefined();
    expect(state.byRunId["run-unrelated"]).toBeDefined();
  });

  test("attachRun is idempotent — re-attach keeps existing run state", () => {
    let state = attached();
    state = apply(state, runStartedEvent());
    state = apply(state, nodeStarted("n1"));
    state = reducer(state, attachRun({ runId: RUN_ID }));
    expect(state.byRunId[RUN_ID]?.status).toBe("running");
    expect(state.byRunId[RUN_ID]?.nodeOrder).toEqual(["n1"]);
  });

  test("seedRunRow seeds status + heartbeat tails without clobbering live textTail", () => {
    let state = attached();
    state = apply(state, nodeStarted("n1"));
    state = apply(state, nodeStarted("n2"));
    // n1 already streamed live text.
    state = reducer(
      state,
      applyNodeStreamMeta({
        runId: RUN_ID,
        event: {
          kind: "chunk",
          delta: "live text",
          node_id: "n1",
          stream_seq: 1,
        } as NodeStreamEvent,
      }),
    );

    const row: RunRow = {
      id: RUN_ID,
      definition_id: "def-1",
      status: "running",
      input: null,
      output: null,
      error: null,
      created_at: "2026-08-16T00:00:00Z",
      completed_at: null,
      metadata: {
        _heartbeat: {
          _streaming_by_node: {
            n1: { live_text_tail: "stale heartbeat" },
            n2: { live_text_tail: "heartbeat tail" },
          },
        },
      },
      conversation_id: null,
    };

    state = reducer(state, seedRunRow({ runId: RUN_ID, row }));
    const k1 = invocationKeyOf("n1", null, 0);
    const k2 = invocationKeyOf("n2", null, 0);
    expect(state.byRunId[RUN_ID]?.status).toBe("running");
    expect(state.byRunId[RUN_ID]?.nodes[k1]?.textTail).toBe("live text");
    expect(state.byRunId[RUN_ID]?.nodes[k2]?.textTail).toBe("heartbeat tail");
  });

  test("seedRunRow adopts a TERMINAL row over a non-terminal replayed status (watchdog force-fail)", () => {
    // The lifecycle sweeper stamps workflow.run.status='failed' directly on the
    // row and appends NO terminal event to the durable log — so replay ends on
    // "running" while the row is terminal. Without adoption the run renders as
    // forever-in-flight (live clock, Pause/Stop, no error card) and can never
    // self-correct, because the adopter sees a terminal row and never follows
    // live.
    let state = attached();
    state = apply(state, runStartedEvent());
    expect(state.byRunId[RUN_ID]?.status).toBe("running");
    expect(state.byRunId[RUN_ID]?.statusTs).not.toBeNull();

    const row: RunRow = {
      id: RUN_ID,
      definition_id: "def-1",
      status: "failed",
      input: null,
      output: null,
      error: { message: "Watchdog force-failed run", error_type: "watchdog_timeout" },
      created_at: "2026-08-16T00:00:00Z",
      completed_at: null,
      metadata: null,
      conversation_id: null,
    };

    state = reducer(state, seedRunRow({ runId: RUN_ID, row }));
    expect(state.byRunId[RUN_ID]?.status).toBe("failed");
    expect(state.byRunId[RUN_ID]?.error).toEqual(row.error);
    // The sweeper writes no completed_at — the replayed run_started stamp is
    // left alone rather than invented.
    expect(state.byRunId[RUN_ID]?.statusTs).toBe("2026-08-16T00:00:00Z");
  });

  test("seedRunRow adopts a terminal 'cancelled' row and takes completed_at as the end", () => {
    let state = attached();
    state = apply(state, runStartedEvent());

    const row: RunRow = {
      id: RUN_ID,
      definition_id: "def-1",
      status: "cancelled",
      input: null,
      output: null,
      error: null,
      created_at: "2026-08-16T00:00:00Z",
      completed_at: "2026-08-16T00:04:00Z",
      metadata: null,
      conversation_id: null,
    };

    state = reducer(state, seedRunRow({ runId: RUN_ID, row }));
    expect(state.byRunId[RUN_ID]?.status).toBe("cancelled");
    expect(state.byRunId[RUN_ID]?.statusTs).toBe("2026-08-16T00:04:00Z");
  });

  test("seedRunRow never regresses a terminal replayed status to the row's stale 'running' (Bugbot #148)", () => {
    let state = attached();
    state = apply(state, runStartedEvent());
    state = apply(state, {
      event: "run_completed",
      run_id: RUN_ID,
      ts: "2026-08-16T00:00:05Z",
    } as WorkflowRunEvent);

    // The row is a PRE-replay snapshot: it still says running.
    const row: RunRow = {
      id: RUN_ID,
      definition_id: "def-1",
      status: "running",
      input: null,
      output: null,
      error: null,
      created_at: "2026-08-16T00:00:00Z",
      completed_at: null,
      metadata: null,
      conversation_id: null,
    };

    state = reducer(state, seedRunRow({ runId: RUN_ID, row }));
    expect(state.byRunId[RUN_ID]?.status).toBe("completed");
    expect(state.byRunId[RUN_ID]?.statusTs).toBe("2026-08-16T00:00:05Z");
  });

  test("refreshHeartbeatTails advances the tail on the poller and is inert on SSE", () => {
    // The bug this locks down: `node_stream` frames are SSE-only and never
    // replayed, and `seedRunRow` runs ONCE at attach — when the heartbeat is
    // still empty. A poller-bound client therefore rendered a skeleton for
    // the whole run no matter how much text the server streamed.
    const rowWithTail = (tail: string): RunRow => ({
      id: RUN_ID,
      definition_id: "def-1",
      status: "running",
      input: null,
      output: null,
      error: null,
      created_at: "2026-08-16T00:00:00Z",
      completed_at: null,
      metadata: { _heartbeat: { _streaming_by_node: { n1: { live_text_tail: tail } } } },
      conversation_id: null,
    });
    const k1 = invocationKeyOf("n1", null, 0);

    let state = attached();
    state = apply(state, nodeStarted("n1"));
    state = reducer(state, setTransportMode({ runId: RUN_ID, mode: "polling" }));

    // First refresh seeds; a LATER refresh must advance it, not be ignored
    // because the tail is already non-empty (seedRunRow's baseline guard).
    state = reducer(state, refreshHeartbeatTails({ runId: RUN_ID, row: rowWithTail("first 300 chars") }));
    expect(state.byRunId[RUN_ID]?.nodes[k1]?.textTail).toBe("first 300 chars");
    state = reducer(state, refreshHeartbeatTails({ runId: RUN_ID, row: rowWithTail("now 900 chars") }));
    expect(state.byRunId[RUN_ID]?.nodes[k1]?.textTail).toBe("now 900 chars");

    // On SSE the tail is assembled from live deltas — a throttled snapshot
    // must never roll it back.
    state = reducer(state, setTransportMode({ runId: RUN_ID, mode: "sse" }));
    state = reducer(
      state,
      applyNodeStreamMeta({
        runId: RUN_ID,
        event: { kind: "chunk", delta: " + live delta", node_id: "n1", stream_seq: 2 } as NodeStreamEvent,
      }),
    );
    const liveTail = state.byRunId[RUN_ID]?.nodes[k1]?.textTail;
    state = reducer(state, refreshHeartbeatTails({ runId: RUN_ID, row: rowWithTail("stale snapshot") }));
    expect(state.byRunId[RUN_ID]?.nodes[k1]?.textTail).toBe(liveTail);
  });

  test("node_emitted appends to run emissions with the cap dropping oldest", () => {
    let state = attached();
    for (let i = 0; i < 105; i += 1) {
      state = apply(state, {
        event: "node_emitted",
        run_id: RUN_ID,
        node_id: "emit",
        step: 1,
        attempt: 1,
        mode: "summary",
        payload: { index: i },
        component_ref: null,
        surface: "matrx-user/workflow",
        title: `Emission ${i}`,
        ts: `t${i}`,
      } as WorkflowRunEvent);
    }
    const emissions = state.byRunId[RUN_ID]?.emissions ?? [];
    expect(emissions).toHaveLength(100);
    expect(emissions[0]?.title).toBe("Emission 5");
    expect(emissions[99]?.title).toBe("Emission 104");
  });

  test("node_emitted records the durable seq and whether it came from replay", () => {
    let state = attached();

    const emit = (title: string): WorkflowRunEvent =>
      ({
        event: "node_emitted",
        run_id: RUN_ID,
        node_id: "emit",
        step: 1,
        attempt: 1,
        mode: "summary",
        payload: { title },
        component_ref: "status_card",
        surface: "matrx-user/workflow",
        title,
        ts: title,
      }) as WorkflowRunEvent;

    // A history refold — what a refresh does before the live follow starts.
    state = apply(state, emit("replayed"), { seq: 700, replay: true });
    // A live arrival.
    state = apply(state, emit("live"), { seq: 701 });

    const emissions = state.byRunId[RUN_ID]?.emissions ?? [];
    expect(emissions).toHaveLength(2);
    expect(emissions[0]).toMatchObject({
      seq: 700,
      persisted: true,
      componentRef: "status_card",
    });
    expect(emissions[1]).toMatchObject({ seq: 701, persisted: false });
    // The seq is THE identity — it must be unique across the ring so a key
    // built from it never collides.
    expect(new Set(emissions.map((e) => e.seq)).size).toBe(2);
  });

  test("work_set_progress keeps the latest wave and refuses a rollback", () => {
    let state = attached();
    const wave = (n: number, done: boolean): WorkflowRunEvent =>
      ({
        event: "work_set_progress",
        run_id: RUN_ID,
        node_id: "queue",
        step: 1,
        attempt: 1,
        set_name: "pages",
        wave: n,
        dispatched: 10,
        pending: done ? 0 : 4,
        in_progress: done ? 0 : 2,
        succeeded: done ? 10 : 4,
        failed: 0,
        dead_letter: 0,
        discovered: 10,
        done,
        ts: "t",
      }) as WorkflowRunEvent;

    state = apply(state, wave(2, true));
    state = apply(state, wave(1, false), { replay: true });
    expect(state.byRunId[RUN_ID]?.workSets["queue"]?.wave).toBe(2);
    expect(state.byRunId[RUN_ID]?.workSets["queue"]?.done).toBe(true);
  });
});
