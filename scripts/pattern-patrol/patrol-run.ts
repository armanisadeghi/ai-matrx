#!/usr/bin/env tsx
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  appendPatrolRunEvent,
  createPatrolRunRecord,
  type PatrolRunEventInput,
  type PatrolRunState,
} from "./run-record";
import { loadPatrolRun, patrolRunPath, savePatrolRun } from "./storage";

interface Args {
  command: string;
  values: Map<string, string[]>;
}

function parseArgs(argv: string[]): Args {
  const [command = "", ...rest] = argv;
  const values = new Map<string, string[]>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`expected --name value pairs; got ${rest.slice(index).join(" ")}`);
    }
    const key = flag.slice(2);
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  return { command, values };
}

function one(args: Args, key: string, required = true): string | undefined {
  const values = args.values.get(key) ?? [];
  if (values.length > 1) throw new Error(`--${key} may appear only once`);
  if (required && !values[0]) throw new Error(`missing --${key}`);
  return values[0];
}

function many(args: Args, key: string): string[] {
  return args.values.get(key) ?? [];
}

function now(args: Args): string {
  return one(args, "at", false) ?? new Date().toISOString();
}

function usage(): never {
  throw new Error(
    "usage: patrol-run init|transition|verify --patrol P# --run <task-id> [command options]",
  );
}

function eventFromArgs(args: Args): PatrolRunEventInput {
  const state = one(args, "state") as PatrolRunState;
  const candidateSha = one(args, "candidate", false);
  const certifierTaskId = one(args, "certifier-task", false);
  const preservedRef = one(args, "preserved-ref", false);
  const preservedSha = one(args, "preserved-sha", false);
  const integratedSha = one(args, "integrated-sha", false);
  const release = one(args, "release", false);
  const prerequisite = one(args, "prerequisite", false);
  return {
    state,
    at: now(args),
    actor: one(args, "actor")!,
    summary: one(args, "summary")!,
    evidence: many(args, "evidence"),
    certification:
      state === "certified" && candidateSha && certifierTaskId
        ? {
            verdict: "CERTIFIED",
            candidateSha,
            certifierTaskId,
            checks: many(args, "check"),
          }
        : undefined,
    blocker:
      state === "infrastructure_blocked" && prerequisite
        ? { prerequisite, preservedRef, preservedSha }
        : undefined,
    delivery:
      (state === "delivery_queued" || state === "delivered") && candidateSha
        ? { candidateSha, preservedRef, integratedSha, release }
        : undefined,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === "help") usage();
  const repoRoot = resolve(one(args, "repo", false) ?? process.cwd());
  const patrolId = one(args, "patrol")!;
  const runId = one(args, "run")!;
  const path = patrolRunPath(repoRoot, patrolId, runId);

  if (args.command === "init") {
    if (existsSync(path)) throw new Error(`run already exists: ${path}`);
    const record = createPatrolRunRecord({
      patrolId,
      runId,
      baseSha: one(args, "base")!,
      createdAt: now(args),
      actor: one(args, "actor")!,
      summary: one(args, "summary")!,
      evidence: many(args, "evidence"),
    });
    console.log(savePatrolRun(repoRoot, record));
    return;
  }

  const record = loadPatrolRun(path);
  if (args.command === "verify") {
    console.log(`${path}: valid (${record.events.length} events, ${record.events.at(-1)?.state})`);
    return;
  }
  if (args.command === "transition") {
    const next = appendPatrolRunEvent(record, eventFromArgs(args));
    console.log(savePatrolRun(repoRoot, next));
    return;
  }
  usage();
}

try {
  main();
} catch (error) {
  console.error(`[PATROL RUN ERROR] ${(error as Error).message}`);
  process.exitCode = 1;
}
