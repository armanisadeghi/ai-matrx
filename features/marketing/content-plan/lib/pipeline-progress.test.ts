import type { PlanNodeStepRow } from "../types";
import {
  buildNodePipelineProgress,
  pipelineProgressTitle,
} from "./pipeline-progress";

function stepRow(
  nodeId: string,
  step: string,
  status: string,
): PlanNodeStepRow {
  return {
    artifact_id: null,
    attempts: 1,
    created_at: "2026-08-13T00:00:00.000Z",
    created_by: null,
    deleted_at: null,
    error: null,
    finished_at: null,
    id: `${nodeId}-${step}`,
    metadata: {},
    node_id: nodeId,
    organization_id: "org",
    site_id: "site",
    started_at: null,
    status,
    step,
    updated_at: "2026-08-13T00:00:00.000Z",
    updated_by: null,
    version: 1,
  };
}

describe("buildNodePipelineProgress", () => {
  it("omits untouched nodes and keeps missing rows distinct from pending", () => {
    const progress = buildNodePipelineProgress([
      stepRow("started", "p1_keywords", "pending"),
    ]);

    expect(progress.has("untouched")).toBe(false);
    expect(progress.get("started")).toMatchObject({
      doneCount: 0,
      pendingCount: 1,
      neverRunCount: 6,
      filterLabel: "Started",
    });
  });

  it("uses the furthest completed milestone and preserves the done count", () => {
    const progress = buildNodePipelineProgress([
      stepRow("page", "p1_keywords", "done"),
      stepRow("page", "p2_research", "done"),
      stepRow("page", "p3_family", "skipped"),
      stepRow("page", "p6_build", "done"),
    ]).get("page");

    expect(progress).toMatchObject({
      doneCount: 3,
      skippedCount: 1,
      milestone: "p6_build",
      milestoneLabel: "Built",
      filterLabel: "Built",
      tone: "success",
    });
  });

  it("surfaces failures above a completed milestone", () => {
    const progress = buildNodePipelineProgress([
      stepRow("page", "p2_research", "done"),
      stepRow("page", "p4_write", "failed"),
      stepRow("page", "p5_review", "failed"),
    ]).get("page");

    expect(progress).toMatchObject({
      doneCount: 1,
      failedCount: 2,
      milestoneLabel: "Researched",
      filterLabel: "Failed",
      tone: "destructive",
    });
    if (!progress) throw new Error("Expected page pipeline progress");
    expect(pipelineProgressTitle(progress)).toContain("2 failed");
  });

  it("makes running state visible without losing completed progress", () => {
    const progress = buildNodePipelineProgress([
      stepRow("page", "p2_research", "done"),
      stepRow("page", "p6_build", "running"),
    ]).get("page");

    expect(progress).toMatchObject({
      doneCount: 1,
      runningCount: 1,
      filterLabel: "Running",
      tone: "primary",
    });
  });
});
