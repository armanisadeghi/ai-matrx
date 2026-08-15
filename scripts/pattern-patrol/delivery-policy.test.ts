import { isPatrolCommit, parsePatrolCommitTrailers } from "./delivery-policy";

describe("Pattern Patrol delivery policy", () => {
  it("recognizes only explicit patrol provenance trailers", () => {
    expect(isPatrolCommit("fix: ordinary work", [".matrx/patrol-reports/mobile.md"])).toBe(false);
    expect(isPatrolCommit("fix(pattern-patrol): repair", ["features/foo.tsx"])).toBe(false);
    expect(isPatrolCommit("fix: repair\n\nPatrol-Id: P9", ["features/foo.tsx"])).toBe(true);
    expect(isPatrolCommit("fix: ordinary work", ["features/foo.tsx"])).toBe(false);
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
