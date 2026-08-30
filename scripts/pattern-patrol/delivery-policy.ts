import { execFileSync, spawnSync } from "node:child_process";
import {
  canonicalPatrolRecordJson,
  type PatrolRunRecord,
  validatePatrolRunRecord,
} from "./run-record";

export interface PatrolCommitTrailers {
  patrolId: string;
  runId: string;
  delivery: "certified" | "none";
  candidateSha?: string;
}

export function parsePatrolCommitTrailers(
  message: string,
): PatrolCommitTrailers | undefined {
  const value = (name: string) =>
    message.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, "im"))?.[1]?.trim();
  const patrolId = value("Patrol-Id");
  const runId = value("Patrol-Run");
  const delivery = value("Patrol-Delivery");
  const candidateSha = value("Patrol-Candidate");
  if (!patrolId && !runId && !delivery && !candidateSha) return undefined;
  if (
    !patrolId ||
    !runId ||
    (delivery !== "certified" && delivery !== "none")
  ) {
    throw new Error(
      "patrol commit trailers require Patrol-Id, Patrol-Run, and Patrol-Delivery: certified|none",
    );
  }
  if (delivery === "certified" && !candidateSha) {
    throw new Error("certified patrol delivery requires Patrol-Candidate");
  }
  return { patrolId, runId, delivery, candidateSha };
}

export function isPatrolCommit(
  message: string,
  paths: readonly string[],
): boolean {
  return (
    /^Patrol-(?:Id|Run|Delivery|Candidate):/im.test(message) ||
    paths.some(
      (path) =>
        path.startsWith(".matrx/patrol-runs/") &&
        path.endsWith(".json") &&
        !path.endsWith("/latest.json"),
    )
  );
}

function recordPath(patrolId: string, runId: string): string {
  return `.matrx/patrol-runs/${patrolId}/${runId}.json`;
}

function permanentRecordIdentity(
  path: string,
): { patrolId: string; runId: string } | undefined {
  const match = /^\.matrx\/patrol-runs\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match || match[2] === "latest") return undefined;
  return { patrolId: match[1], runId: match[2] };
}

function explicitCandidateShas(event: PatrolRunRecord["events"][number]): string[] {
  return [
    event.certification?.candidateSha,
    event.blocker?.preservedSha,
    event.delivery?.candidateSha,
    event.escape?.candidateSha,
    event.reconciliation?.candidateSha,
  ].filter((candidateSha): candidateSha is string => Boolean(candidateSha));
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
    return JSON.parse(
      git(repoRoot, ["show", `${recordRef}:${path}`]),
    ) as PatrolRunRecord;
  } catch {
    throw new Error(`missing permanent run record in ${recordRef}: ${path}`);
  }
}

function deterministicAuthorityRef(patrolId: string, runId: string): string {
  return `refs/heads/patrol-runs/${patrolId}/${runId}`;
}

function loadRemoteAuthority(input: {
  repoRoot: string;
  patrolId: string;
  runId: string;
  candidateSha: string;
}): { ref: string; record: PatrolRunRecord } {
  const { repoRoot, patrolId, runId, candidateSha } = input;
  const ref = deterministicAuthorityRef(patrolId, runId);
  git(repoRoot, ["fetch", "--no-tags", "origin", ref]);
  const remoteSha = git(repoRoot, ["ls-remote", "origin", ref]).split(/\s+/)[0];
  if (!remoteSha) throw new Error(`missing remote run authority: ${ref}`);
  try {
    git(repoRoot, ["merge-base", "--is-ancestor", candidateSha, remoteSha]);
  } catch {
    throw new Error(
      `remote authority ${ref} does not preserve candidate ${candidateSha}`,
    );
  }
  return { ref, record: loadRecordAtRef(repoRoot, remoteSha, patrolId, runId) };
}

