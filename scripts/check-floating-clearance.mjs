#!/usr/bin/env node
/**
 * check-floating-clearance — the static half of THE FLOATING CLEARANCE
 * (lib/layout/floating-chrome.ts; the CSS lives in styles/shell.css).
 *
 * Every page scroll owner ends with a runway as tall as the chrome floating
 * over the bottom of the viewport (the chat dock, the assists pill, the mobile
 * dock, the tray). The shell gives it by DEFAULT; a page bypasses it two ways,
 * and this names both:
 *
 *   hand-clearance          a page scroller (`<main>` that scrolls, or any
 *                           `data-matrx-page-scroll` element) hand-writes its own
 *                           bottom clearance — `pb-safe`, a `pb-[…safe-area…]`,
 *                           or a large `pb-16`+ — which duplicates the runway
 *                           (and is exactly what gets "tidied" away later,
 *                           leaving the page under the chat). Delete it.
 *   opt-out-without-reason  `data-floating-clearance="off"` with no
 *                           `// ui-exception:` reason within three lines above.
 *
 * The runtime guard (useFloatingClearanceGuard, dev only) catches the rest:
 * any scroller whose content still sits under floating chrome at its end.
 *
 *   node scripts/check-floating-clearance.mjs            report (exit 0)
 *   node scripts/check-floating-clearance.mjs --strict   exit 1 on any finding
 *   node scripts/check-floating-clearance.mjs --self-test   prove it fails, then passes
 *   MATRX_FINDINGS_PATHS="a.tsx b.tsx" …                 scan only those files
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { emitItem, endItems } from "./checks/items.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = /^(app|features|components|lib)\/.*\.tsx$/;

/** Reasoned exemptions: a prefix that renders no AppShell has no floating chrome and no runway. */
const EXEMPT_PREFIXES = [
  // (kiosk) is a paired-device surface with no shell (app/(kiosk)/layout.tsx).
  "features/hr/time/kiosk/",
];

const SCROLLS = /(^|\s)overflow-(y-)?auto(\s|$)/;
const HAND_CLEARANCE = /(^|\s)((?:[a-z]+:)*pb-(?:safe|\[[^\]\s]*safe-area[^\]\s]*\]|(?:1[6-9]|[2-9]\d|\d{3,})))(?=\s|$)/;

/** The opening tag starting at `start` (index of '<'), honouring braces and quotes. */
function openingTag(source, start) {
  let depth = 0;
  let quote = null;
  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

function classText(tag) {
  const parts = [];
  for (const m of tag.matchAll(/className=(?:"([^"]*)"|\{([\s\S]*?)\}(?=\s|\/?>))/g)) {
    parts.push(m[1] ?? (m[2] ?? "").replace(/["'`]/g, " "));
  }
  return parts.join(" ").replace(/\s+/g, " ");
}

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

export function scanSource(file, source) {
  const findings = [];
  // 1. page scrollers carrying hand-written bottom clearance
  for (const m of source.matchAll(/<(main)\b|data-matrx-page-scroll\b/g)) {
    const start = m[1] ? m.index : source.lastIndexOf("<", m.index);
    if (start < 0) continue;
    const tag = openingTag(source, start);
    const isMain = /^<main\b/.test(tag);
    const classes = classText(tag);
    if (isMain && !SCROLLS.test(classes)) continue;
    if (!isMain && !/data-matrx-page-scroll/.test(tag)) continue;
    const hit = HAND_CLEARANCE.exec(classes);
    if (!hit) continue;
    findings.push({
      rule: "hand-clearance",
      file,
      line: lineOf(source, start),
      title: `page scroller hand-writes bottom clearance \`${hit[2]}\` — the shell's floating-clearance runway owns it`,
    });
  }
  // 2. opt-outs without a reason
  const lines = source.split("\n");
  lines.forEach((text, i) => {
    if (!/data-floating-clearance=(?:"off"|\{["'`]off["'`]\})/.test(text)) return;
    const window = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
    if (/ui-exception:/.test(window)) return;
    findings.push({
      rule: "opt-out-without-reason",
      file,
      line: i + 1,
      title: 'data-floating-clearance="off" with no `// ui-exception:` reason',
    });
  });
  return findings;
}

function trackedFiles() {
  const only = (process.env.MATRX_FINDINGS_PATHS ?? "").split(/\s+/).filter(Boolean);
  if (only.length) return only.filter((f) => SCAN.test(f));
  return execFileSync("git", ["ls-files", "app", "features", "components", "lib"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((f) => SCAN.test(f));
}

function selfTest() {
  // The broken education-overview sample's scroll owner (before the primitive) and its fix.
  const broken = `<main className="uk-page h-full overflow-y-auto bg-textured pb-safe">\n<div />\n</main>`;
  const fixed = `<main className="uk-page h-full overflow-y-auto bg-textured">\n<div />\n</main>`;
  const optOutBare = `<div data-matrx-page-scroll data-floating-clearance="off" className="h-full overflow-y-auto" />`;
  const optOutReasoned = `// ui-exception: full-bleed video stage, the dock is hidden here\n<div data-matrx-page-scroll data-floating-clearance="off" className="h-full overflow-y-auto" />`;
  const bigPad = `<div data-matrx-page-scroll className={cn("h-full overflow-y-auto", "pb-24")} />`;
  const nonScroller = `<main className="h-full pb-safe" />`;
  const cases = [
    ["broken sample is RED", broken, ["hand-clearance"]],
    ["fixed sample is GREEN", fixed, []],
    ["bare opt-out is RED", optOutBare, ["opt-out-without-reason"]],
    ["reasoned opt-out is GREEN", optOutReasoned, []],
    ["pb-24 on a page scroller is RED", bigPad, ["hand-clearance"]],
    ["a <main> that does not scroll is GREEN", nonScroller, []],
  ];
  let failed = 0;
  for (const [name, source, expected] of cases) {
    const rules = scanSource("fixture.tsx", source).map((f) => f.rule);
    const ok = JSON.stringify(rules) === JSON.stringify(expected);
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (got ${JSON.stringify(rules)})`);
  }
  if (failed) {
    console.error(`floating-clearance self-test: ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log("floating-clearance self-test: OK — fails on the broken shapes, passes on the fixed ones.");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const strict = process.argv.includes("--strict");
  const files = trackedFiles();
  const findings = [];
  for (const file of files) {
    if (EXEMPT_PREFIXES.some((p) => file.startsWith(p))) continue;
    let source;
    try {
      source = readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    findings.push(...scanSource(file, source));
  }
  for (const f of findings) {
    emitItem({ key: `${f.rule}|${f.file}`, status: "new", title: f.title, file: f.file, line: f.line, rule: f.rule });
  }
  endItems();
  if (findings.length === 0) {
    console.log(`floating-clearance: OK — ${files.length} files; every page scroller takes the shell's runway.`);
    return;
  }
  console.log(`\nfloating-clearance: ${findings.length} finding(s):\n`);
  for (const f of findings) console.log(`  ${f.file}:${f.line}  [${f.rule}] ${f.title}`);
  console.log("\nFix: delete the hand-written bottom clearance (the shell's runway — lib/layout/floating-chrome.ts — owns it), or give an opt-out its `// ui-exception:` reason.");
  if (strict) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
