import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  checkContainedPatrolCandidates,
  checkPatrolCommits,
  isPatrolCommit,
  parsePatrolCommitTrailers,
} from "./delivery-policy";
import {
  appendPatrolRunEvent,
  canonicalPatrolRecordJson,
  createPatrolRunRecord,
  type PatrolRunRecord,
} from "./run-record";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function writeRecord(repo: string, record: PatrolRunRecord): void {
  const path = join(
    repo,
    ".matrx",
    "patrol-runs",
    record.patrolId,
    `${record.runId}.json`,
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, canonicalPatrolRecordJson(record));
}

describe("Pattern Patrol delivery policy", () => {
  it("recognizes only explicit patrol provenance trailers", () => {
    expect(
      isPatrolCommit("fix: ordinary work", [".matrx/patrol-reports/mobile.md"]),
    ).toBe(false);
    expect(
      isPatrolCommit("fix(pattern-patrol): repair", ["features/foo.tsx"]),
    ).toBe(false);
    expect(
      isPatrolCommit("fix: repair\n\nPatrol-Id: P9", ["features/foo.tsx"]),
    ).toBe(true);
    expect(
      isPatrolCommit("wip: preserve mobile repairs", [
        ".matrx/patrol-runs/P3/run-3.json",
        "features/foo.tsx",
      ]),
    ).toBe(true);
    expect(
      isPatrolCommit("docs: refresh projection", [
        ".matrx/patrol-runs/P3/latest.json",
      ]),
    ).toBe(false);
    expect(isPatrolCommit("fix: ordinary work", ["features/foo.tsx"])).toBe(
      false,
    );
  });

  // 2026-09-20 (31a6de8f4d, "release: ship in under a minute…"): the release
  // stopped verifying patrol delivery INSIDE `scripts/release.sh`. Everything
  // that is not the push moved behind it, into ONE parallel runner that starts
  // AFTER the tag is on origin and turns every failure into a finding for the
  // fixer dispatcher — "a check NEVER blocks: the runner exits 0". So patrol
  // delivery is fail-forward by CONSTRUCTION now, not by a `warn` the old
  // pre-push block was careful to use, and this test reads its new home. The
  // policy it guards is unchanged and asserted harder: the check still runs on
  // every release, it can still fail on its own, and it can still never stop a
  // release or rewrite history.
  it("keeps patrol findings loud while the release remains fail-forward", () => {
    const release = readFileSync("scripts/release.sh", "utf8");
    const runner = readFileSync("scripts/checks/run.mjs", "utf8");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    // 1. THE CHECK STILL RUNS ON EVERY RELEASE — as a row in the one runner,
    //    named, with the command that can actually fail.
    expect(runner).toContain(
      "Pattern Patrol delivery records authorize every patrol commit|pnpm --silent patrol:delivery:check",
    );
    expect(pkg.scripts["patrol:delivery:check"]).toBe(
      "tsx scripts/pattern-patrol/check-delivery.ts",
    );
    expect(existsSync("scripts/pattern-patrol/check-delivery.ts")).toBe(true);

    // 2. IT RUNS AFTER THE PUSH, so a finding can never hold a release back.
    const push = release.indexOf('git push "$REMOTE" "${RELEASE_SHA}:refs/heads/$BRANCH"');
    const checks = release.indexOf('node "$SCRIPT_DIR/checks/run.mjs"');
    expect(push).toBeGreaterThan(-1);
    expect(checks).toBeGreaterThan(push);

    // 3. AND THE RUNNER ITSELF NEVER BLOCKS: its only failure mode in the
    //    release is "the runner crashed", which is stated as not affecting the
    //    release.
    expect(release).toContain(
      "The check runner itself crashed — nothing was measured. The release is not affected.",
    );

    // 4. THE OLD BLOCKING SHAPES STAY GONE — neither the pre-push `fail` this
    //    policy was written against, nor any patrol gate back inside the
    //    release script, nor a history rewrite.
    expect(release).not.toContain(
      'fail "Pattern Patrol delivery records are missing independent exact-candidate certification.',
    );
    expect(release).not.toMatch(/patrol/i);
    expect(release).not.toContain("git rebase ");
  });

  it("parses complete certification trailers", () => {
    expect(
      parsePatrolCommitTrailers(
        `fix: repair\n\nPatrol-Id: P9\nPatrol-Run: run-9\nPatrol-Delivery: certified\nPatrol-Candidate: abc123`,
      ),
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

  it("blocks the P3 escaped-ordering shape until the exact candidate is independently certified", () => {
    const root = mkdtempSync(join(tmpdir(), "patrol-delivery-p3-"));
    try {
      git(root, ["init"]);
      git(root, ["config", "user.name", "Patrol Test"]);
      git(root, ["config", "user.email", "patrol@example.com"]);
      git(root, ["commit", "--allow-empty", "-m", "base"]);
      const baseSha = git(root, ["rev-parse", "HEAD"]);
      let record = createPatrolRunRecord({
        patrolId: "P3",
        runId: "2026-08-27T131727Z",
        baseSha,
        createdAt: "2026-08-27T13:20:45.327Z",
        actor: "pattern-patrol-p3-worker",
        summary: "Mobile scan started",
      });
      record = appendPatrolRunEvent(record, {
        state: "fixing",
        at: "2026-08-27T13:21:34.688Z",
        actor: "pattern-patrol-p3-worker",
        summary: "Applied bounded mobile repairs",
      });
      writeRecord(root, record);
      mkdirSync(join(root, "features"), { recursive: true });
      writeFileSync(
        join(root, "features", "touch-target.tsx"),
        "export const fixed = true;\n",
      );
      git(root, ["add", ".matrx", "features/touch-target.tsx"]);
      git(root, ["commit", "-m", "wip: preserve P3 mobile touch repairs"]);
      const candidateSha = git(root, ["rev-parse", "HEAD"]);

      expect(
        checkPatrolCommits({
          repoRoot: root,
          base: baseSha,
          head: candidateSha,
        }),
      ).toContain(
        `${candidateSha}: patrol candidate changed product paths and .matrx/patrol-runs/P3/2026-08-27T131727Z.json but ${candidateSha} has no independent exact-candidate CERTIFIED evidence`,
      );

      record = appendPatrolRunEvent(record, {
        state: "certifying",
        at: "2026-08-27T13:22:34.688Z",
        actor: "pattern-patrol-p3-worker",
        summary: "Independent review started",
      });
      record = appendPatrolRunEvent(record, {
        state: "certified",
        at: "2026-08-27T13:23:34.688Z",
        actor: "p3-certifier",
        summary: "Exact candidate certified",
        certification: {
          verdict: "CERTIFIED",
          certifierTaskId: "p3-certifier",
          candidateSha,
          checks: ["exact diff", "scoped tests"],
        },
      });
      writeRecord(root, record);
      git(root, ["add", ".matrx"]);
      git(root, [
        "commit",
        "-m",
        "chore(pattern-patrol): certify exact P3 candidate",
      ]);
      const certifiedHead = git(root, ["rev-parse", "HEAD"]);

      expect(
        checkPatrolCommits({
          repoRoot: root,
          base: baseSha,
          head: certifiedHead,
        }),
      ).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not treat an explicit older-candidate delivery append as certification for unrelated shared-checkout product edits", () => {
    const root = mkdtempSync(join(tmpdir(), "patrol-delivery-projection-"));
    try {
      git(root, ["init"]);
      git(root, ["config", "user.name", "Patrol Test"]);
      git(root, ["config", "user.email", "patrol@example.com"]);
      git(root, ["commit", "--allow-empty", "-m", "base"]);
      const baseSha = git(root, ["rev-parse", "HEAD"]);
      mkdirSync(join(root, "features"), { recursive: true });
      writeFileSync(join(root, "features", "p7.tsx"), "export const fixed = true;\n");
      git(root, ["add", "features/p7.tsx"]);
      git(root, ["commit", "-m", "fix: remove native dialog"]);
      const p7Candidate = git(root, ["rev-parse", "HEAD"]);

      let record = createPatrolRunRecord({
        patrolId: "P7",
        runId: "run-7",
        baseSha,
        createdAt: "2026-08-29T14:20:00.000Z",
        actor: "p7-worker",
        summary: "P7 repair started",
      });
      record = appendPatrolRunEvent(record, {
        state: "fixing",
        at: "2026-08-29T14:21:00.000Z",
        actor: "p7-worker",
        summary: "Removed native dialog",
      });
      record = appendPatrolRunEvent(record, {
        state: "certifying",
        at: "2026-08-29T14:22:00.000Z",
        actor: "p7-worker",
        summary: "Independent review started",
      });
      record = appendPatrolRunEvent(record, {
        state: "certified",
        at: "2026-08-29T14:23:00.000Z",
        actor: "p7-certifier",
        summary: "Exact P7 candidate certified",
        certification: {
          verdict: "CERTIFIED",
          certifierTaskId: "p7-certifier",
          candidateSha: p7Candidate,
          checks: ["exact diff", "scoped detector"],
        },
      });
      record = appendPatrolRunEvent(record, {
        state: "delivery_queued",
        at: "2026-08-29T14:24:00.000Z",
        actor: "p7-worker",
        summary: "P7 candidate queued",
        delivery: {
          candidateSha: p7Candidate,
          preservedRef: "refs/heads/patrol-runs/P7/run-7",
        },
      });
      writeRecord(root, record);
      git(root, ["add", ".matrx"]);
      git(root, ["commit", "-m", "chore: record P7 certification"]);

      record = appendPatrolRunEvent(record, {
        state: "delivered",
        at: "2026-08-30T14:20:00.000Z",
        actor: "p7-controller",
        summary: "P7 candidate delivered",
        delivery: {
          candidateSha: p7Candidate,
          preservedRef: "refs/heads/patrol-runs/P7/run-7",
          integratedSha: p7Candidate,
          release: "v1.0.0",
        },
      });
      writeRecord(root, record);
      writeFileSync(
        join(root, "features", "unrelated.tsx"),
        "export const unrelated = true;\n",
      );
      git(root, ["add", ".matrx", "features/unrelated.tsx"]);
      git(root, ["commit", "-m", "wip: shared checkout checkpoint"]);
      const head = git(root, ["rev-parse", "HEAD"]);

      expect(
        checkPatrolCommits({ repoRoot: root, base: `${head}^`, head }),
      ).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps a P9-style escaped delivery blocked and truthful until later exact certification", () => {
    const root = mkdtempSync(join(tmpdir(), "patrol-delivery-p9-"));
    try {
      git(root, ["init"]);
      git(root, ["config", "user.name", "Patrol Test"]);
      git(root, ["config", "user.email", "patrol@example.com"]);
      git(root, ["commit", "--allow-empty", "-m", "base"]);
      const baseSha = git(root, ["rev-parse", "HEAD"]);
      mkdirSync(join(root, "features"), { recursive: true });
      writeFileSync(
        join(root, "features", "coming-soon.tsx"),
        "export const fixed = true;\n",
      );
      git(root, ["add", "features/coming-soon.tsx"]);
      git(root, ["commit", "-m", "fix(pattern-patrol): repair P9 promises"]);
      const candidateSha = git(root, ["rev-parse", "HEAD"]);

      let record = createPatrolRunRecord({
        patrolId: "P9",
        runId: "019ff9f6-6062-78f0-a8d2-e96ec520f635",
        baseSha,
        createdAt: "2026-08-29T14:30:00.000Z",
        actor: "p9-worker",
        summary: "Coming Soon repair started",
      });
      record = appendPatrolRunEvent(record, {
        state: "fixing",
        at: "2026-08-29T14:31:00.000Z",
        actor: "p9-worker",
        summary: "Repaired false promises",
      });
      record = appendPatrolRunEvent(record, {
        state: "infrastructure_blocked",
        at: "2026-08-29T14:32:00.000Z",
        actor: "p9-worker",
        summary: "Interaction proof unavailable",
        blocker: { prerequisite: "bounded interaction proof" },
      });
      record = appendPatrolRunEvent(record, {
        state: "escaped_delivery",
        at: "2026-08-29T14:33:00.000Z",
        actor: "delivery-controller",
        summary: "Recorded pre-certification release",
        escape: {
          candidateSha,
          integratedSha: candidateSha,
          release: "v0.4.656",
          reason: "Candidate entered release before independent certification",
        },
      });
      writeRecord(root, record);
      git(root, ["add", ".matrx"]);
      git(root, [
        "commit",
        "-m",
        "chore(pattern-patrol): record P9 escaped delivery",
      ]);
      const escapedHead = git(root, ["rev-parse", "HEAD"]);
      expect(
        checkContainedPatrolCandidates({ repoRoot: root, head: escapedHead }),
      ).toContain(
        `.matrx/patrol-runs/P9/${record.runId}.json: escaped_delivery candidate ${candidateSha} is contained by ${escapedHead} without independent exact-candidate CERTIFIED evidence`,
      );

      record = appendPatrolRunEvent(record, {
        state: "certifying",
        at: "2026-08-29T14:34:00.000Z",
        actor: "p9-certifier",
        summary: "Independent exact-candidate review started",
      });
      record = appendPatrolRunEvent(record, {
        state: "certified",
        at: "2026-08-29T14:35:00.000Z",
        actor: "p9-certifier",
        summary: "Exact escaped candidate certified",
        certification: {
          verdict: "CERTIFIED",
          certifierTaskId: "p9-certifier",
          candidateSha,
          checks: ["interaction proof", "scoped gates"],
        },
      });
      writeRecord(root, record);
      git(root, ["add", ".matrx"]);
      git(root, [
        "commit",
        "-m",
        "chore(pattern-patrol): certify escaped P9 candidate",
      ]);
      expect(
        checkContainedPatrolCandidates({
          repoRoot: root,
          head: git(root, ["rev-parse", "HEAD"]),
        }),
      ).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
