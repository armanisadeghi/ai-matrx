import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  canonicalPatrolRecordJson,
  currentPatrolRunState,
  type PatrolRunRecord,
  validatePatrolRunRecord,
} from "./run-record";

function git(repoRoot: string, args: string[], options?: { input?: string; env?: NodeJS.ProcessEnv }): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    input: options?.input,
    env: options?.env,
  }).trim();
}

function safeRef(ref: string): void {
  if (!/^refs\/heads\/patrol-runs\/[A-Za-z0-9._/-]+$/.test(ref) || ref.includes("..")) {
    throw new Error(`patrol authority ref must be under refs/heads/patrol-runs/: ${ref}`);
  }
}

function remoteRefSha(repoRoot: string, ref: string): string | undefined {
  const output = git(repoRoot, ["ls-remote", "origin", ref]);
  return output.split(/\s+/)[0] || undefined;
}

function blob(repoRoot: string, contents: string): string {
  return git(repoRoot, ["hash-object", "-w", "--stdin"], { input: contents });
}

function recordPath(record: PatrolRunRecord): string {
  return `.matrx/patrol-runs/${record.patrolId}/${record.runId}.json`;
}

function latestPath(record: PatrolRunRecord): string {
  return `.matrx/patrol-runs/${record.patrolId}/latest.json`;
}

function latestJson(record: PatrolRunRecord): string {
  const event = record.events.at(-1);
  if (!event) throw new Error("run record has no events");
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      patrolId: record.patrolId,
      runId: record.runId,
      state: currentPatrolRunState(record),
      updatedAt: event.at,
      summary: event.summary,
      source: `${record.runId}.json`,
      eventHash: event.eventHash,
    },
    null,
    2,
  )}\n`;
}

export function publishPatrolRunAuthority(input: {
  repoRoot: string;
  record: PatrolRunRecord;
  candidateSha: string;
  authorityRef: string;
  actor: string;
}): string {
  const { repoRoot, record, candidateSha, authorityRef, actor } = input;
  safeRef(authorityRef);
  const problems = validatePatrolRunRecord(record);
  if (problems.length > 0) throw new Error(`refusing to publish invalid run: ${problems.join("; ")}`);
  git(repoRoot, ["cat-file", "-e", `${candidateSha}^{commit}`]);

  const priorAuthority = remoteRefSha(repoRoot, authorityRef);
  if (priorAuthority) {
    try {
      git(repoRoot, ["merge-base", "--is-ancestor", candidateSha, priorAuthority]);
    } catch {
      throw new Error(`authority ref ${authorityRef} does not preserve candidate ${candidateSha}`);
    }
  }

  const temp = mkdtempSync(join(tmpdir(), "matrx-patrol-authority-"));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(temp, "index") };
    git(repoRoot, ["read-tree", candidateSha], { env });
    for (const [path, contents] of [
      [recordPath(record), canonicalPatrolRecordJson(record)],
      [latestPath(record), latestJson(record)],
    ] as const) {
      const object = blob(repoRoot, contents);
      git(repoRoot, ["update-index", "--add", "--cacheinfo", "100644", object, path], { env });
    }
    const tree = git(repoRoot, ["write-tree"], { env });
    const parent = priorAuthority ?? candidateSha;
    const commit = git(repoRoot, [
      "commit-tree",
      tree,
      "-p",
      parent,
      "-m",
      `patrol run authority: ${record.patrolId}/${record.runId} ${currentPatrolRunState(record)}`,
      "-m",
      `Actor: ${actor}`,
    ]);
    git(repoRoot, ["push", "origin", `${commit}:${authorityRef}`]);
    git(repoRoot, ["merge-base", "--is-ancestor", candidateSha, commit]);
    const published = git(repoRoot, ["show", `${commit}:${recordPath(record)}`]);
    if (`${published}\n` !== canonicalPatrolRecordJson(record)) {
      throw new Error(`published authority record does not match ${record.patrolId}/${record.runId}`);
    }
    return commit;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
