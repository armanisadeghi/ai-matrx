#!/usr/bin/env node
// scripts/check-context-single-door.mjs — `node scripts/check-context-single-door.mjs [--self-test]`
//
// ONE DOOR FOR AN AGENT REQUEST'S `context` (2026-09-30, common-docs
// systems/scopes-context/context-delivery/RULES.md).
//
// The composer's context table shows the rows `buildRequestContext` resolves, and the request
// carries `buildContextWire(those rows)`. That is the whole guarantee that the screen and the
// request cannot disagree — so any second way of building a request's context reopens the
// "it showed one thing and sent another" class. This guard fails on, outside the allowed files:
//
//   1. calling `buildContextWire(` or `buildAmbientContext(` (the one door does both);
//   2. reading `selectResourceContextPayload(` (attached files are rows of the door);
//   3. assigning `<request|payload|body>.context =` in the execution system;
//   4. spreading a hand-built `context` into a request body (`...(context && { context })`
//      is allowed only where `context` came from the door, i.e. in the allowed files).
//
// `--self-test` plants each violation in memory and proves it is caught, then proves a clean file
// passes and that a stale allow-list entry fails.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["features", "lib", "components", "app", "hooks", "utils"];

/** Allowed files, each with the reason. A stale entry (file gone) fails too. */
const ALLOWED = {
  "features/agents/redux/execution-system/context-rules/request-context.ts": "THE door",
  "features/agents/ui-first-tools/redux/build-ambient-context.ts": "defines buildAmbientContext",
  "features/agents/redux/execution-system/instance-resources/instance-resources.selectors.ts":
    "defines selectResourceContextPayload",
  "features/agents/redux/execution-system/thunks/execute-instance.thunk.ts":
    "assembleRequest sets request.context from the door",
  "features/agents/redux/execution-system/thunks/execute-manual-instance.thunk.ts":
    "assembleManualRequest sets request.context from the door",
  "features/agents/redux/execution-system/thunks/resume-instance.thunk.ts":
    "resume spreads the door's context into its body",
};

const RULES = [
  { id: "wire-builder", re: /\b(buildContextWire|buildAmbientContext)\s*\(/ },
  { id: "resource-context", re: /\bselectResourceContextPayload\s*\(/ },
  { id: "context-assign", re: /\b(request|payload|body|routedPayload)\s*\.\s*context\s*=(?!=)/ },
  {
    id: "context-spread",
    re: /\.\.\.\s*\(\s*context\s*&&\s*\{\s*context\s*\}\s*\)/,
    // Request builders only: elsewhere `context` is often a template VARIABLE
    // named "context" (e.g. a code editor's `variables: { context }`).
    only: /^(features\/agents\/redux\/execution-system\/|lib\/api\/)/,
  },
];

/** Findings for one file's text (path relative to repo root). */
export function findings(relPath, text) {
  if (ALLOWED[relPath]) return [];
  if (/__tests__\/|\.test\.tsx?$/.test(relPath)) return [];
  const out = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (/^\s*\*/.test(code)) return; // doc comment line
    for (const rule of RULES) {
      if (rule.only && !rule.only.test(relPath)) continue;
      if (rule.re.test(code)) out.push({ file: relPath, line: i + 1, rule: rule.id, text: line.trim() });
    }
  });
  return out;
}

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) acc.push(full);
  }
  return acc;
}

function staleAllowList() {
  return Object.keys(ALLOWED).filter((p) => !existsSync(join(ROOT, p)));
}

function run() {
  const files = SCAN_DIRS.filter((d) => existsSync(join(ROOT, d))).flatMap((d) => walk(join(ROOT, d), []));
  const all = files.flatMap((f) => findings(relative(ROOT, f), readFileSync(f, "utf8")));
  const stale = staleAllowList();
  for (const f of all) console.error(`✗ ${f.file}:${f.line} [${f.rule}] ${f.text}`);
  for (const p of stale) console.error(`✗ stale allow-list entry: ${p}`);
  if (all.length || stale.length) {
    console.error(
      `\ncheck:context-single-door — ${all.length} finding(s). A request's context is built ONLY by ` +
        "features/agents/redux/execution-system/context-rules/request-context.ts (buildRequestContext).",
    );
    process.exit(1);
  }
  console.log(`✓ check:context-single-door — ${files.length} files, one door`);
}

function selfTest() {
  const planted = [
    ["features/x/a.ts", "const wire = buildContextWire(rows);", "wire-builder"],
    ["features/x/b.ts", "const amb = buildAmbientContext(state, id);", "wire-builder"],
    ["features/x/c.ts", "const r = selectResourceContextPayload(id)(state);", "resource-context"],
    ["features/x/d.ts", "  request.context = { ...a, ...b };", "context-assign"],
    ["features/x/e.ts", "  payload.context = merged;", "context-assign"],
    ["features/agents/redux/execution-system/thunks/x.ts", "  ...(context && { context }),", "context-spread"],
  ];
  let ok = true;
  for (const [file, text, rule] of planted) {
    const got = findings(file, text);
    if (!got.some((f) => f.rule === rule)) {
      console.error(`✗ self-test: planted ${rule} in ${file} was NOT caught`);
      ok = false;
    }
  }
  const clean = [
    "if (request.context === undefined) return;",
    "// payload.context = old way (comment)",
    " * buildContextWire(rows) is the only producer",
    "const { context } = buildRequestContext(state, id);",
    "variables: { ...(context && { context }) },",
  ].join("\n");
  if (findings("features/x/clean.ts", clean).length) {
    console.error("✗ self-test: a clean file was flagged", findings("features/x/clean.ts", clean));
    ok = false;
  }
  if (findings("features/agents/redux/execution-system/context-rules/request-context.ts", "buildContextWire(rows)").length) {
    console.error("✗ self-test: the door itself was flagged");
    ok = false;
  }
  ALLOWED["features/x/does-not-exist.ts"] = "planted stale entry";
  if (!staleAllowList().includes("features/x/does-not-exist.ts")) {
    console.error("✗ self-test: a stale allow-list entry was NOT caught");
    ok = false;
  }
  delete ALLOWED["features/x/does-not-exist.ts"];
  if (!ok) process.exit(1);
  console.log("✓ check:context-single-door --self-test — every planted violation caught, clean passes");
}

if (process.argv.includes("--self-test")) selfTest();
else run();
