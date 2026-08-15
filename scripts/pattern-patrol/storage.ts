import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  canonicalPatrolRecordJson,
  currentPatrolRunState,
  type PatrolRunRecord,
  validatePatrolRunRecord,
} from "./run-record";

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function safeSegment(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`${label} contains unsafe path characters: ${value}`);
  return value;
}

export function patrolRunsRoot(repoRoot = process.cwd()): string {
  return resolve(repoRoot, ".matrx", "patrol-runs");
}

export function patrolRunPath(repoRoot: string, patrolId: string, runId: string): string {
  return join(
    patrolRunsRoot(repoRoot),
    safeSegment(patrolId, "patrol id"),
    `${safeSegment(runId, "run id")}.json`,
  );
}

export function loadPatrolRun(path: string): PatrolRunRecord {
  const record = JSON.parse(readFileSync(path, "utf8")) as PatrolRunRecord;
  const problems = validatePatrolRunRecord(record);
  if (problems.length > 0) throw new Error(`${path}: ${problems.join("; ")}`);
  return record;
}

function eventsArePrefix(existing: PatrolRunRecord, next: PatrolRunRecord): boolean {
  if (existing.events.length > next.events.length) return false;
  return existing.events.every(
    (event, index) => JSON.stringify(event) === JSON.stringify(next.events[index]),
  );
}

function atomicWrite(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temp, contents, { encoding: "utf8", flag: "wx" });
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

export function savePatrolRun(repoRoot: string, record: PatrolRunRecord): string {
  const problems = validatePatrolRunRecord(record);
  if (problems.length > 0) throw new Error(`refusing to save invalid run: ${problems.join("; ")}`);
  const path = patrolRunPath(repoRoot, record.patrolId, record.runId);
  if (existsSync(path)) {
    const existing = loadPatrolRun(path);
    if (!eventsArePrefix(existing, record)) {
      throw new Error(`refusing to rewrite immutable history in ${path}; only append transitions`);
    }
  }
  atomicWrite(path, canonicalPatrolRecordJson(record));
  writeLatestProjection(repoRoot, record);
  return path;
}

export function writeLatestProjection(repoRoot: string, record: PatrolRunRecord): string {
  const latestEvent = record.events.at(-1);
  if (!latestEvent) throw new Error("run record has no events");
  const path = join(patrolRunsRoot(repoRoot), safeSegment(record.patrolId, "patrol id"), "latest.json");
  atomicWrite(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        patrolId: record.patrolId,
        runId: record.runId,
        state: currentPatrolRunState(record),
        updatedAt: latestEvent.at,
        summary: latestEvent.summary,
        source: `${record.runId}.json`,
        eventHash: latestEvent.eventHash,
      },
      null,
      2,
    )}\n`,
  );
  return path;
}
