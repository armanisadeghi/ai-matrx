#!/usr/bin/env node
// check-sweep-resolves — WHICH UNCOMMITTED FILES WOULD BREAK THE BUILD IF THE SWEEP COMMITTED THEM.
//
// THE DEFECT THIS EXISTS FOR (2026-10-06 → 2026-10-07)
// ----------------------------------------------------
// `scripts/sync-main.py` step 1 commits EVERY uncommitted file in the shared checkout ("local work
// not committed by agents who made them"). An agent editing an @ai-matrx package in aidream writes
// the consumer half here at the same moment; the package's npm publish train then takes 5–40
// minutes. Every half-hourly sync in that window swept the consumer half onto main while the
// lockfile still named the old package, and the release built it:
//
//   v0.4.2916/2918  agents/models/react + parseCapabilities      (swept 10-06 13:57)
//   v0.4.2961       chat markAgentRecordClean                     (swept 10-07 08:45)
//   v0.4.2969/2971  records-ui saveTableDescription, *FromDocument (swept 11:43, 12:49)
//   v0.4.2975       agents ASKING_FOR_ORGANIZATION                 (swept 14:20)
//   v0.4.2981–2983  records primeRecordPageBundle                  (swept 18:04)
//   v0.4.2990–2991  providers/WarmupHost.tsx calls warmup.currentScope() (swept 21:05:41;
//                   agents 0.58.0 reached npm 21:14:08) — 2991 BUILT GREEN and crashed
//                   manage.aimatrx.com/administration: "v.currentScope is not a function".
//
// The last one no import-name check can see: the method is on an object a function RETURNS.
// Only the type checker sees it. So this asks the TypeScript checker, for the files the sweep is
// about to commit, against the packages actually INSTALLED (= what the lockfile will build):
//
//   • a changed line imports a module that does not resolve           (TS2307 …)
//   • a changed line imports a name the module does not export        (TS2305/2724/2614/2459/2460 …)
//     — including through a local `export * from "@ai-matrx/…"` shim (v0.4.2989)
//   • a changed line reads a member an @ai-matrx type does not have   (TS2339/2551, receiver
//     declared under node_modules/@ai-matrx — the WarmupHost case)
//   • the file does not parse                                         (v0.4.2928 "Expected a semicolon")
//   • a COMMITTED file imports a name a swept file no longer exports, or a file the sweep deletes
//
// and closes the set: a swept file importing a held file is held; a deletion a held file's
// committed version still imports is held. Only CHANGED lines count for a modified file (a
// pre-existing error is not this sweep's to hold). Held files stay uncommitted in the working
// tree — nothing is moved, nothing lost — and the next sync (30 min later, package served by then)
// takes them. Scream, never block: the release still ships everything else.
//
//   node scripts/check-sweep-resolves.mjs --json          # classify this checkout's uncommitted files
//   node scripts/check-sweep-resolves.mjs                 # same, human-readable
//   node scripts/check-sweep-resolves.mjs --self-test     # every rule proven separately in a temp repo
//
// Exit codes: 0 classified (holds or not) · 2 could not run — sync-main announces it, never silent.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SKIP = /(^|\/)(node_modules|\.next|\.git|dist|\.wt|tmp|_conflicts)\//;
// A module or name that does not resolve. Any module, ours or a package's: a missing local file
// (v0.4.2959) or export (v0.4.2973) breaks the build exactly as a missing package export does.
const RESOLVE_CODES = new Set([2307, 2305, 2306, 2724, 2614, 2459, 2460, 2694, 1192, 2792, 2834, 2835]);
// A member missing on a type — held only when that type is declared inside an @ai-matrx package.
const MEMBER_CODES = new Set([2339, 2551]);
// Bound on how many committed files are opened to look for importers of one swept file.
const IMPORTER_SCAN_CAP = 400;

function git(root, args, opts = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
    ...opts,
  });
}

// ── what the sweep would commit ──────────────────────────────────────────────

/** { changed: [{path, isNew}], deleted: [path] } from `git status`, repo-relative. */
export function sweepCandidates(root) {
  const out = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const parts = out.split("\0");
  const changed = [];
  const deleted = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    const x = entry[0];
    const y = entry[1];
    const path = entry.slice(3);
    if (x === "R" || x === "C") {
      const from = parts[++i];
      if (x === "R" && from) deleted.push(from);
      changed.push({ path, isNew: true });
      continue;
    }
    if (x === "D" || y === "D") {
      deleted.push(path);
      continue;
    }
    changed.push({ path, isNew: x === "?" || x === "A" });
  }
  const keep = (p) => SOURCE_EXT.test(p) && !SKIP.test(p);
  return { changed: changed.filter((c) => keep(c.path)), deleted: deleted.filter(keep) };
}

