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
//      is allowed only where `context` came from the door, i.e. in the allowed files);
//   5. setting a request's `context_withheld` anywhere but the door's request builders;
//   7. passing `includeAmbient` (the first turn's system values ride by ONE rule, `ambientIncluded`,
//      for the table and every send path — resume included);
//   6. a request builder that sends the door's `context` WITHOUT its `context_withheld` (the
//      keys the person's rules withheld, from the same rows) — the server would then list every
//      saved off-rule instead of the ones withheld on this page.
//
// `--self-test` plants each violation in memory and proves it is caught, then proves a clean file
// passes and that a stale allow-list entry fails.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { featureRegExp } from "./lib/source-roots.cjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["features", "packages/chat/src", "lib", "components", "app", "hooks", "utils"];

/** Allowed files, each with the reason. A stale entry (file gone) fails too. */
const ALLOWED = {
  "packages/chat/src/agents/redux/execution-system/context-rules/request-context.ts": "THE door",
  "packages/chat/src/agents/ui-first-tools/redux/build-ambient-context.ts": "defines buildAmbientContext",
  "packages/chat/src/agents/redux/execution-system/instance-resources/instance-resources.selectors.ts":
    "defines selectResourceContextPayload",
  "packages/chat/src/agents/redux/execution-system/thunks/execute-instance.thunk.ts":
    "assembleRequest sets request.context from the door",
  "packages/chat/src/agents/redux/execution-system/thunks/execute-manual-instance.thunk.ts":
    "assembleManualRequest sets request.context from the door",
  "packages/chat/src/agents/redux/execution-system/thunks/resume-instance.thunk.ts":
    "resume spreads the door's context into its body",
};

/** The request builders: each sends the door's `context` AND its `context_withheld`. */
const REQUEST_BUILDERS = [
  "packages/chat/src/agents/redux/execution-system/thunks/execute-instance.thunk.ts",
  "packages/chat/src/agents/redux/execution-system/thunks/execute-manual-instance.thunk.ts",
  "packages/chat/src/agents/redux/execution-system/thunks/resume-instance.thunk.ts",
];

/** Rule 6 for one builder's text: the door's withheld keys must reach its body. */
export function builderFindings(relPath, text) {
  if (!/\bbuild(Resume)?RequestContext\s*\(/.test(text)) {
    return [{ file: relPath, line: 1, rule: "builder-no-door", text: "a request builder that no longer calls buildRequestContext" }];
  }
  const destructures = /\bcontext_withheld\b[\s\S]{0,200}?\}\s*=\s*build(Resume)?RequestContext\s*\(/.test(text);
  const sends = /(\.\s*context_withheld\s*=|^\s*context_withheld\s*[,:])/m.test(text);
  return destructures && sends
    ? []
    : [{ file: relPath, line: 1, rule: "withheld-missing", text: "sends the door's context without its context_withheld" }];
}

const RULES = [
  { id: "ambient-override", re: /\bincludeAmbient\s*:/ },
  { id: "withheld-assign", re: /\bcontext_withheld\s*[:=](?!=)/ },
  { id: "wire-builder", re: /\b(buildContextWire|buildAmbientContext)\s*\(/ },
  { id: "resource-context", re: /\bselectResourceContextPayload\s*\(/ },
  { id: "context-assign", re: /\b(request|payload|body|routedPayload)\s*\.\s*context\s*=(?!=)/ },
  {
    id: "context-spread",
    re: /\.\.\.\s*\(\s*context\s*&&\s*\{\s*context\s*\}\s*\)/,
    // Request builders only: elsewhere `context` is often a template VARIABLE
    // named "context" (e.g. a code editor's `variables: { context }`).
    only: featureRegExp(/^(features\/agents\/redux\/execution-system\/|lib\/api\/)/),
  },
];

/** Findings for one file's text (path relative to repo root). */
/** Rules that hold even in the allowed files (only the door itself defines them). */
const EVERYWHERE = new Set(["ambient-override"]);
const DOOR = "packages/chat/src/agents/redux/execution-system/context-rules/request-context.ts";

export function findings(relPath, text) {
  if (relPath === DOOR) return [];
  if (/__tests__\/|\.test\.tsx?$/.test(relPath)) return [];
  const allowed = Boolean(ALLOWED[relPath]);
  const out = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (/^\s*\*/.test(code)) return; // doc comment line
    for (const rule of RULES) {
      if (allowed && !EVERYWHERE.has(rule.id)) continue;
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
  for (const p of REQUEST_BUILDERS) if (!ALLOWED[p]) return [`${p} (request builder missing from ALLOWED)`];
  return Object.keys(ALLOWED).filter((p) => !existsSync(join(ROOT, p)));
}

function run() {
  const files = SCAN_DIRS.filter((d) => existsSync(join(ROOT, d))).flatMap((d) => walk(join(ROOT, d), []));
  const all = [
    ...files.flatMap((f) => findings(relative(ROOT, f), readFileSync(f, "utf8"))),
    ...REQUEST_BUILDERS.filter((p) => existsSync(join(ROOT, p))).flatMap((p) =>
      builderFindings(p, readFileSync(join(ROOT, p), "utf8")),
    ),
  ];
  const stale = staleAllowList();
  for (const f of all) console.error(`✗ ${f.file}:${f.line} [${f.rule}] ${f.text}`);
  for (const p of stale) console.error(`✗ stale allow-list entry: ${p}`);
  if (all.length || stale.length) {
    console.error(
      `\ncheck:context-single-door — ${all.length} finding(s). A request's context is built ONLY by ` +
        "packages/chat/src/agents/redux/execution-system/context-rules/request-context.ts (buildRequestContext).",
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
    ["features/x/f.ts", "  request.context_withheld = [];", "withheld-assign"],
    ["features/agents/redux/execution-system/thunks/y.ts", "  buildRequestContext(s, id, { includeAmbient: true });", "ambient-override"],
    ["features/x/g.ts", "  body = { context_withheld: keys };", "withheld-assign"],
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
  if (findings("packages/chat/src/agents/redux/execution-system/context-rules/request-context.ts", "buildContextWire(rows)").length) {
    console.error("✗ self-test: the door itself was flagged");
    ok = false;
  }
  // Rule 6, per builder shape: a body that forgets the withheld keys, and one that has them.
  const forgot = "const { rows, context } = buildRequestContext(state, id);\nif (context) request.context = context;";
  if (!builderFindings("features/x/builder.ts", forgot).some((f) => f.rule === "withheld-missing")) {
    console.error("✗ self-test: a builder that drops context_withheld was NOT caught");
    ok = false;
  }
  const kept = "const {\n  rows,\n  context,\n  context_withheld,\n} = buildRequestContext(state, id);\nrequest.context_withheld = context_withheld;";
  if (builderFindings("features/x/builder.ts", kept).length) {
    console.error("✗ self-test: a builder that sends context_withheld was flagged");
    ok = false;
  }
  // Rule 7 holds inside an allowed request builder too (the resume path forced it until 2026-10-01).
  if (!findings("packages/chat/src/agents/redux/execution-system/thunks/resume-instance.thunk.ts", "  includeAmbient: true,").some((f) => f.rule === "ambient-override")) {
    console.error("✗ self-test: includeAmbient in an allowed builder was NOT caught");
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
