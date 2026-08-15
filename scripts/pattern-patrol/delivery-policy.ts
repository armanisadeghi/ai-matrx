import { execFileSync, spawnSync } from "node:child_process";
import { type PatrolRunRecord, validatePatrolRunRecord } from "./run-record";

export interface PatrolCommitTrailers {
  patrolId: string;
  runId: string;
  delivery: "certified" | "none";
  candidateSha?: string;
}

export function parsePatrolCommitTrailers(message: string): PatrolCommitTrailers | undefined {
  const value = (name: string) =>
    message.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, "im"))?.[1]?.trim();
  const patrolId = value("Patrol-Id");
  const runId = value("Patrol-Run");
  const delivery = value("Patrol-Delivery");
  const candidateSha = value("Patrol-Candidate");
  if (!patrolId && !runId && !delivery && !candidateSha) return undefined;
  if (!patrolId || !runId || (delivery !== "certified" && delivery !== "none")) {
    throw new Error(
      "patrol commit trailers require Patrol-Id, Patrol-Run, and Patrol-Delivery: certified|none",
    );
  }
  if (delivery === "certified" && !candidateSha) {
    throw new Error("certified patrol delivery requires Patrol-Candidate");
  }
  return { patrolId, runId, delivery, candidateSha };
}

export function isPatrolCommit(message: string, paths: readonly string[]): boolean {
  return (
    /pattern[- ]patrol/i.test(message) ||
    paths.some(
      (path) =>
        path.startsWith(".matrx/patrol-reports/") ||
        path.startsWith(".matrx/patrol-runs/"),
    )
  );
}

function recordPath(patrolId: string, runId: string): string {
  return `.matrx/patrol-runs/${patrolId}/${runId}.json`;
}

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function loadRecordAtRef(
  repoRoot: string,
  recordRef: string,
  patrolId: string,
  runId: string,
): PatrolRunRecord {
  const path = recordPath(patrolId, runId);
  try {
    return JSON.parse(git(repoRoot, ["show", `${recordRef}:${path}`])) as PatrolRunRecord;
  } catch {
    throw new Error(`missing permanent run record in ${recordRef}: ${path}`);
  }
}

function recordAppendProblems(repoRoot: string, commitSha: string, paths: readonly string[]): string[] {
  const problems: string[] = [];
  const recordPaths = paths.filter(
    (path) => path.startsWith(".matrx/patrol-runs/") && path.endsWith(".json") && !path.endsWith("/latest.json"),
  );
  for (const path of recordPaths) {
    let current: PatrolRunRecord;
    try {
      current = JSON.parse(git(repoRoot, ["show", `${commitSha}:${path}`])) as PatrolRunRecord;
    } catch {
      problems.push(`${path}: permanent run records may not be deleted or made unreadable`);
      continue;
    }
    const validation = validatePatrolRunRecord(current);
    problems.push(...validation.map((problem) => `${path}: ${problem}`));
    let parent: PatrolRunRecord | undefined;
    try {
      parent = JSON.parse(git(repoRoot, ["show", `${commitSha}^:${path}`])) as PatrolRunRecord;
    } catch {
      parent = undefined;
    }
    if (!parent) continue;
    if (parent.patrolId !== current.patrolId || parent.runId !== current.runId) {
      problems.push(`${path}: permanent run identity changed`);
      continue;
    }
    if (parent.events.length > current.events.length) {
      problems.push(`${path}: permanent run history was truncated`);
      continue;
    }
    const prefixChanged = parent.events.some(
      (event, index) => JSON.stringify(event) !== JSON.stringify(current.events[index]),
    );
    if (prefixChanged) problems.push(`${path}: permanent run history was rewritten instead of appended`);
  }
  return problems;
}

