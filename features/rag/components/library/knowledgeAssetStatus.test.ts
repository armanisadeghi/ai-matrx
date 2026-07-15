import { getRepresentationState } from "./knowledgeAssetStatus";
import type { DerivationRun } from "@/features/rag/api/derivations";
import type { OpState } from "@/features/rag/hooks/useKnowledgeAssetRunner";

const idleOp: OpState = {
  kind: "section_summary",
  status: "idle",
  current: 0,
  total: 0,
  message: "",
  chunksWritten: 0,
  runId: null,
  error: null,
  startedAt: null,
  endedAt: null,
};

function run(status: DerivationRun["status"], current: number): DerivationRun {
  return {
    run_id: "run-1",
    derivation_kind: "section_summary",
    status,
    current,
    total: 200,
    chunks_written: current,
    error: status === "failed" ? "interrupted" : null,
    started_at: null,
    finished_at: null,
  };
}

describe("knowledge asset action state", () => {
  it("offers resume when a failed run has durable progress", () => {
    expect(
      getRepresentationState({
        kind: "section_summary",
        rollup: {
          derivation_kind: "section_summary",
          derivative_id: "derivative-1",
          chunk_count: 144,
          updated_at: null,
        },
        op: idleOp,
        estimate: {
          runs: 200,
          unit: "sections",
          items: 200,
          note: "",
          cost_usd: 1,
        },
        latestRun: run("failed", 145),
      }),
    ).toEqual({ started: true, complete: false, resumable: true });
  });

  it("treats persisted output below the estimated scope as resumable", () => {
    expect(
      getRepresentationState({
        kind: "section_summary",
        rollup: {
          derivation_kind: "section_summary",
          derivative_id: "derivative-1",
          chunk_count: 144,
          updated_at: null,
        },
        op: idleOp,
        estimate: {
          runs: 200,
          unit: "sections",
          items: 200,
          note: "",
          cost_usd: 1,
        },
        latestRun: undefined,
      }).resumable,
    ).toBe(true);
  });

  it("reserves rebuild for a completed representation", () => {
    const state = getRepresentationState({
      kind: "section_summary",
      rollup: {
        derivation_kind: "section_summary",
        derivative_id: "derivative-1",
        chunk_count: 200,
        updated_at: null,
      },
      op: idleOp,
      estimate: {
        runs: 200,
        unit: "sections",
        items: 200,
        note: "",
        cost_usd: 1,
      },
      latestRun: run("completed", 200),
    });

    expect(state.complete).toBe(true);
    expect(state.resumable).toBe(false);
  });

  it("does not mistake many Q&A chunks for completed sections", () => {
    const state = getRepresentationState({
      kind: "synthetic_qa",
      rollup: {
        derivation_kind: "synthetic_qa",
        derivative_id: "derivative-1",
        chunk_count: 575,
        completed_items: 100,
        updated_at: null,
      },
      op: { ...idleOp, kind: "synthetic_qa" },
      estimate: {
        runs: 144,
        unit: "sections",
        items: 144,
        note: "",
        cost_usd: 1,
      },
      latestRun: { ...run("completed", 144), derivation_kind: "synthetic_qa" },
    });

    expect(state).toEqual({ started: true, complete: false, resumable: true });
  });
});
