/**
 * Phase 3 signal→refetch pump: parseSignalDelta tolerance + the
 * applyRunSignal reducer's revision/bounding contract.
 */

import { parseSignalDelta } from "../types";
import reducer, {
  applyRunSignal,
  attachRun,
  SIGNALS_MAX,
  type WorkflowRunsState,
} from "../redux/workflow-runs.slice";

describe("parseSignalDelta", () => {
  it("parses a record_update summary", () => {
    const signal = parseSignalDelta(
      "record_update",
      JSON.stringify({ table: "note", record_id: "r1", status: "completed" }),
      "n1",
      123,
    );
    expect(signal).toMatchObject({
      signalKind: "record_update",
      table: "note",
      recordId: "r1",
      status: "completed",
      resourceKind: null,
      nodeId: "n1",
      receivedAt: 123,
    });
  });

  it("parses a resource_changed summary", () => {
    const signal = parseSignalDelta(
      "resource_changed",
      JSON.stringify({ kind: "fs.file", action: "updated", resource_id: "/a" }),
      null,
      5,
    );
    expect(signal).toMatchObject({
      signalKind: "resource_changed",
      table: null,
      resourceKind: "fs.file",
      action: "updated",
      resourceId: "/a",
      nodeId: null,
    });
  });

  it("never throws on garbage — an unparseable delta is still a signal", () => {
    for (const delta of ["", "not json", '{"table": 42}', "[1,2]", "{trunc"]) {
      const signal = parseSignalDelta("record_update", delta, null, 0);
      expect(signal.signalKind).toBe("record_update");
      expect(signal.table).toBeNull();
    }
  });
});

describe("applyRunSignal", () => {
  const attach = (): WorkflowRunsState =>
    reducer(undefined, attachRun({ runId: "run-1" }));

  const signalFor = (table: string | null) =>
    parseSignalDelta(
      "record_update",
      JSON.stringify(table ? { table, record_id: "x" } : {}),
      null,
      1,
    );

  it("bumps the coarse revision on every signal, table revision when named", () => {
    let state = attach();
    state = reducer(
      state,
      applyRunSignal({ runId: "run-1", signal: signalFor("note") }),
    );
    state = reducer(
      state,
      applyRunSignal({ runId: "run-1", signal: signalFor(null) }),
    );
    const run = state.byRunId["run-1"];
    expect(run.signalRevision).toBe(2);
    expect(run.signalRevisionByTable["note"]).toBe(1);
    expect(run.signals).toHaveLength(2);
  });

  it("bounds the ring at SIGNALS_MAX, oldest dropped", () => {
    let state = attach();
    for (let i = 0; i < SIGNALS_MAX + 10; i++) {
      state = reducer(
        state,
        applyRunSignal({ runId: "run-1", signal: signalFor("note") }),
      );
    }
    const run = state.byRunId["run-1"];
    expect(run.signals).toHaveLength(SIGNALS_MAX);
    expect(run.signalRevision).toBe(SIGNALS_MAX + 10);
  });

  it("ignores signals for unattached runs", () => {
    const state = reducer(
      attach(),
      applyRunSignal({ runId: "missing", signal: signalFor("note") }),
    );
    expect(state.byRunId["missing"]).toBeUndefined();
  });
});