export function authorizePatrolCommit(input: {
  repoRoot: string;
  commitSha: string;
  recordRef: string;
  paths: readonly string[];
  trailers: PatrolCommitTrailers;
}): string[] {
  const { repoRoot, commitSha, recordRef, paths, trailers } = input;
  const problems: string[] = [];
  let record: PatrolRunRecord;
  try {
    record = loadRecordAtRef(repoRoot, recordRef, trailers.patrolId, trailers.runId);
  } catch (error) {
    return [(error as Error).message];
  }
  problems.push(...validatePatrolRunRecord(record));
  if (record.patrolId !== trailers.patrolId || record.runId !== trailers.runId) {
    problems.push("commit trailers do not match the permanent run record identity");
  }

  if (trailers.delivery === "none") {
    const productPaths = paths.filter((changedPath) => !changedPath.startsWith(".matrx/"));
    if (productPaths.length > 0) {
      problems.push(
        `Patrol-Delivery: none changed non-report paths: ${productPaths.slice(0, 5).join(", ")}`,
      );
    }
    problems.push(...recordAppendProblems(repoRoot, commitSha, paths));
    return problems;
  }

  const candidateSha = trailers.candidateSha;
  if (!candidateSha) {
    problems.push("certified patrol delivery is missing Patrol-Candidate");
    return problems;
  }
  const certification = [...record.events]
    .reverse()
    .find(
      (event) =>
        event.state === "certified" && event.certification?.candidateSha === candidateSha,
    );
  if (!certification) problems.push(`candidate ${candidateSha} has no CERTIFIED event`);
  const queued = [...record.events]
    .reverse()
    .find(
      (event) =>
        ["delivery_queued", "delivered"].includes(event.state) &&
        event.delivery?.candidateSha === candidateSha,
    );
  if (!queued) problems.push(`candidate ${candidateSha} is not in the delivery queue`);
  const latest = record.events.at(-1);
  if (!latest || !["delivery_queued", "delivered"].includes(latest.state)) {
    problems.push(`run is ${latest?.state ?? "empty"}; latest state must be delivery_queued or delivered`);
  }
  const productPaths = paths.filter((changedPath) => !changedPath.startsWith(".matrx/"));
  if (productPaths.length > 0 && commitSha !== candidateSha) {
    problems.push(
      `product-changing commit ${commitSha} is not the exact certified candidate ${candidateSha}`,
    );
  }
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", candidateSha, commitSha], {
    cwd: repoRoot,
  });
  if (ancestry.status !== 0) {
    problems.push(`certified candidate ${candidateSha} is not contained by commit ${commitSha}`);
  }
  return problems;
}

export function checkPatrolCommits(input: {
  repoRoot: string;
  base: string;
  head: string;
}): string[] {
  const { repoRoot, base, head } = input;
  const commits = git(repoRoot, ["rev-list", "--reverse", `${base}..${head}`])
    .split("\n")
    .filter(Boolean);
  const problems: string[] = [];
  for (const commitSha of commits) {
    const message = git(repoRoot, ["show", "-s", "--format=%B", commitSha]);
    const paths = git(repoRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", commitSha])
      .split("\n")
      .filter(Boolean);
    if (!isPatrolCommit(message, paths)) continue;
    let trailers: PatrolCommitTrailers | undefined;
    try {
      trailers = parsePatrolCommitTrailers(message);
    } catch (error) {
      problems.push(`${commitSha}: ${(error as Error).message}`);
      continue;
    }
    if (!trailers) {
      problems.push(`${commitSha}: patrol work has no certification/delivery trailers`);
      continue;
    }
    problems.push(
      ...authorizePatrolCommit({ repoRoot, commitSha, recordRef: head, paths, trailers }).map(
        (problem) => `${commitSha}: ${problem}`,
      ),
    );
  }
  return problems;
}

export function checkContainedBlockedCandidates(input: {
  repoRoot: string;
  head: string;
}): string[] {
  const { repoRoot, head } = input;
  const paths = git(repoRoot, ["ls-tree", "-r", "--name-only", head, "--", ".matrx/patrol-runs"])
    .split("\n")
    .filter((path) => path.endsWith(".json") && !path.endsWith("/latest.json"));
  const problems: string[] = [];
  for (const path of paths) {
    let record: PatrolRunRecord;
    try {
      record = JSON.parse(git(repoRoot, ["show", `${head}:${path}`])) as PatrolRunRecord;
    } catch (error) {
      problems.push(`${path}: unreadable permanent record: ${(error as Error).message}`);
      continue;
    }
    const validation = validatePatrolRunRecord(record);
    problems.push(...validation.map((problem) => `${path}: ${problem}`));
    if (validation.length > 0) continue;
    const latest = record.events.at(-1);
    if (!latest || !["infrastructure_blocked", "escaped_delivery"].includes(latest.state)) continue;
    const candidateSha = latest.blocker?.preservedSha ?? latest.escape?.candidateSha;
    if (!candidateSha) continue;
    const contained = spawnSync("git", ["merge-base", "--is-ancestor", candidateSha, head], {
      cwd: repoRoot,
    }).status === 0;
    const delivered = record.events.some(
      (event) => event.state === "delivered" && event.delivery?.candidateSha === candidateSha,
    );
    if (contained && !delivered) {
      problems.push(
        `${path}: ${latest.state} candidate ${candidateSha} is already contained by ${head} without a DELIVERED reconciliation`,
      );
    }
  }
  return problems;
}
