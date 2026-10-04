#!/usr/bin/env node
/**
 * check:one-control — THE ONE CONTROL census (the findings half of `matrx/one-control`).
 *
 * The controls are `@ai-matrx/design-system/controls` (package FEATURE.md § THE ONE CONTROL). This
 * runs the SAME ESLint rule the editor runs (scripts/lint-rules/one-control-rule.mjs) over every
 * tracked .tsx that could break it, and names each file once per rule:
 *
 *   prototype-control-class|<file>   a retired `uc-*` prototype class (the decision-board system)
 *   control-visual-override|<file>   a visual className/style handed to a package control
 *
 * A styled raw <button> is counted by `check:ui-drift` (`styled-raw-button`) — one census per
 * defect, never two. No baseline: the controls shipped with zero sites, so every item is `new`. Loud, never blocking a release: `--strict` exits 1 on a new item and
 * only the findings runner reads that.
 *
 *   node scripts/one-control/check-one-control.mjs [paths…] [--strict]
 *   node scripts/one-control/check-one-control.mjs --self-test
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";

import { emitItem, endItems } from "../checks/items.mjs";
import { oneControl } from "../lint-rules/one-control-rule.mjs";
import { ONE_CONTROL_FIX, PROTOTYPE_FIX } from "../lint-rules/one-control.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TAG = "[one-control]";
const RULE_OF = { prototype: "prototype-control-class", override: "control-visual-override" };
export const RULES = {
  "prototype-control-class": { title: "retired uc-* prototype class", fix: PROTOTYPE_FIX },
  "control-visual-override": { title: "visual className/style on a package control", fix: ONE_CONTROL_FIX },
};

export function remedyForKey(key) {
  return RULES[String(key).split("|")[0]]?.fix ?? null;
}

const linter = new Linter({ configType: "flat" });
const CONFIG = [
  {
    files: ["**/*.tsx"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { matrx: { rules: { "one-control": oneControl } } },
    rules: { "matrx/one-control": "error" },
  },
];

/** One file's sites: [{ rule, line, what }]. */
export function scanSource(file, text) {
  if (!/\buc-|\buc\b|design-system\/controls/.test(text)) return [];
  return linter
    .verify(text, CONFIG, { filename: file })
    .filter((m) => m.ruleId === "matrx/one-control")
    .map((m) => ({ rule: RULE_OF[m.messageId], line: m.line, what: m.message.split(" — ")[0].split(":")[0] }));
}

function listFiles(root) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.tsx"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((f) => f && !/(^|\/)node_modules\/|\.(test|spec)\.tsx$|\/__tests__\//.test(f));
}

function narrowed(argv, env, root) {
  let paths = argv.filter((a) => !a.startsWith("--"));
  if (!paths.length && env.MATRX_FINDINGS_PATHS) {
    try {
      const parsed = JSON.parse(env.MATRX_FINDINGS_PATHS);
      if (Array.isArray(parsed)) paths = parsed.map(String);
    } catch {
      paths = [];
    }
  }
  if (!paths.length) return null;
  return paths.map((p) => relative(root, isAbsolute(p) ? p : resolve(process.cwd(), p)).split("\\").join("/").replace(/\/+$/, ""));
}

export function collect({ root = ROOT, paths = null } = {}) {
  let files = listFiles(root);
  if (paths) {
    const dirs = paths.filter((p) => p === "" || (existsSync(join(root, p)) && statSync(join(root, p)).isDirectory()));
    files = files.filter((f) => paths.includes(f) || dirs.some((d) => d === "" || f.startsWith(`${d}/`)));
  }
  const byKey = new Map();
  for (const file of files) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue;
    for (const site of scanSource(file, readFileSync(abs, "utf8"))) {
      const key = `${site.rule}|${file}`;
      if (!byKey.has(key)) byKey.set(key, { key, rule: site.rule, file, sites: [] });
      byKey.get(key).sites.push(site);
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function main(argv = process.argv.slice(2), env = process.env, root = ROOT) {
  if (argv.includes("--self-test")) return selfTest();
  const paths = narrowed(argv, env, root);
  const found = collect({ root, paths });
  const fresh = found.length;
  for (const f of found) {
    emitItem({
      key: f.key,
      status: "new",
      title: `${f.sites.length} × ${RULES[f.rule].title}`,
      file: f.file,
      line: f.sites[0].line,
      rule: f.rule,
    });
  }
  if (!paths) endItems();
  for (const f of found) {
    for (const s of f.sites.slice(0, 5)) console.log(`  NEW ${f.file}:${s.line}  ${RULES[f.rule].title}: ${s.what}\n      fix: ${RULES[f.rule].fix}`);
  }
  console.log(`${TAG} ${found.length} item(s), ${fresh} new${paths ? " (narrowed scan)" : ""}`);
  return argv.includes("--strict") && fresh ? 1 : 0;
}

/** Proves the census fires on each planted fault and stays quiet on placement-only use. */
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "one-control-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    const IMPORT = 'import { Button, Field } from "@ai-matrx/design-system/controls";\n';
    const plant = {
      "proto.tsx": 'export const A = () => <button className="uc-btn uc-btn-primary">New</button>;\n',
      "override.tsx": `${IMPORT}export const B = () => <Button className="h-9 px-6">Save</Button>;\n`,
      "style.tsx": `${IMPORT}export const C = () => <Field style={{ height: 40 }} />;\n`,
      "clean.tsx": `${IMPORT}export const D = () => <Field className="w-44 flex-1" style={{ width: "11rem" }} />;\n`,
    };
    for (const [name, text] of Object.entries(plant)) writeFileSync(join(dir, name), text);
    const keys = collect({ root: dir }).map((f) => f.key);
    const want = ["control-visual-override|override.tsx", "control-visual-override|style.tsx", "prototype-control-class|proto.tsx"];
    const ok = JSON.stringify(keys) === JSON.stringify(want);
    console.log(`${TAG} self-test ${ok ? "PASS" : "FAIL"}: ${JSON.stringify(keys)}`);
    return ok ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