/** Line numbers (1-based) a modified tracked file adds or changes relative to HEAD. */
function changedLines(root, path) {
  let diff = "";
  try {
    diff = git(root, ["diff", "-U0", "--no-color", "HEAD", "--", path]);
  } catch {
    return null; // unknown → treat the whole file as changed
  }
  const lines = new Set();
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    for (let l = start; l < start + count; l++) lines.add(l);
  }
  return lines;
}

// ── program ──────────────────────────────────────────────────────────────────

function compilerSetup(root) {
  const configPath = join(root, "tsconfig.json");
  let options = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    resolveJsonModule: true,
    esModuleInterop: true,
    types: [],
  };
  if (existsSync(configPath)) {
    // compilerOptions only: letting TypeScript expand `include` walks the whole tree (~60 s here).
    const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
    const { options: parsed } = ts.convertCompilerOptionsFromJson(config?.compilerOptions ?? {}, root, configPath);
    options = { ...parsed, noEmit: true, incremental: false, tsBuildInfoFile: undefined, composite: false };
  }
  // Ambient declarations (global.d.ts, next-env.d.ts, css/svg modules) are what make an asset
  // import resolve; without them every `import "./x.css"` would read as missing.
  let globals = [];
  try {
    globals = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.d.ts"])
      .split("\0")
      .filter((f) => f && !SKIP.test(f))
      .map((f) => resolve(root, f));
  } catch {
    globals = [];
  }
  for (const f of ["next-env.d.ts"]) if (existsSync(join(root, f))) globals.push(resolve(root, f));
  return { options, globals };
}

function resolveSpec(spec, fromFile, options, host) {
  const r = ts.resolveModuleName(spec, fromFile, options, host);
  return r.resolvedModule?.resolvedFileName ? resolve(r.resolvedModule.resolvedFileName) : null;
}

/** Every static module specifier a source text names (import/export/import()/require). */
function specifiersOf(file, text) {
  const kind = /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ spec: node.moduleSpecifier.text, node });
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      out.push({ spec: node.arguments[0].text, node });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { sf, specs: out };
}

/**
 * A local module reduced to its export surface: every exported name as `any` (value AND type, so
 * either kind of import resolves), every `export … from` kept verbatim. Members of these are `any`,
 * so the type-check backlog in our own code never reads as a held file — only names, modules and
 * @ai-matrx package types are judged.
 */
export function stubSource(file, text) {
  const kind = /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
  const names = new Set();
  const lines = [];
  let hasDefault = false;
  const mods = (n) => ts.getModifiers?.(n) ?? n.modifiers ?? [];
  const has = (n, k) => mods(n).some((m) => m.kind === k);
  const bind = (name) => {
    if (ts.isIdentifier(name)) names.add(name.text);
    else for (const el of name.elements ?? []) if (el.name) bind(el.name);
  };
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier) lines.push(st.getText(sf));
      else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          if (el.name.text === "default") hasDefault = true;
          else names.add(el.name.text);
        }
      }
    } else if (ts.isExportAssignment(st)) {
      hasDefault = true;
    } else if (has(st, ts.SyntaxKind.ExportKeyword)) {
      if (has(st, ts.SyntaxKind.DefaultKeyword)) hasDefault = true;
      else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) bind(d.name);
      else if (st.name && ts.isIdentifier(st.name)) names.add(st.name.text);
    }
  }
  for (const n of names) lines.push(`export declare const ${n}: any; export type ${n} = any;`);
  if (hasDefault) lines.push("declare const __matrx_stub_default: any; export default __matrx_stub_default;");
  if (lines.length === 0) lines.push("export {};");
  return lines.join("\n") + "\n";
}

