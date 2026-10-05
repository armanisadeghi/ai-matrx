#!/usr/bin/env npx tsx
/**
 * check-surface-executors.ts — EVERY PAGE HAS AN EXECUTOR (Arman, 2026-10-04).
 *
 * The server chooses which tools a page's client runs from
 * `ui.ui_surface.executor_name`; a row with none disables every client-run tool
 * for the whole request. The manifest's REQUIRED `executor` is the source and
 * the manifest sync writes it. This reads the live mirror and FAILS on:
 *   1. a row with a manifest whose executor_name is null;
 *   2. a row with a manifest whose executor_name differs from the manifest;
 *   3. a row with NO manifest, client `matrx-user`, and a null executor_name.
 * Rows with no manifest under any other client and a null executor are listed
 * (they need an owner's decision) but do not fail.
 *
 *   pnpm check:surface-executors              # live mirror (read only)
 *   pnpm check:surface-executors:self-test    # plants nulls in an in-memory copy
 *
 * Exit codes: 0 pass · 1 failures · 2 unexpected error.
 */
import process from "node:process";
import { getAllManifests } from "@/features/surfaces/manifests/registry";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

export interface SurfaceExecutorRow {
  name: string;
  client_name: string;
  executor_name: string | null;
}

export interface ExecutorReport {
  failures: string[];
  /** Manifest-less rows of other clients with no executor — owner decision. */
  undecided: string[];
}

export function judgeSurfaceExecutors(
  manifests: ReadonlyMap<string, string>,
  rows: readonly SurfaceExecutorRow[],
): ExecutorReport {
  const failures: string[] = [];
  const undecided: string[] = [];
  for (const row of rows) {
    const declared = manifests.get(row.name);
    if (declared !== undefined) {
      if (row.executor_name === null)
        failures.push(`${row.name}: executor_name is null (manifest declares ${declared}) — run the manifest sync`);
      else if (row.executor_name !== declared)
        failures.push(`${row.name}: executor_name ${row.executor_name} differs from manifest ${declared} — run the manifest sync`);
      continue;
    }
    if (row.executor_name !== null) continue;
    if (row.client_name === "matrx-user")
      failures.push(`${row.name}: no manifest and no executor_name (client matrx-user) — give it a manifest or an executor`);
    else undecided.push(`${row.name} (client ${row.client_name})`);
  }
  return { failures, undecided };
}

function manifestExecutors(): Map<string, string> {
  return new Map(getAllManifests().map((m) => [m.surfaceName, m.executor] as const));
}

async function readLiveRows(): Promise<SurfaceExecutorRow[]> {
  const env = loadDbEnv();
  if ("missing" in env)
    throw new Error(`UNMEASURED: database connection unavailable; missing ${env.missing.join(", ")}`);
  const client = await connectDirect(env, "check-surface-executors");
  try {
    const result = await client.query<SurfaceExecutorRow>(
      "select name, client_name, executor_name from ui.ui_surface where deleted_at is null and is_active order by name",
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

function print(report: ExecutorReport, total: number): number {
  for (const line of report.undecided) console.log(`UNDECIDED ${line}`);
  for (const line of report.failures) console.error(`FAIL ${line}`);
  if (report.failures.length) {
    console.error(`surface executors: ${report.failures.length} failure(s) across ${total} live surface rows`);
    return 1;
  }
  console.log(`surface executors: PASS — ${total} live surface rows; ${report.undecided.length} manifest-less non-web row(s) undecided`);
  return 0;
}

/**
 * Red → green on a SCRATCH COPY: the live rows are copied in memory, a null is
 * planted on one manifest-backed row and on one manifest-less matrx-user row,
 * and the judge must name both. Nothing on disk or in the database changes.
 */
async function selfTest(): Promise<number> {
  const manifests = manifestExecutors();
  const live = await readLiveRows();
  const copy = live.map((row) => ({ ...row }));
  const backed = copy.find((row) => manifests.has(row.name));
  if (!backed) throw new Error("self-test: no manifest-backed live row to plant on");
  backed.executor_name = null;
  const orphan: SurfaceExecutorRow = {
    name: `matrx-user/executor-self-test-${Date.now().toString(36)}`,
    client_name: "matrx-user",
    executor_name: null,
  };
  copy.push(orphan);
  const differs = copy.find((row) => row !== backed && manifests.has(row.name));
  if (!differs) throw new Error("self-test: need a second manifest-backed row");
  differs.executor_name = "chrome-extension";
  const { failures } = judgeSurfaceExecutors(manifests, copy);
  const caught = [backed.name, orphan.name, differs.name].map((name) =>
    failures.some((line) => line.startsWith(`${name}:`)),
  );
  if (caught.every(Boolean)) {
    console.log(`self-test PASS: planted null (${backed.name}), mismatch (${differs.name}) and orphan null all caught`);
    return 0;
  }
  console.error(`self-test FAIL: caught=${JSON.stringify(caught)}`);
  return 1;
}

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) return selfTest();
  const rows = await readLiveRows();
  return print(judgeSurfaceExecutors(manifestExecutors(), rows), rows.length);
}

main().then(
  (code) => exitAfterDrain(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    exitAfterDrain(2);
  },
);
