import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { publishPatrolRunAuthority } from "./git-authority";
import { appendPatrolRunEvent, createPatrolRunRecord } from "./run-record";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("Pattern Patrol remote run authority", () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "patrol-authority-test-"));
    repo = join(root, "repo");
    const remote = join(root, "remote.git");
    mkdirSync(repo);
    git(root, ["init", "--bare", remote]);
    git(repo, ["init"]);
    git(repo, ["config", "user.name", "Patrol Test"]);
    git(repo, ["config", "user.email", "patrol@example.com"]);
    git(repo, ["remote", "add", "origin", remote]);
    git(repo, ["commit", "--allow-empty", "-m", "candidate"]);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function blockedRecord(actor = "worker") {
    const created = createPatrolRunRecord({
      patrolId: "P9",
      runId: "run-9",
      baseSha: git(repo, ["rev-parse", "HEAD"]),
      createdAt: "2026-08-14T12:00:00.000Z",
      actor,
      summary: "Started",
    });
    return appendPatrolRunEvent(created, {
      state: "infrastructure_blocked",
      at: "2026-08-14T12:01:00.000Z",
      actor,
      summary: "Preview unavailable",
      blocker: { prerequisite: "stable preview" },
    });
  }

  it("publishes candidate plus record and refuses ref reuse or history replacement", () => {
    const candidateSha = git(repo, ["rev-parse", "HEAD"]);
    const authorityRef = "refs/heads/patrol-runs/P9/run-9";
    const first = blockedRecord();
    const authoritySha = publishPatrolRunAuthority({
      repoRoot: repo,
      record: first,
      candidateSha,
      authorityRef,
      actor: "controller",
    });
    expect(git(repo, ["merge-base", "--is-ancestor", candidateSha, authoritySha])).toBe("");
    expect(
      JSON.parse(git(repo, ["show", `${authoritySha}:.matrx/patrol-runs/P9/run-9.json`])),
    ).toEqual(first);
    expect(() =>
      publishPatrolRunAuthority({
        repoRoot: repo,
        record: first,
        candidateSha,
        authorityRef: "refs/heads/patrol-runs/P9/different-run",
        actor: "controller",
      }),
    ).toThrow("authority ref must be");
    expect(() =>
      publishPatrolRunAuthority({
        repoRoot: repo,
        record: blockedRecord("replacement-worker"),
        candidateSha,
        authorityRef,
        actor: "controller",
      }),
    ).toThrow("not an exact prefix");
  });
});
