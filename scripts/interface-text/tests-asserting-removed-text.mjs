#!/usr/bin/env node
/**
 * tests-asserting-removed-text.mjs — which tests still assert text a commit removed? (P14)
 *
 * WHY (round 2, 2026-09-30): fix.md told fixers to grep the tests for every string they changed;
 * a fixer skipped it and AssistantNoAnswer.test.tsx went red. A rule that gets skipped becomes a
 * script. Run it on your commit (Fix) or the batch commit (Confirm); every hit is a test to update
 * in the same batch.
 *
 * Usage: node scripts/interface-text/tests-asserting-removed-text.mjs <sha> [<sha>…] [--at <rev>]
 * Exit 0 = no test asserts removed text; 1 = hits printed (test file, the removed phrase).
 */

import { execFileSync } from "node:child_process";
import process from "node:process";

const argv = process.argv.slice(2);
const atIdx = argv.indexOf("--at");
/** --at <rev>: search the tests as they were at that revision (proves the guard on a past break). */
const AT = atIdx >= 0 ? argv[atIdx + 1] : null;
const shas = argv.filter((a, i) => a !== "--at" && i !== atIdx + 1 || atIdx < 0 && a !== "--at");
if (!shas.length) { console.error("usage: tests-asserting-removed-text.mjs <sha> [<sha>…]"); process.exit(2); }

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 26 });

/** Distinctive phrases (≥4 words) from lines a commit removed — string literals and JSX text alike. */
function removedPhrases(sha) {
  const diff = git("show", "--unified=0", "--format=", sha, "--", "*.tsx", "*.ts");
  const added = new Set(diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)));
  const out = new Set();
  for (const line of diff.split("\n")) {
    if (!line.startsWith("-") || line.startsWith("---")) continue;
    const body = line.slice(1);
    if ([...added].some((a) => a.includes(body.trim()))) continue; // moved, not removed
    const chunks = body.match(/"[^"]{12,}"|'[^']{12,}'|`[^`]{12,}`|>[^<>{}]{12,}</g) ?? [body.trim().startsWith("//") ? "" : body];
    for (const c of chunks) {
      const words = c.replace(/^[>"'`]|[<"'`]$/g, "").replace(/\{[^}]*\}/g, " ").trim().split(/\s+/).filter(Boolean);
      for (let i = 0; i + 4 <= words.length; i += 4) {
        const p = words.slice(i, i + 4).join(" ");
        if (/[a-z]/i.test(p) && p.length >= 14) out.add(p);
      }
    }
  }
  return [...out];
}

/** Feature roots the commit touched (features/<x>, components/<x>, app/<group>/<x>) — tests elsewhere are unrelated. */
function featureRoots(sha) {
  const files = git("show", "--name-only", "--format=", sha).split("\n").filter(Boolean);
  return [...new Set(files.map((f) => f.split("/").slice(0, f.startsWith("app/") ? 3 : 2).join("/")))];
}

let hits = 0;
for (const sha of shas) {
  const roots = featureRoots(sha);
  const testGlobs = roots.flatMap((r) => [`${r}/**/*.test.ts`, `${r}/**/*.test.tsx`, `${r}/**/*.spec.ts`, `${r}/**/*.spec.tsx`]);
  for (const phrase of removedPhrases(sha)) {
    let lines = "";
    try { lines = git("grep", "-n", "-F", phrase, ...(AT ? [AT] : []), "--", ...testGlobs); } catch { lines = ""; }
    for (const l of lines.split("\n").filter(Boolean)) {
      const parts = l.split(":"); if (AT) parts.shift();
      const code = parts.slice(2).join(":").trim();
      if (/^(\/\/|\*|\/\*)/.test(code)) continue; // a comment, not an assertion
      hits++; console.log(`${parts.slice(0, 2).join(":")}\n   asserts removed text: "${phrase}"  (${sha})`);
    }
  }
}
if (hits) { console.log(`\n${hits} test assertion(s) on removed text — update them in the same batch.`); process.exit(1); }
console.log("no test asserts text these commits removed.");
