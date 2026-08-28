/**
 * The runs lists — census #39: the row parse, and the stream-driven update
 * that is the whole reason these lists do not poll.
 */

import {
  applyAnnouncement,
  isTerminalStatus,
  parseRunListRow,
  parseRunListRows,
  primaryDeliverableKind,
  runDurationMs,
  runHref,
  type RunListRow,
} from "../runs";

const ROW = {
  id: "run-1",
  definition_id: "def-1",
  status: "completed",
  // Not declared in the OpenAPI schema — RunRecord is _AllowExtra and these
  // reach the wire off the workflow.run row. See runs.ts.
  created_at: "2026-08-27T10:00:00Z",
  started_at: "2026-08-27T10:00:05Z",
  completed_at: "2026-08-27T10:01:35Z",
  parent_run_id: null,
  result: {
    __kind: "run_result",
    outputs: { final: { output_kind: "article", output: { __kind: "article" } } },
  },
};

describe("parseRunListRow", () => {
  it("reads the row, timestamps and declared kind included", () => {
    expect(parseRunListRow(ROW)).toEqual({
      runId: "run-1",
      definitionId: "def-1",
      status: "completed",
      startedAt: "2026-08-27T10:00:05Z",
      completedAt: "2026-08-27T10:01:35Z",
      parentRunId: null,
      deliverableKind: "article",
    });
  });

  it("falls back to created_at when the engine never stamped a start", () => {
    const { started_at: _dropped, ...rest } = ROW;
    expect(parseRunListRow(rest)?.startedAt).toBe("2026-08-27T10:00:00Z");
  });

  it("drops a row with no id, and never throws on junk", () => {
    expect(parseRunListRow({ ...ROW, id: "" })).toBeNull();
    expect(parseRunListRows("nope")).toEqual([]);
    expect(parseRunListRows([ROW, null, 7])).toHaveLength(1);
  });
});

describe("primaryDeliverableKind", () => {
  it("takes the first outcome that declares a kind, in server order", () => {
    expect(
      primaryDeliverableKind({
        outputs: [{ output_kind: null }, { output_kind: "report" }, { output_kind: "x" }],
      }),
    ).toBe("report");
  });

  it("reads the kind off the nested output when the outcome does not name one", () => {
    expect(primaryDeliverableKind({ outputs: [{ output: { __kind: "table" } }] })).toBe(
      "table",
    );
  });

  it("is null — not a guess — when nothing declared a kind", () => {
    expect(primaryDeliverableKind(null)).toBeNull();
    expect(primaryDeliverableKind({ outputs: {} })).toBeNull();
    expect(primaryDeliverableKind({ outputs: [{ output: {} }] })).toBeNull();
  });
});

describe("runDurationMs", () => {
  const row = parseRunListRow(ROW)!;

  it("measures a finished run start-to-finish", () => {
    expect(runDurationMs(row)).toBe(90_000);
  });

  it("measures a live run against now", () => {
    const live: RunListRow = { ...row, status: "running", completedAt: null };
    expect(runDurationMs(live, Date.parse("2026-08-27T10:00:35Z"))).toBe(30_000);
  });

  it("is null rather than a plausible number when it cannot be measured", () => {
    expect(runDurationMs({ ...row, startedAt: null })).toBeNull();
    expect(runDurationMs({ ...row, startedAt: "not a date" })).toBeNull();
    expect(runDurationMs({ ...row, completedAt: "2026-08-27T09:00:00Z" })).toBeNull();
  });
});

describe("applyAnnouncement — the stream-driven list update", () => {
  const rows = parseRunListRows([ROW, { ...ROW, id: "run-2", status: "running" }]);

  it("patches a listed run's status in place, with no refetch", () => {
    const result = applyAnnouncement(rows, { run_id: "run-2", status: "failed" });
    expect(result.needsRefresh).toBe(false);
    expect(result.rows[1].status).toBe("failed");
    // Untouched rows keep their identity so the list does not re-render whole.
    expect(result.rows[0]).toBe(rows[0]);
  });

  it("stamps a completion instant so a terminal row stops accruing duration", () => {
    const { rows: patched } = applyAnnouncement(rows, {
      run_id: "run-2",
      status: "completed",
    });
    expect(patched[1].completedAt).not.toBeNull();
    expect(runDurationMs(patched[1])).not.toBeNull();
  });

  it("never overwrites a completion instant the server already gave", () => {
    const { rows: patched } = applyAnnouncement(rows, {
      run_id: "run-1",
      status: "cancelled",
    });
    expect(patched[0].completedAt).toBe("2026-08-27T10:01:35Z");
  });

  it("asks for a refetch for a run it has never seen — a new run cannot be invented", () => {
    const result = applyAnnouncement(rows, { run_id: "run-new", status: "running" });
    expect(result.needsRefresh).toBe(true);
    expect(result.rows).toBe(rows);
  });

  it("is a no-op, same array, when the status did not actually change", () => {
    const result = applyAnnouncement(rows, { run_id: "run-2", status: "running" });
    expect(result).toEqual({ rows, needsRefresh: false });
    expect(result.rows).toBe(rows);
  });
});

describe("row identity", () => {
  it("opens the run permalink", () => {
    expect(runHref(parseRunListRow(ROW)!)).toBe("/workflows/runs/run-1");
  });

  it("knows which statuses are finished forever", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("interrupted")).toBe(false);
    expect(isTerminalStatus("awaiting_input")).toBe(false);
  });
});
