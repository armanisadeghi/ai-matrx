#!/usr/bin/env node
/**
 * validate — Single command to run every health check, fastest first.
 *
 *   pnpm validate              all steps against the LIVE backend
 *   pnpm validate --local      sync-types against the LOCAL backend (http://localhost:8000)
 *   pnpm validate --no-sync    skip the network sync-types steps (db-types + Python api-types)
 *   pnpm validate --fast       skip sync-types AND type-check (run just the fast static checks + lint)
 *   pnpm validate --keep-going don't stop on the first failure — run every step and report the full report at the end
 *
 * Order (fastest first, so problems surface quickly):
 *
 *   1. check:registry          ~1s   window-panels registry integrity
 *   2. check:overlay-keys      ~1s   overlay dispatch ↔ defaultData ↔ component-props alignment
 *   3. check:surface-drift     ~1s   surface manifest invariants
 *   4. check:public-imports    ~1s   no-op legacy guard
 *   5. check:doctrine          ~1s   doctrine red flags (advisory, never fails the run)
 *   6. sync-types step 1       ~5s   Supabase database types (pnpm db-types)        [skipped: --fast / --no-sync]
 *   7. sync-types step 2       ~3s   Python API types (paths/schemas)               [skipped: --fast / --no-sync]
 *   8. lint                    ~30s  eslint . (advisory — large pre-existing baseline)
 *   9. type-check              ~60s+ tsc --noEmit                                    [skipped: --fast]
 *
 * The two sync-types network steps are kept in their original order (db first,
 * then api) because the Python OpenAPI types reference Supabase types in some
 * places. Step 9 must always run last — it depends on every step above.
 *
 * Exit codes:
 *   0   every step passed (doctrine red flags reported but don't fail)
 *   1   one or more steps failed
 */

