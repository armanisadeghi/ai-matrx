import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

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

function gitCommonDir(repoRoot: string): string {
  const value = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  return resolve(repoRoot, value);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function lockIsExpired(lockDir: string, acquiredAt?: string): boolean {
  const timestamp = acquiredAt ? Date.parse(acquiredAt) : statSync(lockDir).mtimeMs;
  return !Number.isFinite(timestamp) || Date.now() - timestamp > 15 * 60 * 1000;
}

function pause(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function withPatrolRunLease<T>(
  repoRoot: string,
  patrolId: string,
  runId: string,
  operation: () => T,
): T {
  const lockDir = join(
    gitCommonDir(repoRoot),
    "pattern-patrol-locks",
    safeSegment(patrolId, "patrol id"),
    `${safeSegment(runId, "run id")}.lock`,
  );
  mkdirSync(dirname(lockDir), { recursive: true });
  const ownerPath = join(lockDir, "owner.json");

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      mkdirSync(lockDir);
      writeFileSync(
        ownerPath,
        `${JSON.stringify({ pid: process.pid, repoRoot, acquiredAt: new Date().toISOString() })}\n`,
        "utf8",
      );
      try {
        return operation();
      } finally {
        rmSync(lockDir, { recursive: true, force: true });
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      try {
        const owner = JSON.parse(readFileSync(ownerPath, "utf8")) as {
          pid?: number;
          acquiredAt?: string;
        };
        if (
          (typeof owner.pid === "number" && !processIsAlive(owner.pid)) ||
          lockIsExpired(lockDir, owner.acquiredAt)
        ) {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        // The winner may be between mkdir and writing owner.json. Reclaim only
        // after the lease deadline so a crash in that small window cannot
        // strand the fleet forever.
        if (lockIsExpired(lockDir)) {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      }
      pause(100);
    }
  }
  throw new Error(`timed out waiting for patrol run lease: ${patrolId}/${runId}`);
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
  withPatrolRunLease(repoRoot, record.patrolId, "latest-projection", () =>
    writeLatestProjection(repoRoot, record),
  );
  return path;
}

export function writeLatestProjection(repoRoot: string, record: PatrolRunRecord): string {
  const latestEvent = record.events.at(-1);
  if (!latestEvent) throw new Error("run record has no events");
  const path = join(patrolRunsRoot(repoRoot), safeSegment(record.patrolId, "patrol id"), "latest.json");
  if (existsSync(path)) {
    try {
      const current = JSON.parse(readFileSync(path, "utf8")) as { updatedAt?: string };
      if (
        current.updatedAt &&
        Number.isFinite(Date.parse(current.updatedAt)) &&
        Date.parse(current.updatedAt) > Date.parse(latestEvent.at)
      ) {
        return path;
      }
    } catch {
      // A corrupt projection is replaceable; the immutable run records remain
      // authoritative and the loud verifier will report the repair.
    }
  }
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
