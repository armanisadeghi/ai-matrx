#!/usr/bin/env node
/**
 * page:checks — run the page-pass checks and show ONLY the findings in your
 * files, so "is my page clean" is an answer, not guesswork.
 *
 * Most repo checks scan the whole tree and print hundreds of unrelated
 * findings (other agents' debt). This runs each one, keeps the output lines
 * that name one of your paths, and prints one verdict per check:
 *   CLEAN      — ran, nothing in your files
 *   FINDINGS   — lines below name your files
 *   ERROR      — the check itself could not run (its last lines are shown)
 *
 *   pnpm page:checks <file-or-dir> [more…]           # the default set
 *   pnpm page:checks --only check:dead-ends,check:ui-primitives <paths…>
 *   pnpm page:checks --changed                        # your uncommitted + last-commit files
 *
 * A check exiting non-zero with no line naming your files counts as CLEAN for
 * you (the red belongs to someone else); say so in your report.
 */
import { spawn, execFileSync } from "node:child_process";

const DEFAULT_CHECKS = [
  "check:surface-drift",
  "check:surface-routes",
  "check:context-menu",
  "check:menu-naming",
  "check:agent-disclosure",
  "check:page-headers",
  "check:phone-layout",
  "check:ui-primitives",
  "check:one-table-law",
  "check:archived-items-law",
  "check:picker-add",
  "check:canonical-pickers",
  "check:browser-dialogs",
  "check:blocking-dialogs",
  "check:reserved-icons",
  "check:new-tab-icon",
  "check:static-loader",
  "check:theme-color-literals",
  "check:route-metadata:strict",
  "check:favicon-letters",
  "check:dead-ends",
  "check:unwired",
  "check:copy-everywhere",
  "check:client-server-only",
];

const argv = process.argv.slice(2);
let checks = DEFAULT_CHECKS;
const paths = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--only") {
    checks = argv[i + 1].split(",").map((c) => c.trim()).filter(Boolean);
    i += 1;
  } else if (argv[i] === "--changed") {
    const out = execFileSync("git", ["diff", "--name-only", "HEAD~1"], { encoding: "utf8" }) +
      execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });
    paths.push(...out.split("\n").filter(Boolean));
  } else paths.push(argv[i]);
}
if (!paths.length) {
  console.error("pass your files or directories (or --changed)");
  process.exit(2);
}
const needles = [...new Set(paths.map((p) => p.replace(/^\.\//, "").replace(/\/$/, "")))];

const pkg = JSON.parse(execFileSync("cat", ["package.json"], { encoding: "utf8" }));
function run(check) {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["-s", check], { stdio: ["ignore", "pipe", "pipe"] });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 600000);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, text });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: 1, text: String(error), error });
    });
  });
}

// Six at a time: the checks are independent, and serially they take ~8 minutes.
const results = new Map();
const queue = checks.filter((c) => pkg.scripts?.[c]);
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const check = queue.shift();
      results.set(check, await run(check));
    }
  }),
);

let anyFindings = false;
for (const check of checks) {
  if (!pkg.scripts?.[check]) {
    console.log(`SKIP      ${check} (no such script)`);
    continue;
  }
  const r = results.get(check);
  const text = r.text;
  const mine = text.split("\n").filter((line) => needles.some((n) => line.includes(n)));
  if (mine.length) {
    anyFindings = true;
    console.log(`FINDINGS  ${check}`);
    for (const line of mine.slice(0, 20)) console.log(`          ${line.trim().slice(0, 300)}`);
    if (mine.length > 20) console.log(`          … ${mine.length - 20} more`);
  } else if (r.error || (r.status !== 0 && /Cannot find module|ENOENT|SyntaxError|ERR_/.test(text))) {
    console.log(`ERROR     ${check} — could not run:`);
    for (const line of text.trim().split("\n").slice(-3)) console.log(`          ${line.slice(0, 300)}`);
  } else {
    console.log(`CLEAN     ${check}${r.status !== 0 ? " (red elsewhere, not in your files)" : ""}`);
  }
}
process.exit(anyFindings ? 1 : 0);
