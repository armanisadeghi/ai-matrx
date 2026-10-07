#!/usr/bin/env node
/**
 * THE ENGINE LIVES IN @ai-matrx/rich-content — the app never grows a second copy.
 *
 * Red when any module that moved into the package exists again in this app, or any file imports
 * a moved path (`@/components/markdown-core/...`, `@/components/mardown-display/<moved>`, ...).
 * The list of moved modules is `scripts/rich-content-packaged.json` (one entry per module, grown
 * by each extraction slice; never shrunk). Usage: node scripts/check-rich-content-packaged.mjs [--self-test]
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIST = JSON.parse(readFileSync(join(root, "scripts/rich-content-packaged.json"), "utf8"));
/** Whole directories that moved entirely (any file under them is a regrowth). */
const WHOLE_DIRS = LIST.wholeDirectories;
/** Single modules (extension-less, app-relative) that moved. */
const MODULES = new Set(LIST.modules);
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|jest\.(?:mock|doMock|requireActual)\s*\(\s*|\bexport\s*\*\s*from\s*)["']([^"'\n]+)["']/g;

export function check(files, exists) {
  const problems = [];
  for (const f of files.keys()) {
    const n = f.replace(/\.(tsx?)$/, "");
    if (MODULES.has(n) || WHOLE_DIRS.some((d) => f.startsWith(`${d}/`))) problems.push(`${f}: moved into @ai-matrx/rich-content — import the package, never re-add the file`);
  }
  for (const [f, text] of files) {
    for (const m of text.matchAll(SPEC)) {
      let target = null;
      if (m[1].startsWith("@/")) target = m[1].slice(2);
      else if (m[1].startsWith(".")) target = relative(root, resolve(dirname(join(root, f)), m[1]));
      if (!target) continue;
      const t = target.replace(/\.(tsx?)$/, "").replace(/\/index$/, "");
      if (MODULES.has(t) || WHOLE_DIRS.some((d) => t === d || t.startsWith(`${d}/`))) problems.push(`${f}: imports "${m[1]}" — use @ai-matrx/rich-content/...`);
    }
  }
  void exists;
  return problems;
}

if (process.argv.includes("--self-test")) {
  const sample = new Map([
    ["components/markdown-core/MarkdownCore.tsx", "export {}"],
    ["features/x/a.tsx", 'import MarkdownCore from "@/components/markdown-core/MarkdownCore";'],
    ["features/x/b.tsx", 'import M from "@ai-matrx/rich-content/markdown-core/MarkdownCore";'],
  ]);
  const saved = { dirs: WHOLE_DIRS.slice(), mods: [...MODULES] };
  WHOLE_DIRS.push("components/markdown-core");
  const got = check(sample).map((p) => p.split(":")[0]);
  WHOLE_DIRS.length = 0; WHOLE_DIRS.push(...saved.dirs);
  const want = ["components/markdown-core/MarkdownCore.tsx", "features/x/a.tsx"];
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error(`✖ self-test: expected ${want.join(", ")}, got ${got.join(", ")}`);
    process.exit(1);
  }
  console.log("✔ check-rich-content-packaged self-test: a regrown file and an app-path import both go red; a package import passes");
  process.exit(0);
}

const tracked = execSync('git ls-files -- "*.ts" "*.tsx" "*.mjs" "*.js"', { cwd: root, maxBuffer: 1 << 28 })
  .toString().split("\n").filter(Boolean).filter((f) => existsSync(join(root, f)) && f !== "scripts/check-rich-content-packaged.mjs");
const files = new Map(tracked.map((f) => [f, readFileSync(join(root, f), "utf8")]));
const problems = check(files);
if (problems.length) {
  console.error(`✖ check-rich-content-packaged: ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 60)) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`✔ check-rich-content-packaged: ${files.size} files, 0 app copies of the engine`);
