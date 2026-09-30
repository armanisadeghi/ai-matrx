// A repo-wide `git ls-files` through node's exec*/spawnSync without `maxBuffer` dies with ENOBUFS
// once the listing passes node's 1 MiB default — and the check that called it judges NOTHING.
// That happened to four checks at once on 2026-09-29, when `git ls-files '*.ts' '*.tsx'` reached
// 1,090,578 bytes (agent-links, agent-submit-content, signout-scope, campaign-entry-points;
// common-docs/projects/checks-run-in-the-app/COORDINATOR.md § Broken checks).
//
// The one lister is scripts/lib/repo-files.ts (512 MiB buffer, -z, symlink-safe). Any other call
// that lists files through git must set maxBuffer itself.
//
// Run: node --test scripts/checks/git-listing-buffer.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CALL = /\b(?:execSync|execFileSync|spawnSync)\s*\(/g;

/** The argument text of the call that opens at `open` (the index of its "("), paren-balanced. */
function callArgs(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

/** Every `exec*Sync`/`spawnSync` call in `source` that runs `git ls-files` with no maxBuffer. */
export function unboundedListings(source) {
  const found = [];
  for (const match of source.matchAll(CALL)) {
    const open = match.index + match[0].length - 1;
    const args = callArgs(source, open);
    if (!/ls-files/.test(args) || /maxBuffer/.test(args)) continue;
    found.push(source.slice(0, match.index).split("\n").length);
  }
  return found;
}

function scriptFiles() {
  const listed = spawnSync("git", ["ls-files", "-z", "--", "scripts"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  assert.equal(listed.status, 0, `git ls-files failed: ${listed.stderr}`);
  return listed.stdout
    .split("\0")
    .filter((f) => /\.(?:ts|mts|cts|mjs|cjs|js)$/.test(f) && !/\.test\.[cm]?[jt]s$/.test(f));
}

test("the detector flags the exact shape that broke four checks, and passes the fixes", () => {
  assert.deepEqual(unboundedListings(`const a = execSync("git ls-files '*.ts' '*.tsx'", { encoding: "utf8" });`), [1]);
  assert.deepEqual(unboundedListings(`x\nexecFileSync("git", ["ls-files", "--", "*.ts"], { cwd: ROOT, encoding: "utf8" })`), [2]);
  assert.deepEqual(unboundedListings(`spawnSync("git", ["ls-files", "-z"], { cwd, maxBuffer: 512 * 1024 * 1024 })`), []);
  assert.deepEqual(unboundedListings(`execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })`), []);
});

test("no script lists files through git with node's 1 MiB default buffer", () => {
  const offenders = [];
  for (const file of scriptFiles()) {
    let source;
    try {
      source = readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue; // deleted in the working tree
    }
    for (const line of unboundedListings(source)) offenders.push(`${file}:${line}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `git ls-files with no maxBuffer (use repoFiles() from scripts/lib/repo-files.ts, or set maxBuffer):\n  ${offenders.join("\n  ")}`,
  );
});