function lineOf(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function nodeAt(sf, pos) {
  let found = null;
  const walk = (node) => {
    if (pos < node.getStart(sf) || pos >= node.getEnd()) return;
    found = node;
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
}

function declaredInMatrxPackage(type) {
  const types = type.isUnionOrIntersection?.() ? type.types : [type];
  for (const t of types) {
    for (const sym of [t.getSymbol?.(), t.aliasSymbol]) {
      for (const d of sym?.declarations ?? []) {
        const f = d.getSourceFile().fileName.split(sep).join("/");
        if (/\/node_modules\/(\.pnpm\/@ai-matrx\+[^/]+\/node_modules\/)?@ai-matrx\//.test(f)) return true;
      }
    }
  }
  return false;
}

function message(d) {
  return ts.flattenDiagnosticMessageText(d.messageText, " ").slice(0, 240);
}

// ── the classification ───────────────────────────────────────────────────────

export function classify(root) {
  root = resolve(root);
  const started = Date.now();
  const { changed, deleted } = sweepCandidates(root);
  const result = { hold: [], checked: changed.length, deletions: deleted.length, seconds: 0 };
  if (changed.length === 0 && deleted.length === 0) return result;

  const { options, globals } = compilerSetup(root);
  const abs = (p) => resolve(root, p);
  const rel = (p) => relative(root, p).split(sep).join("/");
  const swept = new Map(changed.map((c) => [abs(c.path), c]));
  const deletedAbs = new Set(deleted.map(abs));
  // Resolution that still SEES a file the sweep deletes, so "who imports it" can be answered.
  const ghostHost = { ...ts.sys, fileExists: (f) => deletedAbs.has(resolve(f)) || ts.sys.fileExists(f) };

  // Committed files that import a swept or deleted file (by path). Text pre-filter on the stem,
  // then real resolution, so `import x from "./kind-markdown-utils"` is only counted when it
  // resolves to THAT file.
  const importersOf = new Map(); // committed abs → [{ target, node-range }]
  const targets = [...swept.keys()].filter((f) => !swept.get(f).isNew).concat([...deletedAbs]);
  const stems = new Map();
  for (const t of targets) {
    let stem = basename(t).replace(SOURCE_EXT, "");
    if (stem === "index") stem = basename(dirname(t));
    if (!stems.has(stem)) stems.set(stem, []);
    stems.get(stem).push(t);
  }
  const resolutionCache = ts.createModuleResolutionCache(root, (x) => x, options);
  const resolveCached = (spec, from, host) => {
    const r = ts.resolveModuleName(spec, from, options, host, host === ts.sys ? resolutionCache : undefined);
    return r.resolvedModule?.resolvedFileName ? resolve(r.resolvedModule.resolvedFileName) : null;
  };
  // ONE `git grep` for every stem (a grep per stem was ~2 s of system time each): only files whose
  // TEXT names a specifier ending in a stem ("…/stem'" or "…/stem.ts\"") are opened.
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stemOf = new Map([...stems.keys()].map((st) => [st, new RegExp(`/${esc(st)}(\\.[cm]?[jt]sx?)?$`)]));
  let hits = [];
  if (stems.size) {
    const pats = [...stems.keys()].flatMap((st) => ["-e", `/${esc(st)}(\\.[cm]?[jt]sx?)?["']`]);
    try {
      hits = git(root, ["grep", "-l", "-z", "-E", ...pats, "--", "*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.mts"])
        .split("\0")
        .filter(Boolean);
    } catch {
      hits = [];
    }
  }
  for (const h of hits.slice(0, IMPORTER_SCAN_CAP * Math.max(1, stems.size))) {
    const habs = abs(h);
    if (swept.has(habs) || SKIP.test(h)) continue;
    let text;
    try {
      text = readFileSync(habs, "utf8");
    } catch {
      continue;
    }
    // Cheap first: quoted strings in the text that end in a stem AND resolve to a target. Only
    // then is the file parsed for the statement's position (most "./types" are someone else's).
    const wanted = new Set();
    for (const m of text.matchAll(/["']([^"'\n]+)["']/g)) {
      const spec = m[1];
      for (const [st, re] of stemOf) {
        if (!re.test(spec)) continue;
        const target = deletedAbs.size ? resolveSpec(spec, habs, options, ghostHost) : resolveCached(spec, habs, ts.sys);
        if (target && stems.get(st).includes(target)) wanted.add(spec);
      }
    }
    if (wanted.size === 0) continue;
    const { sf, specs } = specifiersOf(habs, text);
    for (const { spec, node } of specs) {
      if (!wanted.has(spec)) continue;
      const target = deletedAbs.size ? resolveSpec(spec, habs, options, ghostHost) : resolveCached(spec, habs, ts.sys);
      if (!importersOf.has(habs)) importersOf.set(habs, []);
      importersOf.get(habs).push({ target, start: node.getStart(sf), end: node.getEnd(), spec });
    }
  }

  const roots = [...new Set([...swept.keys(), ...importersOf.keys(), ...globals])].filter((f) => existsSync(f));
  // Every OTHER local source file is read as its export surface only (stubSource). Loading the
  // real closure pulled 12,379 files and took ~2 minutes; the surface keeps every name a file
  // exports (so a missing local export is still TS2305) and every `export … from` verbatim (so a
  // `export * from "@ai-matrx/…"` shim still reaches the real package), and imports nothing else.
  const realFiles = new Set(roots);
  const host = ts.createCompilerHost(options, true);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const rootPrefix = root + sep;
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const f = resolve(fileName);
    if (
      f.startsWith(rootPrefix) &&
      !realFiles.has(f) &&
      SOURCE_EXT.test(f) &&
      !/\.d\.[cm]?ts$/.test(f) &&
      !f.slice(rootPrefix.length).split(sep).includes("node_modules")
    ) {
      const text = host.readFile(fileName);
      if (text !== undefined) return ts.createSourceFile(fileName, stubSource(fileName, text), languageVersion, true);
    }
    return baseGetSourceFile(fileName, languageVersion, onError, shouldCreate);
  };
  const program = ts.createProgram({ rootNames: roots, options, host });
  const checker = program.getTypeChecker();
  const reasons = new Map(); // abs path → [reason]
  const hold = (f, why) => {
    if (!reasons.has(f)) reasons.set(f, []);
    reasons.get(f).push(why);
  };

  // 1. the swept files themselves
  for (const [f, c] of swept) {
    const sf = program.getSourceFile(f);
    if (!sf) continue;
    const lines = c.isNew ? null : changedLines(root, c.path);
    const counts = (pos) => lines === null || lines.has(lineOf(sf, pos));
    for (const d of program.getSyntacticDiagnostics(sf)) {
      if (d.start !== undefined && counts(d.start)) hold(f, `line ${lineOf(sf, d.start)}: does not parse — ${message(d)}`);
    }
    if (reasons.has(f)) continue;
    for (const d of program.getSemanticDiagnostics(sf)) {
      if (d.start === undefined || !counts(d.start)) continue;
      if (RESOLVE_CODES.has(d.code)) {
        hold(f, `line ${lineOf(sf, d.start)}: TS${d.code} ${message(d)}`);
      } else if (MEMBER_CODES.has(d.code)) {
        const node = nodeAt(sf, d.start);
        const access = node && (ts.isPropertyAccessExpression(node.parent) ? node.parent : null);
        if (access && declaredInMatrxPackage(checker.getTypeAtLocation(access.expression))) {
          hold(f, `line ${lineOf(sf, d.start)}: TS${d.code} ${message(d)} (the installed @ai-matrx package does not have it yet)`);
        }
      }
    }
  }

  // 2. committed importers broken by a swept change or a deletion → hold that swept file/deletion
  for (const [z, refs] of importersOf) {
    const sf = program.getSourceFile(z);
    if (!sf) continue;
    const diags = program.getSemanticDiagnostics(sf).filter((d) => RESOLVE_CODES.has(d.code) && d.start !== undefined);
    for (const ref of refs) {
      const bad = diags.find((d) => d.start >= ref.start && d.start < ref.end);
      if (bad) hold(ref.target, `committed ${rel(z)} line ${lineOf(sf, bad.start)} still needs it: TS${bad.code} ${message(bad)}`);
    }
  }

  // 3. closure — a swept file importing a held file; a deletion a held file's HEAD copy imports
  let grew = true;
  while (grew) {
    grew = false;
    for (const [f] of swept) {
      if (reasons.has(f)) continue;
      const sf = program.getSourceFile(f);
      if (!sf) continue;
      for (const { spec } of specifiersOf(f, sf.text).specs) {
        const t = resolveSpec(spec, f, options, ts.sys);
        if (t && reasons.has(t) && swept.has(t)) {
          hold(f, `imports ${rel(t)}, which is held`);
          grew = true;
          break;
        }
      }
    }
    for (const [f, c] of swept) {
      if (!reasons.has(f) || c.isNew) continue;
      let headText;
      try {
        headText = git(root, ["show", `HEAD:${c.path}`]);
      } catch {
        continue;
      }
      for (const { spec } of specifiersOf(f, headText).specs) {
        const t = resolveSpec(spec, f, options, ghostHost);
        if (t && deletedAbs.has(t) && !reasons.has(t)) {
          hold(t, `deletion held: the committed copy of held ${rel(f)} still imports it`);
          grew = true;
        }
      }
    }
  }

  result.hold = [...reasons].map(([f, why]) => ({ path: rel(f), reasons: why }));
  result.hold.sort((a, b) => a.path.localeCompare(b.path));
  result.seconds = Math.round((Date.now() - started) / 100) / 10;
  return result;
}

// ── self-test: every rule, separately, in a throwaway repo ───────────────────

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "sweep-resolves-"));
  const w = (p, text) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), text);
  };
  const g = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  try {
    // The INSTALLED package: agents as npm served it at 21:05 on 2026-10-07 (0.57.0) — the warm-up
    // controller has warmSession() and no currentScope().
    w("node_modules/@ai-matrx/agents/package.json", JSON.stringify({
      name: "@ai-matrx/agents", version: "0.57.0", type: "module",
      exports: { "./warmup": { types: "./dist/warmup.d.ts", default: "./dist/warmup.js" } },
    }));
    w("node_modules/@ai-matrx/agents/dist/warmup.d.ts",
      "export interface WarmupController { warmSession(orgId: string): void; }\nexport declare function createWarmup(): WarmupController;\n");
    w("node_modules/@ai-matrx/agents/dist/warmup.js", "export function createWarmup(){return{warmSession(){}}}\n");
    w(".gitignore", "node_modules/\n");
    w("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true, module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", allowJs: true, skipLibCheck: true, noEmit: true, types: [], baseUrl: ".", paths: { "@/*": ["./*"] } } }));
    w("lib/intake/fields.ts", "export const INTAKE_FIELDS = ['insurer', 'policyNumber'];\nexport const REQUIRED_FIELDS = ['insurer'];\n");
    w("lib/intake/legacy-form.ts", "export const LEGACY = 1;\n");
    w("lib/intake/insurers.ts", "export const INSURERS = ['Delta Dental', 'Cigna'];\n");
    // A local shim over the package (features/content-ir/kinds/kind-markdown-utils.ts, v0.4.2989).
    w("lib/intake/warmup-shim.ts", "export * from '@ai-matrx/agents/warmup';\n");
    w("features/intake/IntakeForm.ts", "import { INTAKE_FIELDS } from '@/lib/intake/fields';\nexport const fields = INTAKE_FIELDS;\n");
    w("features/intake/Summary.ts", "import { REQUIRED_FIELDS } from '@/lib/intake/fields';\nexport const required = REQUIRED_FIELDS;\n");
    w("features/intake/OldPanel.ts", "import { LEGACY } from '@/lib/intake/legacy-form';\nexport const old = LEGACY;\n");
    w("features/intake/broken-before.ts", "// a pre-existing error on an UNCHANGED line is not this sweep's to hold\nimport { gone } from '@/lib/intake/insurers';\nexport const x = gone;\n");
    g("init", "-q", "-b", "main");
    g("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
    g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");

    // The sweep candidates, one rule each.
    // R1 member on an @ai-matrx type (the WarmupHost crash)
    w("providers/WarmupHost.ts", "import { createWarmup } from '@ai-matrx/agents/warmup';\nconst w = createWarmup();\nexport const scope = w.currentScope();\n");
    // R2 named export the installed package does not ship
    w("features/intake/Prefetch.ts", "import { createWarmup, primeIntakeBundle } from '@ai-matrx/agents/warmup';\nexport const p = [createWarmup, primeIntakeBundle];\n");
    // R3 subpath the installed package does not export
    w("features/intake/Models.ts", "import { listModels } from '@ai-matrx/agents/models/react';\nexport const m = listModels;\n");
    // R4 does not parse
    w("features/intake/Rubber.ts", "export const band = { width: 3 \nexport const x = 1;\n");
    // R5 committed file imports a name a swept file removed
    w("lib/intake/fields.ts", "export const INTAKE_FIELDS = ['insurer', 'policyNumber', 'groupNumber'];\n");
    // R6 closure — a swept file importing a held swept file
    w("features/intake/UsesWarmup.ts", "import { scope } from '@/providers/WarmupHost';\nexport const s = scope;\n");
    // R7 deletion still imported by a committed file
    rmSync(join(dir, "lib/intake/legacy-form.ts"));
    // R2 through a committed local `export *` shim: the name must be judged in the PACKAGE behind it
    w("features/intake/PrefetchViaShim.ts", "import { primeIntakeBundle } from '@/lib/intake/warmup-shim';\nexport const p = primeIntakeBundle;\n");
    // Clean: a name a committed local module does export (read through its export surface)
    w("features/intake/Checkin.ts", "import { INSURERS } from '@/lib/intake/insurers';\nexport const accepted = INSURERS.length;\n");
    // Clean: a member that DOES exist, a changed line with no error, unrelated pre-existing error
    w("features/intake/Warm.ts", "import { createWarmup } from '@ai-matrx/agents/warmup';\ncreateWarmup().warmSession('org-harbor-dental');\nexport const ok = true;\n");
    w("features/intake/broken-before.ts", "// a pre-existing error on an UNCHANGED line is not this sweep's to hold\nimport { gone } from '@/lib/intake/insurers';\nexport const x = gone;\nexport const added = 2;\n");
    // A member error on OUR OWN type is the type-check backlog, not a package that is not served yet.
    w("features/intake/VisitNote.ts", "interface Visit { patient: string }\nconst visit: Visit = { patient: 'R. Alvarez' };\nexport const chart = visit.chartNumber;\n");

    const r = classify(dir);
    const held = new Map(r.hold.map((h) => [h.path, h.reasons.join(" | ")]));
    const expectHeld = {
      "providers/WarmupHost.ts": /currentScope/,
      "features/intake/Prefetch.ts": /primeIntakeBundle/,
      "features/intake/PrefetchViaShim.ts": /primeIntakeBundle/,
      "features/intake/Models.ts": /models\/react/,
      "features/intake/Rubber.ts": /does not parse/,
      "lib/intake/fields.ts": /Summary\.ts.*REQUIRED_FIELDS/,
      "features/intake/UsesWarmup.ts": /WarmupHost\.ts, which is held/,
      "lib/intake/legacy-form.ts": /OldPanel\.ts/,
    };
    const expectClear = ["features/intake/Warm.ts", "features/intake/broken-before.ts", "features/intake/VisitNote.ts", "features/intake/Checkin.ts"];
    const fails = [];
    for (const [p, re] of Object.entries(expectHeld)) {
      if (!held.has(p)) fails.push(`NOT HELD (rule missing): ${p}`);
      else if (!re.test(held.get(p))) fails.push(`HELD for the wrong reason: ${p} — ${held.get(p)}`);
    }
    for (const p of expectClear) if (held.has(p)) fails.push(`HELD but clean: ${p} — ${held.get(p)}`);
    for (const p of held.keys()) if (!(p in expectHeld) && !expectClear.includes(p)) fails.push(`unexpected hold: ${p}`);
    // Second input, different answer: the NEXT sync, after agents 0.58.0 reached npm. The three
    // files that only waited on the package go through; the rest stay held.
    w("node_modules/@ai-matrx/agents/dist/warmup.d.ts",
      "export interface WarmupController { warmSession(orgId: string): void; currentScope(): string; }\nexport declare function createWarmup(): WarmupController;\nexport declare const primeIntakeBundle: () => void;\n");
    const r2 = classify(dir);
    const held2 = r2.hold.map((h) => h.path).sort().join(",");
    const want2 = ["features/intake/Models.ts", "features/intake/Rubber.ts", "lib/intake/fields.ts", "lib/intake/legacy-form.ts"].join(",");
    if (held2 !== want2) fails.push(`after the package is served, held [${held2}] — expected [${want2}]`);
    if (fails.length) {
      console.error("check-sweep-resolves --self-test: RED\n  " + fails.join("\n  "));
      return 1;
    }
    console.log(`check-sweep-resolves --self-test: GREEN — 7 rules (+ a shim) each held their file, 4 clean files committed; once the package is served the 4 that waited on it go through (${r.seconds}s)`);
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── cli ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) process.exit(selfTest());
  const rootIdx = args.indexOf("--root");
  const root = rootIdx >= 0 ? args[rootIdx + 1] : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const r = classify(root);
    if (args.includes("--json")) {
      process.stdout.write(JSON.stringify(r) + "\n");
    } else {
      console.log(`check-sweep-resolves: ${r.checked} changed file(s), ${r.deletions} deletion(s), ${r.hold.length} would break the build (${r.seconds}s)`);
      for (const h of r.hold) console.log(`  HOLD ${h.path}\n       ${h.reasons.join("\n       ")}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`check-sweep-resolves: could not run — ${err?.stack ?? err}`);
    process.exit(2);
  }
}
