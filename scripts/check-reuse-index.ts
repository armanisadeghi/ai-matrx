#!/usr/bin/env tsx
/**
 * check-reuse-index — verifies every repo path named in the Primitives Index
 * of docs/reuse-first.md actually exists on disk.
 *
 * The index is the reuse-first doctrine's discovery surface (see CLAUDE.md →
 * "Build the platform, not the artifact"): agents cannot reuse what they
 * cannot find, and a stale path is worse than no entry — it teaches agents
 * the index lies. This keeps it true as files move.
 *
 * Modes:
 *   pnpm check:reuse-index            loud, non-blocking (exit 0) — advisory
 *   pnpm check:reuse-index:strict     exit 1 on any missing path — CI / release
 *
 * Exit codes:
 *   0  all paths exist (or misses found, non-strict — informational)
 *   1  misses found under --strict
 *   2  script error (index file missing / unreadable)
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const INDEX_FILE = "docs/reuse-first.md";
const SECTION_MARKER = "## Primitives Index";

const strict = process.argv.includes("--strict");

const repoRoot = join(dirname(new URL(import.meta.url).pathname), "..");
const indexPath = join(repoRoot, INDEX_FILE);

if (!existsSync(indexPath)) {
  console.error(`check-reuse-index: ${INDEX_FILE} not found`);
  process.exit(2);
}

const content = readFileSync(indexPath, "utf8");
const sectionStart = content.indexOf(SECTION_MARKER);
if (sectionStart === -1) {
  console.error(
    `check-reuse-index: "${SECTION_MARKER}" section not found in ${INDEX_FILE}`,
  );
  process.exit(2);
}
const section = content.slice(sectionStart);

// Backticked tokens that look like repo paths: contain a `/`, no spaces.
// Handles `@/` aliases, trailing `/*` globs, trailing `/` dirs, `#anchor`s.
const candidates = new Set<string>();
for (const match of section.matchAll(/`([^`\s]+\/[^`\s]*)`/g)) {
  candidates.add(match[1]);
}

const missing: string[] = [];
let checked = 0;

for (const raw of candidates) {
  let p = raw;
  if (p.startsWith("@/")) p = p.slice(2); // repo alias
  p = p.split("#")[0]; // strip anchors like file.ts#export
  if (p.endsWith("/*")) p = p.slice(0, -2); // glob → parent dir
  p = p.replace(/\/$/, ""); // trailing dir slash
  // Repo paths in the index are relative; leading `/` means a URL route
  // (e.g. `/api/*`), not a file.
  if (!p || p.startsWith("/") || p.startsWith("http")) continue;
  checked++;
  if (!existsSync(join(repoRoot, p))) missing.push(raw);
}

if (missing.length === 0) {
  console.log(
    `check-reuse-index: OK — ${checked} paths in the Primitives Index all exist.`,
  );
  process.exit(0);
}

const line = "═".repeat(72);
console.error(`\x1b[31m${line}`);
console.error(
  `  PRIMITIVES INDEX IS LYING — ${missing.length} path(s) in ${INDEX_FILE} do not exist:`,
);
for (const m of missing) console.error(`    • ${m}`);
console.error(
  "  Fix the row (file moved/renamed) or delete it. Agents trust this index.",
);
console.error(`${line}\x1b[0m`);
process.exit(strict ? 1 : 0);