function recordAppendProblems(
  repoRoot: string,
  commitSha: string,
  paths: readonly string[],
): string[] {
  const problems: string[] = [];
  const recordPaths = paths.filter(
    (path) =>
      path.startsWith(".matrx/patrol-runs/") &&
      path.endsWith(".json") &&
      !path.endsWith("/latest.json"),
  );
  for (const path of recordPaths) {
    let current: PatrolRunRecord;
    try {
      current = JSON.parse(
        git(repoRoot, ["show", `${commitSha}:${path}`]),
      ) as PatrolRunRecord;
    } catch {
      problems.push(
        `${path}: permanent run records may not be deleted or made unreadable`,
      );
      continue;
    }
    const validation = validatePatrolRunRecord(current);
    problems.push(...validation.map((problem) => `${path}: ${problem}`));
    let parent: PatrolRunRecord | undefined;
    try {
      parent = JSON.parse(
        git(repoRoot, ["show", `${commitSha}^:${path}`]),
      ) as PatrolRunRecord;
    } catch {
      parent = undefined;
    }
    if (!parent) continue;
    if (
      parent.patrolId !== current.patrolId ||
      parent.runId !== current.runId
    ) {
      problems.push(`${path}: permanent run identity changed`);
      continue;
    }
    if (parent.events.length > current.events.length) {
      problems.push(`${path}: permanent run history was truncated`);
      continue;
    }
    const prefixChanged = parent.events.some(
      (event, index) =>
        JSON.stringify(event) !== JSON.stringify(current.events[index]),
    );
    if (prefixChanged)
      problems.push(
        `${path}: permanent run history was rewritten instead of appended`,
      );
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
    record = loadRecordAtRef(
      repoRoot,
      recordRef,
      trailers.patrolId,
      trailers.runId,
    );
  } catch (error) {
    return [(error as Error).message];
  }
  problems.push(...validatePatrolRunRecord(record));
  if (
    record.patrolId !== trailers.patrolId ||
    record.runId !== trailers.runId
  ) {
    problems.push(
      "commit trailers do not match the permanent run record identity",
    );
  }

  if (trailers.delivery === "none") {
    const productPaths = paths.filter(
      (changedPath) => !changedPath.startsWith(".matrx/"),
    );
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
  let authority: { ref: string; record: PatrolRunRecord } | undefined;
  try {
    authority = loadRemoteAuthority({
      repoRoot,
      patrolId: trailers.patrolId,
      runId: trailers.runId,
      candidateSha,
    });
  } catch (error) {
    problems.push((error as Error).message);
  }
  if (
    authority &&
    canonicalPatrolRecordJson(authority.record) !==
      canonicalPatrolRecordJson(record)
  ) {
    problems.push(
      `release record does not exactly match remote authority ${authority.ref}`,
    );
  }
  const certification = [...record.events]
    .reverse()
    .find(
      (event) =>
        event.state === "certified" &&
        event.certification?.candidateSha === candidateSha,
    );
  if (!certification)
    problems.push(`candidate ${candidateSha} has no CERTIFIED event`);
  const latestDelivery = [...record.events]
    .reverse()
    .find(
      (event) =>
        ["delivery_queued", "delivered"].includes(event.state) &&
        event.delivery?.candidateSha === candidateSha,
    );
  if (!latestDelivery)
    problems.push(`candidate ${candidateSha} is not in the delivery queue`);
  const latest = record.events.at(-1);
  if (
    !latest ||
    !["delivery_queued", "delivered", "closed", "reconciled"].includes(
      latest.state,
    )
  ) {
    problems.push(
      `run is ${latest?.state ?? "empty"}; latest state must be delivery_queued, delivered, closed, or reconciled`,
    );
  }
  if (
    ["closed", "reconciled"].includes(latest?.state ?? "") &&
    latestDelivery?.state !== "delivered"
  ) {
    problems.push(`${latest?.state} run has no prior delivered state`);
  }
  if (latestDelivery?.delivery?.candidateSha !== candidateSha) {
    problems.push(
      `latest delivery event does not name exact candidate ${candidateSha}`,
    );
  }
  if (
    latestDelivery?.delivery?.preservedRef !==
    deterministicAuthorityRef(trailers.patrolId, trailers.runId)
  ) {
    problems.push(
      "latest delivery event does not name the deterministic remote authority ref",
    );
  }
  const productPaths = paths.filter(
    (changedPath) => !changedPath.startsWith(".matrx/"),
  );
  if (productPaths.length > 0 && commitSha !== candidateSha) {
    problems.push(
      `product-changing commit ${commitSha} is not the exact certified candidate ${candidateSha}`,
    );
  }
  const ancestry = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", candidateSha, commitSha],
    {
      cwd: repoRoot,
    },
  );
  if (ancestry.status !== 0) {
    problems.push(
      `certified candidate ${candidateSha} is not contained by commit ${commitSha}`,
    );
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
    const paths = git(repoRoot, [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      commitSha,
    ])
      .split("\n")
      .filter(Boolean);
    const productPaths = paths.filter((path) => !path.startsWith(".matrx/"));
    if (productPaths.length > 0) {
      for (const path of paths) {
        const identity = permanentRecordIdentity(path);
        if (!identity) continue;
        let candidateRecord: PatrolRunRecord;
        let releaseRecord: PatrolRunRecord;
        try {
          candidateRecord = loadRecordAtRef(
            repoRoot,
            commitSha,
            identity.patrolId,
            identity.runId,
          );
          releaseRecord = loadRecordAtRef(
            repoRoot,
            head,
            identity.patrolId,
            identity.runId,
          );
        } catch (error) {
          problems.push(`${commitSha}: ${(error as Error).message}`);
          continue;
        }
        const candidateProblems = validatePatrolRunRecord(candidateRecord);
        const releaseProblems = validatePatrolRunRecord(releaseRecord);
        problems.push(
          ...candidateProblems.map(
            (problem) => `${commitSha}: ${path}: ${problem}`,
          ),
          ...releaseProblems.map(
            (problem) => `${commitSha}: ${path} at ${head}: ${problem}`,
          ),
        );
        if (candidateProblems.length > 0 || releaseProblems.length > 0)
          continue;
        let parentEventCount = 0;
        try {
          const parentRecord = loadRecordAtRef(
            repoRoot,
            `${commitSha}^`,
            identity.patrolId,
            identity.runId,
          );
          parentEventCount = parentRecord.events.length;
        } catch {
          // A new record has no parent history, so every event belongs to this commit.
        }
        const explicitCandidates = candidateRecord.events
          .slice(parentEventCount)
          .flatMap(explicitCandidateShas);
        if (
          explicitCandidates.length > 0 &&
          !explicitCandidates.includes(commitSha)
        ) {
          // Shared-checkout commits can contain an unrelated product edit and a
          // delivery projection for an older exact candidate. The explicit SHA
          // owns that record append; do not misattribute it to this commit.
          continue;
        }
        const certification = releaseRecord.events.find(
          (event) =>
            event.state === "certified" &&
            event.certification?.candidateSha === commitSha,
        );
        if (!certification) {
          problems.push(
            `${commitSha}: patrol candidate changed product paths and ${path} but ${head} has no independent exact-candidate CERTIFIED evidence`,
          );
        }
      }
    }
    if (!isPatrolCommit(message, paths)) continue;
    let trailers: PatrolCommitTrailers | undefined;
    try {
      trailers = parsePatrolCommitTrailers(message);
    } catch (error) {
      problems.push(`${commitSha}: ${(error as Error).message}`);
      continue;
    }
    if (!trailers) {
      problems.push(
        ...recordAppendProblems(repoRoot, commitSha, paths).map(
          (problem) => `${commitSha}: ${problem}`,
        ),
      );
      continue;
    }
    problems.push(
      ...authorizePatrolCommit({
        repoRoot,
        commitSha,
        recordRef: head,
        paths,
        trailers,
      }).map((problem) => `${commitSha}: ${problem}`),
    );
  }
  return problems;
}

