#!/usr/bin/env tsx
/**
 * A WEB WORKER MUST NEVER REACH THE MODULE THAT STARTS IT — Turbopack's
 * production compile never finishes when it does.
 *
 * Measured 2026-10-07 on next 16.4.0-canary.39 (the version this repo builds
 * with): a three-file app — `csv.ts` starts `new Worker(new URL("./csv.worker.ts",
 * import.meta.url))`, `csv.worker.ts` imports `csv.ts` — sits at "Creating an
 * optimized production build ..." forever (killed at 300 s; the same app with
 * the worker importing a separate parser module builds in seconds). Static or
 * `import()` edge, it makes no difference. In this repo the shape was
 * `features/secrets/csv-import.ts` → `import("./csv-import-worker-client")` →
 * `new Worker(csv-import.worker.ts)` → `import "./csv-import"` (43002b5d01). Every
 * main / manage / demos build from v0.4.2931 on hit Vercel's 45-minute limit
 * instead of finishing in ~11 minutes; lab, which compiles none of it, kept
 * building.
 *
 * The rule: the graph of first-party modules — static imports, `import()`
 * edges and worker edges alike — may hold no cycle that passes through a worker
 * edge. The fix is always the same: the worker imports only the pure code it
 * runs, and the code that STARTS the worker lives in a module the worker never
 * reaches.
 *
 *   pnpm check:worker-cycles              # scan this checkout
 *   pnpm check:worker-cycles --root <dir> # scan another tree (e.g. a git archive)
 *   pnpm check:worker-cycles:self-test    # proves the guard goes red, then green
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildImportGraph, shortestPath } from "./lib/import-graph";

export function findWorkerCycles(root: string): string[][] {
  const graph = buildImportGraph(root);
  // For every worker edge `starter → workerEntry`, a path workerEntry →…→ starter closes the cycle.
  const cycles: string[][] = [];
  for (const [starter, edges] of graph) {
    for (const edge of edges) {
      if (edge.kind !== "worker") continue;
      const path = edge.to === starter ? [starter] : shortestPath(graph, edge.to, starter);
      if (path) cycles.push([starter, ...path]);
    }
  }
  return cycles;
}

function report(cycles: string[][]): number {
  if (cycles.length === 0) {
    console.log("check:worker-cycles — no worker reaches the module that starts it.");
    return 0;
  }
  console.error(
    `check:worker-cycles — ${cycles.length} worker cycle(s). Turbopack's production compile never finishes on this shape.`,
  );
  for (const cycle of cycles) {
    console.error(`\n  ${cycle[0]}  —new Worker→  ${cycle[1]}`);
    for (const step of cycle.slice(2)) console.error(`    → ${step}`);
  }
  console.error(
    "\nFix: the worker imports only the pure code it runs; move the code that STARTS the worker into a module the worker never reaches.",
  );
  return 1;
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "worker-cycles-"));
  const put = (rel: string, body: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  };
  try {
    put("features/x/parse.ts", 'export const parse = (t: string) => t.split(",");\n');
    put("features/x/x.worker.ts", 'import { parse } from "./parse";\nself.onmessage = (e) => postMessage(parse(e.data));\n');
    put("features/x/client.ts", 'export const start = () => new Worker(new URL("./x.worker.ts", import.meta.url));\n');
    put("features/x/x.ts", 'export { parse } from "./parse";\nexport const run = () => import("./client").then((m) => m.start());\n');
    put("features/y/y.worker.ts", 'import { run } from "@/features/x/x";\nself.onmessage = () => run();\n');
    put("features/y/client.ts", 'export const startY = () => new Worker(new URL("./y.worker.ts", import.meta.url));\n');
    const green = findWorkerCycles(dir);
    if (green.length !== 0) {
      console.error("self-test FAILED: a nested, non-cyclic worker was reported", green);
      return 1;
    }
    // The 43002b5d01 shape: the worker reaches the module that starts it through an import() edge.
    put("features/x/x.worker.ts", 'import { parse } from "./x";\nself.onmessage = (e) => postMessage(parse(e.data));\n');
    const red = findWorkerCycles(dir);
    if (red.length === 0 || !red.some((c) => c[0] === "features/x/client.ts")) {
      console.error("self-test FAILED: the cyclic worker was not reported", red);
      return 1;
    }
    // A type-only import back into the starter is erased and must stay green.
    put("features/x/x.worker.ts", 'import { parse } from "./parse";\nimport type { run } from "./x";\nself.onmessage = (e) => postMessage(parse(e.data));\n');
    if (findWorkerCycles(dir).length !== 0) {
      console.error("self-test FAILED: a type-only import was counted as an edge");
      return 1;
    }
    console.log("check:worker-cycles self-test passed — red on a worker cycle, green on nested and type-only shapes.");
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) process.exit(selfTest());
const rootIdx = args.indexOf("--root");
process.exit(report(findWorkerCycles(rootIdx >= 0 ? args[rootIdx + 1] : process.cwd())));
