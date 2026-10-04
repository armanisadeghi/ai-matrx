import {
  allCellConversationIds,
  avgMetrics,
  cellMetrics,
  cellStatusLabel,
  entryToCell,
  failedCellCount,
  shouldPoll,
  unfinishedLabel,
  spendOf,
  sumMetrics,
} from "../model";
import type { ComparisonEntryRow } from "../../../types";

function row(md: Record<string, unknown>, conversationId = "conv-now"): ComparisonEntryRow {
  return {
    id: `e-${Math.random()}`,
    comparison_set_id: "s",
    conversation_id: conversationId,
    display_order: 0,
    agent_id: "a",
    agent_version: null,
    agent_version_snapshot_id: null,
    created_at: "",
    metadata: { kind: "matrix_cell", row_id: "r", column_id: "c", repeat: 0, ...md },
  };
}
const cell = (md: Record<string, unknown>, id?: string) => entryToCell(row(md, id), Date.now())!;
const res = (input: number, cached: number, output: number, cost: number) => ({
  input_tokens: input,
  cached_tokens: cached,
  output_tokens: output,
  total_tokens: input + cached + output,
  cost,
});

describe("totals are real spend (finding 1)", () => {
  const done = cell({ status: "completed", result: res(100, 0, 10, 0.01) });
  const failed = cell({ status: "failed", error: "boom", result: res(4444, 0, 576, 0.000453) });
  const retried = cell({
    status: "completed",
    attempt: 2,
    result: res(100, 0, 10, 0.01),
    history: [{ attempt: 1, conversation_id: "conv-old", status: "failed", result: res(50, 0, 5, 0.002) }],
  });

  it("counts a failed cell's cost and tokens in the total and says it failed", () => {
    const total = spendOf([done, failed], false);
    expect(total.cost).toBeCloseTo(0.010453);
    expect(total.inputAll).toBe(4544);
    expect(total.unfinished).toBe(1);
    expect(failedCellCount([done, failed])).toBe(1);
    expect(unfinishedLabel([done, failed, cell({ status: "cancelled" })])).toBe("1 failed · 1 cancelled");
  });

  it("adds earlier attempts only when asked", () => {
    expect(spendOf([retried], false).cost).toBeCloseTo(0.01);
    expect(spendOf([retried], true).cost).toBeCloseTo(0.012);
  });

  it("keeps averages to completed runs", () => {
    const avg = avgMetrics(sumMetrics([done, failed].map(cellMetrics)))!;
    expect(avg.n).toBe(1);
    expect(avg.cost).toBeCloseTo(0.01);
  });
});

describe("cached input is its own number (finding 2)", () => {
  it("separates uncached, cached and total input", () => {
    // Same arm, cold vs warm cache: total input is what is comparable.
    const cold = spendOf([cell({ status: "completed", result: res(6570, 0, 99, 0.004) })], false);
    const warm = spendOf([cell({ status: "completed", result: res(804, 5766, 99, 0.002) })], false);
    expect(cold.input).toBe(6570);
    expect(warm.input).toBe(804);
    expect(warm.cached).toBe(5766);
    expect(warm.inputAll).toBe(cold.inputAll);
  });
});

describe("queued is never labelled running (finding 3)", () => {
  it("names the state each cell is in", () => {
    expect(cellStatusLabel([cell({ status: "queued", heartbeat_at: new Date().toISOString() })])).toBe("Queued");
    expect(cellStatusLabel([cell({ status: "running", heartbeat_at: new Date().toISOString() })])).toBe("Running");
    expect(cellStatusLabel([])).toBe("Not run");
  });
});

describe("archive reaches every attempt (finding 4)", () => {
  it("collects current and earlier conversation ids once each", () => {
    const rows = [
      row({ history: [{ attempt: 1, conversation_id: "conv-a1" }, { attempt: 2, conversation_id: "conv-a2" }] }, "conv-a3"),
      row({}, "conv-b1"),
    ];
    expect(allCellConversationIds(rows).sort()).toEqual(["conv-a1", "conv-a2", "conv-a3", "conv-b1"]);
  });
});

describe("a lapsed lease is stalled, never polled forever", () => {
  const old = new Date(Date.now() - 120_000).toISOString();
  const fresh = new Date().toISOString();

  it("marks a queued cell past its heartbeat lease as stalled", () => {
    const c = cell({ status: "queued", heartbeat_at: old });
    expect(c.stalled).toBe(true);
    expect(cellStatusLabel([c])).toBe("Stalled");
    expect(cell({ status: "queued", heartbeat_at: fresh }).stalled).toBe(false);
  });

  it("stops polling when every unfinished cell is stalled", () => {
    const stalled = [cell({ status: "queued", heartbeat_at: old }), cell({ status: "running", heartbeat_at: old })];
    expect(shouldPoll([...stalled, cell({ status: "completed" })], false)).toBe(false);
    expect(shouldPoll([...stalled, cell({ status: "queued", heartbeat_at: fresh })], false)).toBe(true);
  });

  it("treats a queued cell with no time signal as stalled", () => {
    expect(cell({ status: "queued" }).stalled).toBe(true);
  });
});