import { execSync, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const useLocal = args.includes("--local");
const noSync = args.includes("--no-sync");
const fastMode = args.includes("--fast");
const keepGoing = args.includes("--keep-going");

// ANSI colours — auto-disabled when piped.
const TTY = process.stdout.isTTY;
const C = {
  reset: TTY ? "\x1b[0m" : "",
  bold: TTY ? "\x1b[1m" : "",
  dim: TTY ? "\x1b[2m" : "",
  red: TTY ? "\x1b[31m" : "",
  green: TTY ? "\x1b[32m" : "",
  yellow: TTY ? "\x1b[33m" : "",
  cyan: TTY ? "\x1b[36m" : "",
};

function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const steps = [];

/**
 * Register a step. `command` is run with the project root as cwd and stdio
 * inherited so the user sees real-time output. `skip` is a function returning
 * a string reason when the step should be skipped (or false to run).
 *
 * `advisory: true` means the step prints output but never causes the run to
 * fail (e.g. doctrine).
 */
function step({ id, title, command, skip, advisory = false }) {
  steps.push({ id, title, command, skip, advisory });
}

// ── Fast static checks (<2s each) ──────────────────────────────────────────
step({
  id: "registry",
  title: "Window-panels registry integrity",
  command: ["pnpm", "check:registry"],
});
step({
  id: "overlay-keys",
  title: "Overlay key alignment (dispatch ↔ defaultData ↔ props)",
  command: ["pnpm", "check:overlay-keys"],
});
step({
  id: "surface-drift",
  title: "Surface manifest invariants",
  command: ["pnpm", "check:surface-drift"],
});
step({
  id: "public-imports",
  title: "Public import guard",
  command: ["pnpm", "check:public-imports"],
});
step({
  id: "doctrine",
  title: "Doctrine red flags (advisory)",
  command: ["pnpm", "check:doctrine"],
  advisory: true,
});

// ── Network sync-types ─────────────────────────────────────────────────────
step({
  id: "db-types",
  title: "Supabase database types (pnpm db-types)",
  command: ["pnpm", "db-types"],
  skip: () =>
    fastMode
      ? "--fast"
      : noSync
        ? "--no-sync"
        : false,
});
step({
  id: "api-types",
  title: `Python API types (${useLocal ? "local backend" : "live backend"})`,
  command: [
    "node",
    resolve(PROJECT_ROOT, "scripts/sync-types.mjs"),
    "--fast",
    ...(useLocal ? ["--local"] : []),
  ],
  // sync-types.mjs --fast = step 2 only (Python api types, no db-types, no
  // type-check). We orchestrate db-types and type-check separately so they
  // can be skipped independently.
  skip: () =>
    fastMode
      ? "--fast"
      : noSync
        ? "--no-sync"
        : false,
});

// ── Slow checks ───────────────────────────────────────────────────────────
step({
  id: "lint",
  title: "ESLint (advisory — repo has a large pre-existing baseline)",
  command: ["pnpm", "lint"],
  advisory: true,
});
step({
  id: "type-check",
  title: "TypeScript type-check",
  command: ["pnpm", "type-check"],
  skip: () => (fastMode ? "--fast" : false),
});

// ── Run ────────────────────────────────────────────────────────────────────

console.log(
  `\n${C.bold}${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`,
);
console.log(`${C.bold}  pnpm validate${C.reset}`);
const flags = [
  useLocal && "--local",
  noSync && "--no-sync",
  fastMode && "--fast",
  keepGoing && "--keep-going",
]
  .filter(Boolean)
  .join(" ");
console.log(`  ${C.dim}flags:${C.reset} ${flags || "(none — full live run)"}`);
console.log(`  ${C.dim}steps:${C.reset} ${steps.length}`);
console.log(
  `${C.bold}${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`,
);

const results = [];
const totalStart = Date.now();

for (const [idx, s] of steps.entries()) {
  const banner = `${C.bold}[${idx + 1}/${steps.length}] ${s.title}${C.reset}`;
  console.log(banner);
  console.log(`${C.dim}${"─".repeat(60)}${C.reset}`);

  const skipReason = s.skip ? s.skip() : false;
  if (skipReason) {
    console.log(`${C.yellow}⊘ skipped (${skipReason})${C.reset}\n`);
    results.push({ ...s, status: "skipped", duration: 0, skipReason });
    continue;
  }

  const start = Date.now();
  const result = spawnSync(s.command[0], s.command.slice(1), {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });
  const duration = Date.now() - start;
  const passed = result.status === 0;

  if (passed) {
    console.log(
      `\n${C.green}✓ ${s.title} (${fmtMs(duration)})${C.reset}\n`,
    );
    results.push({ ...s, status: "pass", duration });
  } else if (s.advisory) {
    console.log(
      `\n${C.yellow}⚠ ${s.title} reported issues (advisory — not failing the run, ${fmtMs(duration)})${C.reset}\n`,
    );
    results.push({ ...s, status: "advisory", duration });
  } else {
    console.log(
      `\n${C.red}✗ ${s.title} failed (${fmtMs(duration)})${C.reset}\n`,
    );
    results.push({ ...s, status: "fail", duration });
    if (!keepGoing) {
      printSummary(results, Date.now() - totalStart, "early-exit");
      process.exit(1);
    }
  }
}

printSummary(results, Date.now() - totalStart, "complete");
const hasFail = results.some((r) => r.status === "fail");
process.exit(hasFail ? 1 : 0);

// ── Summary ────────────────────────────────────────────────────────────────

function printSummary(results, totalMs, mode) {
  console.log(
    `${C.bold}${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`,
  );
  console.log(`${C.bold}  Summary${C.reset}  (${fmtMs(totalMs)} total)`);
  console.log(
    `${C.bold}${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`,
  );
  for (const r of results) {
    const icon =
      r.status === "pass"
        ? `${C.green}✓${C.reset}`
        : r.status === "fail"
          ? `${C.red}✗${C.reset}`
          : r.status === "advisory"
            ? `${C.yellow}⚠${C.reset}`
            : `${C.dim}⊘${C.reset}`;
    const dur =
      r.status === "skipped"
        ? `${C.dim}(skipped: ${r.skipReason})${C.reset}`
        : `${C.dim}${fmtMs(r.duration)}${C.reset}`;
    console.log(`  ${icon} ${r.title.padEnd(54)} ${dur}`);
  }
  const failed = results.filter((r) => r.status === "fail");
  if (failed.length > 0) {
    console.log(
      `\n${C.red}${C.bold}  ${failed.length} step(s) failed${C.reset}`,
    );
    if (mode === "early-exit") {
      console.log(
        `${C.dim}  Tip: re-run with --keep-going to see what else would fail.${C.reset}`,
      );
    }
  } else {
    console.log(`\n${C.green}${C.bold}  All checks passed.${C.reset}`);
  }
  console.log();
}
