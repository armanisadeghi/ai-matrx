#!/usr/bin/env npx tsx
/**
 * check:url-state — find surfaces writing the URL behind the primitive's back.
 *
 * `lib/url-state/useUrlState.ts` is the canonical core. Its `commitUrlParams`
 * does three things a raw `history.pushState` does not:
 *
 *   1. dispatches `matrx:url-state`, so every OTHER url-backed control on the
 *      page re-reads. A raw pushState fires no event and no popstate, so those
 *      subscribers keep rendering stale values until something else happens to
 *      re-render them. This is the actual bug, not a style preference — and
 *      when measured on 2026-08-25, NONE of the 18 hand-rolled writers
 *      dispatched it.
 *   2. deletes keys whose value is null/empty, so defaults stay out of the URL
 *      instead of accumulating `?p=1&ps=20` noise on every link;
 *   3. no-ops when the URL would not actually change, so mirrored state does
 *      not push duplicate history entries.
 *
 * And `historyModeForParamChange` applies ONE rule everywhere: discrete
 * decisions push (Back undoes exactly one), high-frequency text replaces (so
 * one search is one entry, not one per keystroke). Hand-rolled writers each
 * pick their own, so Back behaves differently on every surface.
 *
 * WHAT TO USE INSTEAD
 *   one control owns one parameter        → `useUrlState` + a codec
 *   a cluster of values moving together   → `useMirroredUrlState`
 *   a MatrxDataTable                      → `lib/data-table/useTableUrlState`
 *
 * Loud, ADVISORY, never blocking (exit 0 always, per the scream-never-block
 * rule). Pre-existing forks are listed so the number can come down deliberately
 * rather than all at once.
 *
 *   pnpm check:url-state
 *   pnpm check:url-state --json
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(__dirname, "..");
const SKIP = new Set([
  "node_modules", ".git", ".next", ".next-preview", "out", "dist", "coverage",
]);

/** The primitive itself, and tests that legitimately drive history directly. */
function isExempt(rel: string): boolean {
  return (
    rel === "lib/url-state/useUrlState.ts" ||
    rel.startsWith("scripts/") ||
    rel.endsWith(".test.ts") ||
    rel.endsWith(".test.tsx") ||
    rel.includes("__tests__/")
  );
}

type Finding = { file: string; line: number; text: string; dispatches: boolean };
const findings: Finding[] = [];

function walk(dir: string): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) { walk(full); continue; }
    if (!/\.tsx?$/.test(entry)) continue;

    const rel = relative(ROOT, full);
    if (isExempt(rel)) continue;

    let content: string;
    try { content = readFileSync(full, "utf8"); } catch { continue; }
    if (!/history\.(push|replace)State/.test(content)) continue;
    // Already on the canonical path — a file may legitimately do both.
    if (content.includes("lib/url-state/useUrlState")) continue;

    const dispatches = content.includes("matrx:url-state");
    content.split("\n").forEach((line, i) => {
      if (!/history\.(push|replace)State/.test(line)) return;
      findings.push({ file: rel, line: i + 1, text: line.trim().slice(0, 120), dispatches });
    });
  }
}

walk(ROOT);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ findings }, null, 2));
  process.exit(0);
}

if (findings.length === 0) {
  console.log("✅ check:url-state — every URL write goes through lib/url-state.");
  process.exit(0);
}

const files = new Set(findings.map((f) => f.file));
const silent = findings.filter((f) => !f.dispatches);

console.log(
  `\n🚨 check:url-state — ${findings.length} raw history write${
    findings.length === 1 ? "" : "s"
  } across ${files.size} file${files.size === 1 ? "" : "s"}\n`,
);
console.log(
  `   ${silent.length} of them never dispatch \`matrx:url-state\`, so every other\n` +
    `   URL-backed control on the page keeps showing STALE values after they write.\n\n` +
    `   Use lib/url-state instead:\n` +
    `     one control, one param      → useUrlState + a codec\n` +
    `     a cluster moving together   → useMirroredUrlState\n` +
    `     a MatrxDataTable            → lib/data-table/useTableUrlState\n`,
);
for (const file of [...files].sort()) {
  const hits = findings.filter((f) => f.file === file);
  console.log(`   ${file}  (${hits.length}${hits[0].dispatches ? "" : ", silent"})`);
}
console.log();
// Advisory by design. Never block a build.
process.exit(0);