export function checkContainedPatrolCandidates(input: {
  repoRoot: string;
  head: string;
}): string[] {
  const { repoRoot, head } = input;
  const paths = git(repoRoot, [
    "ls-tree",
    "-r",
    "--name-only",
    head,
    "--",
    ".matrx/patrol-runs",
  ])
    .split("\n")
    .filter((path) => path.endsWith(".json") && !path.endsWith("/latest.json"));
  const problems: string[] = [];
  for (const path of paths) {
    let record: PatrolRunRecord;
    try {
      record = JSON.parse(
        git(repoRoot, ["show", `${head}:${path}`]),
      ) as PatrolRunRecord;
    } catch (error) {
      problems.push(
        `${path}: unreadable permanent record: ${(error as Error).message}`,
      );
      continue;
    }
    const validation = validatePatrolRunRecord(record);
    problems.push(...validation.map((problem) => `${path}: ${problem}`));
    if (validation.length > 0) continue;
    const candidates = record.events.flatMap<{
      candidateSha: string;
      state: "infrastructure_blocked" | "escaped_delivery";
    }>((event) => {
      if (
        event.state === "infrastructure_blocked" &&
        event.blocker?.preservedSha
      ) {
        return [
          { candidateSha: event.blocker.preservedSha, state: event.state },
        ];
      }
      if (event.state === "escaped_delivery" && event.escape?.candidateSha) {
        return [
          { candidateSha: event.escape.candidateSha, state: event.state },
        ];
      }
      return [];
    });
    for (const { candidateSha, state } of candidates) {
      const contained =
        spawnSync("git", ["merge-base", "--is-ancestor", candidateSha, head], {
          cwd: repoRoot,
        }).status === 0;
      if (!contained) continue;
      const reconciled = record.events.some((event) => {
        if (event.state !== "reconciled") return false;
        const reconciliation = event.reconciliation;
        return (
          reconciliation?.candidateSha === candidateSha &&
          reconciliation.outcome === "exact_candidate_rejected"
        );
      });
      if (reconciled) continue;
      const certification = record.events.find(
        (event) =>
          event.state === "certified" &&
          event.certification?.candidateSha === candidateSha,
      );
      if (!certification) {
        problems.push(
          `${path}: ${state} candidate ${candidateSha} is contained by ${head} without independent exact-candidate CERTIFIED evidence`,
        );
      }
    }
  }
  return problems;
}
