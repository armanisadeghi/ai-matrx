#!/usr/bin/env tsx
import { resolve } from "node:path";

import { appendPatrolRunEvent, canQueuePatrolDelivery } from "./run-record";
import { publishPatrolRunAuthority } from "./git-authority";
import { loadPatrolRun, patrolRunPath, savePatrolRun, withPatrolRunLease } from "./storage";

function value(name: string, required = true): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const result = index >= 0 ? process.argv[index + 1] : undefined;
  if (required && !result) throw new Error(`missing --${name}`);
  return result;
}

try {
  const repoRoot = resolve(value("repo", false) ?? process.cwd());
  const patrolId = value("patrol")!;
  const runId = value("run")!;
  const candidateSha = value("candidate")!;
  const preservedRef = value("authority-ref")!;
  const actor = value("actor")!;
  const summary = value("summary")!;
  const path = patrolRunPath(repoRoot, patrolId, runId);
  const saved = withPatrolRunLease(repoRoot, patrolId, runId, () => {
    const record = loadPatrolRun(path);
    const verdict = canQueuePatrolDelivery(record, candidateSha);
    if (!verdict.allowed) throw new Error(verdict.reason);
    const next = appendPatrolRunEvent(record, {
      state: "delivery_queued",
      at: new Date().toISOString(),
      actor,
      summary,
      evidence: [`authority-ref:${preservedRef}`],
      delivery: { candidateSha, preservedRef },
    });
    publishPatrolRunAuthority({
      repoRoot,
      record: next,
      candidateSha,
      authorityRef: preservedRef,
      actor,
    });
    return savePatrolRun(repoRoot, next);
  });
  console.log(saved);
  console.log("Commit the candidate and run record with these trailers:");
  console.log(`Patrol-Id: ${patrolId}`);
  console.log(`Patrol-Run: ${runId}`);
  console.log("Patrol-Delivery: certified");
  console.log(`Patrol-Candidate: ${candidateSha}`);
} catch (error) {
  console.error(`PATROL DELIVERY QUEUE REFUSED — ${(error as Error).message}`);
  process.exitCode = 1;
}
