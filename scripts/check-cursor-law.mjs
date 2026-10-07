#!/usr/bin/env node
// scripts/check-cursor-law.mjs
//
// THE CURSOR LAW (Arman, 2026-10-03 — law: common-docs/policies/cursor-law.md).
//
// The cursor always tells the truth about what a press will do. A disabled
// control shows `not-allowed` (the @ai-matrx/design-system base layer sets it on
// `:disabled` and `[aria-disabled="true"]`). `pointer-events: none` on a disabled
// state SWALLOWS that cursor: the pointer falls through and shows whatever is
// underneath, usually the page's arrow.
//
// This flags a Tailwind class that turns pointer events off on a disabled state:
//   disabled:pointer-events-none, aria-disabled:pointer-events-none,
//   data-[disabled]:pointer-events-none, data-disabled:pointer-events-none,
//   group-disabled:…, peer-disabled:…, aria-[disabled=true]:…
//
// Fix: drop the class. A native `disabled` button fires no click anyway; a link or
// `[role=button]` gets `aria-disabled="true"`, `tabIndex={-1}` and a click handler
// that returns early (the design-system Button does this for `asChild` +
// `disabled`). Radix and cmdk items already refuse to select a disabled item.
//
// Baseline ratchet (scripts/cursor-law-baseline.json, file → count): exits 1 only
// when a file holds MORE than its baseline. The baseline only shrinks —
// `--write-baseline` rewrites it from the tree, and a file that dropped below its
// count is reported so the baseline is tightened. Advisory (scream, never block):
// run by scripts/run-release-gates.sh.
//
// Usage: node scripts/check-cursor-law.mjs [--self-test] [--write-baseline] [files…]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCE_ROOTS, gitFiles } from "./lib/source-roots.cjs";

const ROOT = new URL("..", import.meta.url).pathname;
const BASELINE = join(ROOT, "scripts/cursor-law-baseline.json");

const DISABLED_VARIANT =
  "(?:disabled|aria-disabled|data-disabled|data-\\[disabled(?:=(?:true|\"true\"|''|\"\"))?\\]|aria-\\[disabled=(?:true|\"true\")\\]|group-disabled(?:/[\\w-]+)?|peer-disabled(?:/[\\w-]+)?|group-data-\\[disabled(?:=true)?\\](?:/[\\w-]+)?|group-aria-disabled(?:/[\\w-]+)?)";
const PATTERN = new RegExp(
  `(?:^|[\\s"'\`{(])((?:[\\w\\[\\]=/&>*.:-]+:)*${DISABLED_VARIANT}:(?:[\\w-]+:)*!?pointer-events-none)(?=[\\s"'\`)}]|$)`,
  "g",
);

export function findingsForSource(src) {
  const out = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    PATTERN.lastIndex = 0;
    let m;
    while ((m = PATTERN.exec(lines[i]))) out.push({ line: i + 1, cls: m[1] });
  }
  return out;
}

function trackedFiles() {
  const out = gitFiles(ROOT, ["ls-files", "--", ...SOURCE_ROOTS.map((r) => `${r}/**/*.ts`), ...SOURCE_ROOTS.map((r) => `${r}/**/*.tsx`)]);
  return [...new Set(out.split("\n").filter(Boolean))].filter((f) => !/\.test\.tsx?$/.test(f));
}

function census(files) {
  const counts = {};
  const where = {};
  for (const file of files) {
    const abs = join(ROOT, file);
    if (!existsSync(abs)) continue;
    const found = findingsForSource(readFileSync(abs, "utf8"));
    if (found.length) {
      counts[file] = found.length;
      where[file] = found;
    }
  }
  return { counts, where };
}

function selfTest() {
  const red = [
    `<button className="h-8 disabled:pointer-events-none disabled:opacity-50">`,
    `cn("px-2", "aria-disabled:pointer-events-none")`,
    `"data-[disabled]:pointer-events-none data-[disabled]:opacity-50"`,
    `const ITEM = "flex data-[disabled=true]:pointer-events-none";`,
    `"group-disabled:pointer-events-none"`,
    `"peer-disabled:pointer-events-none"`,
    `"data-disabled:pointer-events-none"`,
    `"md:disabled:pointer-events-none"`,
    `"aria-[disabled=true]:pointer-events-none"`,
  ];
  const green = [
    `<div className="pointer-events-none absolute inset-0" />`,
    `"[&_svg]:pointer-events-none [&_svg]:size-4"`,
    `"disabled:cursor-not-allowed disabled:opacity-50"`,
    `"before:pointer-events-none"`,
    `"opacity-0 pointer-events-none"`,
  ];
  let failed = 0;
  for (const src of red) {
    if (findingsForSource(src).length !== 1) {
      failed++;
      console.error(`  MISSED (should be red): ${src}`);
    }
  }
  for (const src of green) {
    if (findingsForSource(src).length !== 0) {
      failed++;
      console.error(`  FALSE ALARM (should be green): ${src}`);
    }
  }
  if (failed) {
    console.error(`check-cursor-law self-test: ${failed} case(s) wrong`);
    process.exit(1);
  }
  console.log(`check-cursor-law self-test: ${red.length} red caught, ${green.length} green clean`);
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const explicit = args.filter((a) => !a.startsWith("--"));
const files = explicit.length ? explicit : trackedFiles();
const { counts, where } = census(files);

if (args.includes("--write-baseline")) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`check-cursor-law: baseline written — ${Object.keys(sorted).length} files, ${Object.values(sorted).reduce((a, b) => a + b, 0)} sites`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const fresh = [];
const shrunk = [];
for (const [file, n] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0;
  if (n > allowed) fresh.push({ file, n, allowed });
}
if (!explicit.length) {
  for (const [file, allowed] of Object.entries(baseline)) {
    const n = counts[file] ?? 0;
    if (n < allowed) shrunk.push({ file, n, allowed });
  }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
if (shrunk.length) {
  console.log(`check-cursor-law: ${shrunk.length} file(s) dropped below their baseline — tighten it (pnpm check:cursor-law --write-baseline):`);
  for (const s of shrunk) console.log(`  ${s.file}  ${s.allowed} → ${s.n}`);
}
if (fresh.length) {
  console.error(`check-cursor-law: ${fresh.length} file(s) turn pointer events off on a disabled state (THE CURSOR LAW — common-docs/policies/cursor-law.md):`);
  for (const f of fresh) {
    for (const hit of where[f.file]) console.error(`  ${f.file}:${hit.line}  ${hit.cls}`);
    console.error(`    (${f.n} here, baseline ${f.allowed})`);
  }
  console.error(
    "  Fix: drop the class — a disabled control shows not-allowed from the design-system base layer. A link or [role=button] gets aria-disabled + tabIndex -1 + a click handler that returns early.",
  );
  process.exit(1);
}
console.log(`check-cursor-law: no new disabled pointer-events-none (${total} baselined site(s) across ${Object.keys(counts).length} file(s)).`);
