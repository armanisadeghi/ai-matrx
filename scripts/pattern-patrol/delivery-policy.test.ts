import { readFileSync } from "node:fs";

import { isPatrolCommit, parsePatrolCommitTrailers } from "./delivery-policy";

describe("Pattern Patrol delivery policy", () => {
  it("recognizes only explicit patrol provenance trailers", () => {
    expect(isPatrolCommit("fix: ordinary work", [".matrx/patrol-reports/mobile.md"])).toBe(false);
    expect(isPatrolCommit("fix(pattern-patrol): repair", ["features/foo.tsx"])).toBe(false);
    expect(isPatrolCommit("fix: repair\n\nPatrol-Id: P9", ["features/foo.tsx"])).toBe(true);
    expect(
      isPatrolCommit("wip: preserve mobile repairs", [
        ".matrx/patrol-runs/P3/run-3.json",
        "features/foo.tsx",
      ]),
    ).toBe(true);
    expect(
      isPatrolCommit("docs: refresh projection", [".matrx/patrol-runs/P3/latest.json"]),
    ).toBe(false);
    expect(isPatrolCommit("fix: ordinary work", ["features/foo.tsx"])).toBe(false);
  });

  it("keeps the release checkpoint fail-closed", () => {
    const release = readFileSync("scripts/release.sh", "utf8");
    expect(release).toContain(
      'fail "Pattern Patrol delivery records are incomplete; release is blocked before any mutation."',
    );
    expect(release).not.toContain("release remains fail-forward");
  });

  it("parses complete certification trailers", () => {
    expect(
      parsePatrolCommitTrailers(`fix: repair\n\nPatrol-Id: P9\nPatrol-Run: run-9\nPatrol-Delivery: certified\nPatrol-Candidate: abc123`),
    ).toEqual({
      patrolId: "P9",
      runId: "run-9",
      delivery: "certified",
      candidateSha: "abc123",
    });
  });

  it("refuses partial trailers", () => {
    expect(() =>
      parsePatrolCommitTrailers("Patrol-Id: P9\nPatrol-Run: run-9"),
    ).toThrow("require Patrol-Id, Patrol-Run");
  });
});
