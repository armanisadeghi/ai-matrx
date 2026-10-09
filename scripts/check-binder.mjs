#!/usr/bin/env node
/**
 * check-binder.mjs — the BINDER-error twin of check-parse.mjs: fast, no program, no type resolution.
 *
 * THE CLASS (2026-10-05): `export const toastDoor` was declared TWICE in ../aidream/apps/shared/chat/src/host/ui-slots.tsx.
 * `pnpm check:parse` passed (two `const` statements are valid SYNTAX) while the build failed with TS2451
 * "Cannot redeclare block-scoped variable". The same family: an import of a name its target module does not
 * export (the 2026-09-25 createKindValidator outage, for relative paths), and two imports of one local name.
 *
 * WHAT IT REPORTS (one `ts.createSourceFile` per file + its own top-level scope walk):
 *   duplicate-declaration  two top-level declarations of one name in one file that TypeScript refuses
 *                          (TS2451 const/let, TS2393 two function bodies, TS2300 the rest). Overloads
 *                          (bodiless `function f()` heads), interface+interface, interface+class, enum+enum,
 *                          var+var and type-vs-value pairs (`type X` + `const X`) are legal and ignored.
 *   duplicate-import       one local name imported twice (TS2300).
 *   import-collides        an import whose local name is also a top-level value declaration (TS2440).
 *   missing-export         `import { X }` / `import X` from a RELATIVE or tsconfig-`paths` module whose target
 *                          file exists but exports no X. Follows `export *` chains inside the repo; anything it
 *                          cannot settle cheaply (package re-exports, `export =`, .d.ts, unresolvable target)
 *                          is counted as UNKNOWN and never reported.
 *   duplicate-default      two `export default` in one file.
 *
 * LOUD, NEVER BLOCKING: exits 0 with every finding printed, unless --strict. Items go out on the runner's
 * MATRX-ITEM protocol so `pnpm findings <files>` reports them for changed files.
 *
 * Usage:
 *   pnpm check:binder              # all tracked .ts/.tsx, exit 0
 *   pnpm check:binder --changed    # only files changed vs origin/main + worktree
 *   pnpm check:binder --strict     # exit 1 on any finding
 *   pnpm check:binder --self-test  # plant a duplicate export + a missing export: RED, then clean: GREEN
 *
 * Exit: 0 (advisory) · 1 findings under --strict · 3 self-test failed
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import ts from "typescript";

import { emitItem, endItems } from "./checks/items.mjs";
import { formatDurationMs } from "@ai-matrx/kit/format";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = process.argv.slice(2);

/* ── per-file analysis ───────────────────────────────────────────────────── */

const isDeclare = (node) => !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword);
const hasMod = (node, kind) => !!node.modifiers?.some((m) => m.kind === kind);

function bindingNames(name, out) {
  if (ts.isIdentifier(name)) out.push(name);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) if (ts.isBindingElement(el)) bindingNames(el.name, out);
  }
}

const V = 1; // value space
const T = 2; // type space

/** Parse one file into { decls, imports, exports } — everything the three rules need, no SourceFile kept. */
export function analyzeSource(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const decls = []; // { name, kind, space, hasBody, line }
  const imports = []; // { local, imported, spec, line, typeOnly }
  const ex = { names: new Set(), stars: [], unknownAll: file.endsWith(".d.ts"), defaults: [] };

  const addDecl = (id, kind, space, hasBody = false) =>
    decls.push({ name: id.text, kind, space, hasBody, line: lineOf(id) });

  for (const st of sf.statements) {
    const exported = hasMod(st, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasMod(st, ts.SyntaxKind.DefaultKeyword);

    if (ts.isImportDeclaration(st)) {
      const c = st.importClause;
      if (!c || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const spec = st.moduleSpecifier.text;
      if (c.name) imports.push({ local: c.name.text, imported: "default", spec, line: lineOf(c.name), typeOnly: c.isTypeOnly });
      const nb = c.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) imports.push({ local: nb.name.text, imported: null, spec, line: lineOf(nb.name), typeOnly: c.isTypeOnly });
      else if (nb)
        for (const el of nb.elements)
          imports.push({ local: el.name.text, imported: (el.propertyName ?? el.name).text, spec, line: lineOf(el.name), typeOnly: c.isTypeOnly || el.isTypeOnly });
    } else if (ts.isImportEqualsDeclaration(st)) {
      imports.push({ local: st.name.text, imported: null, spec: null, line: lineOf(st.name), typeOnly: st.isTypeOnly });
      if (exported) ex.names.add(st.name.text);
    } else if (ts.isVariableStatement(st)) {
      const block = (st.declarationList.flags & ts.NodeFlags.BlockScoped) !== 0;
      const ids = [];
      for (const d of st.declarationList.declarations) bindingNames(d.name, ids);
      for (const id of ids) {
        addDecl(id, block ? "block" : "var", V);
        if (exported) ex.names.add(id.text);
      }
    } else if (ts.isFunctionDeclaration(st)) {
      if (isDefault) ex.defaults.push(lineOf(st));
      if (st.name) {
        addDecl(st.name, "function", V, !!st.body);
        if (exported && !isDefault) ex.names.add(st.name.text);
      }
      if (isDefault) ex.names.add("default");
    } else if (ts.isClassDeclaration(st)) {
      if (isDefault) {
        ex.defaults.push(lineOf(st));
        ex.names.add("default");
      }
      if (st.name) {
        addDecl(st.name, "class", V | T);
        if (exported && !isDefault) ex.names.add(st.name.text);
      }
    } else if (ts.isEnumDeclaration(st)) {
      addDecl(st.name, "enum", V | T);
      if (exported) ex.names.add(st.name.text);
    } else if (ts.isInterfaceDeclaration(st)) {
      addDecl(st.name, "interface", T);
      if (exported) {
        ex.names.add(st.name.text);
        if (isDefault) ex.names.add("default");
      }
    } else if (ts.isTypeAliasDeclaration(st)) {
      addDecl(st.name, "type", T);
      if (exported) ex.names.add(st.name.text);
    } else if (ts.isModuleDeclaration(st)) {
      if (ts.isIdentifier(st.name) && exported) ex.names.add(st.name.text);
    } else if (ts.isExportDeclaration(st)) {
      const c = st.exportClause;
      if (!c) {
        if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) ex.stars.push(st.moduleSpecifier.text);
      } else if (ts.isNamespaceExport(c)) ex.names.add(c.name.text);
      else for (const el of c.elements) ex.names.add(el.name.text);
    } else if (ts.isExportAssignment(st)) {
      if (st.isExportEquals) ex.unknownAll = true;
      else {
        ex.names.add("default");
        ex.defaults.push(lineOf(st));
      }
    }
  }
  return { decls, imports, ex };
}

/** Do two same-name top-level declarations conflict? Returns the TS code, or null when legal. */
function conflict(a, b) {
  if (!(a.space & b.space)) return null; // `type X` + `const X` live in different spaces
  const kinds = [a.kind, b.kind];
  if (kinds.every((k) => k === "interface")) return null;
  if (kinds.includes("interface") && kinds.includes("class")) return null;
  if (kinds.every((k) => k === "enum")) return null;
  if (kinds.every((k) => k === "var")) return null;
  if (kinds.every((k) => k === "function")) return a.hasBody && b.hasBody ? 2393 : null;
  if (kinds.includes("block")) return 2451;
  return 2300;
}

export function declarationFindings(a) {
  const out = [];
  const seen = new Map(); // name -> [decl]
  for (const d of a.decls) {
    const prior = seen.get(d.name) ?? [];
    for (const p of prior) {
      const code = conflict(p, d);
      if (code) {
        out.push({
          rule: "duplicate-declaration",
          name: d.name,
          line: d.line,
          title: `TS${code}: \`${d.name}\` is declared twice at top level (${p.kind} line ${p.line}, ${d.kind} line ${d.line})`,
        });
        break;
      }
    }
    prior.push(d);
    seen.set(d.name, prior);
  }
  const imported = new Map();
  for (const im of a.imports) {
    const first = imported.get(im.local);
    if (first) {
      out.push({ rule: "duplicate-import", name: im.local, line: im.line, title: `TS2300: \`${im.local}\` is imported twice (lines ${first.line} and ${im.line})` });
    } else imported.set(im.local, im);
  }
  for (const [name, im] of imported) {
    const local = (seen.get(name) ?? []).find((d) => d.space & V && !im.typeOnly);
    if (local) {
      out.push({
        rule: "import-collides",
        name,
        line: im.line,
        title: `TS2440: import \`${name}\` collides with the top-level ${local.kind} declaration at line ${local.line}`,
      });
    }
  }
  if (a.ex.defaults.length > 1) {
    out.push({ rule: "duplicate-default", name: "default", line: a.ex.defaults[1], title: `TS2528: more than one \`export default\` (lines ${a.ex.defaults.join(", ")})` });
  }
  return out;
}

/* ── module resolution (tsconfig paths + relative, over a file set — no fs probing) ── */

const TS_EXT = [".ts", ".tsx", ".d.ts"];

function loadPathMappings(root) {
  const cfg = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
  const paths = cfg.config?.compilerOptions?.paths ?? {};
  return Object.entries(paths)
    .filter(([pat]) => pat.endsWith("/*") && pat !== "/*")
    .map(([pat, targets]) => ({ prefix: pat.slice(0, -1), targets: targets.map((t) => t.replace(/\*$/, "").replace(/^\.\//, "")) }))
    .sort((x, y) => y.prefix.length - x.prefix.length);
}

/**
 * @returns {string|null|"skip"} repo-relative target file; "skip" = a real non-TS file (css, json, svg…);
 * null = could not resolve (package, generated file, unmapped alias) — UNKNOWN, never a finding.
 */
function makeResolver(fileSet, mappings) {
  const tryBase = (base) => {
    base = posix.normalize(base);
    if (fileSet.has(base)) return /\.(ts|tsx)$/.test(base) ? base : "skip";
    const swapped = base.replace(/\.(m?js|jsx)$/, "");
    for (const b of swapped !== base ? [swapped, base] : [base]) {
      for (const e of TS_EXT) if (fileSet.has(b + e)) return b + e;
      for (const e of TS_EXT) if (fileSet.has(`${b}/index${e}`)) return `${b}/index${e}`;
    }
    return null;
  };
  const resolve_ = (spec, fromRel) => {
    if (spec.startsWith(".")) return tryBase(posix.join(posix.dirname(fromRel), spec));
    const m = mappings.find((x) => spec.startsWith(x.prefix));
    if (!m) return null;
    const rest = spec.slice(m.prefix.length);
    for (const t of m.targets) {
      const r = tryBase(t + rest);
      if (r) return r;
    }
    return null;
  };
  resolve_.isLocal = (spec) => spec.startsWith(".") || mappings.some((x) => spec.startsWith(x.prefix));
  return resolve_;
}

/* ── the analyzer (lazy, cached) ─────────────────────────────────────────── */

export function createAnalyzer({ root, files, read }) {
  const fileSet = new Set(files);
  const resolveSpec = makeResolver(fileSet, loadPathMappings(root));
  const cache = new Map();
  const analyze = (rel) => {
    if (cache.has(rel)) return cache.get(rel);
    let a = null;
    try {
      a = analyzeSource(rel, read(rel));
    } catch {
      a = null; // deleted between listing and read
    }
    cache.set(rel, a);
    return a;
  };
  /** "yes" | "no" | "unknown" */
  const hasExport = (rel, name, seen = new Set()) => {
    if (seen.has(rel)) return "no";
    seen.add(rel);
    const a = analyze(rel);
    if (!a) return "unknown";
    if (a.ex.unknownAll || a.ex.names.has(name)) return a.ex.unknownAll ? "unknown" : "yes";
    let unknown = false;
    if (name !== "default") {
      for (const spec of a.ex.stars) {
        const t = resolveSpec(spec, rel);
        if (!t || t === "skip") {
          unknown = true;
          continue;
        }
        const r = hasExport(t, name, seen);
        if (r === "yes") return "yes";
        if (r === "unknown") unknown = true;
      }
    }
    return unknown ? "unknown" : "no";
  };
  const check = (rel) => {
    const a = analyze(rel);
    if (!a) return { findings: [], unknown: 0, checked: 0 };
    const findings = declarationFindings(a);
    let unknown = 0;
    let checked = 0;
    for (const im of a.imports) {
      if (!im.spec || im.imported === null) continue;
      const t = resolveSpec(im.spec, rel);
      if (t === "skip") continue;
      if (!t) {
        if (resolveSpec.isLocal(im.spec)) unknown += 1;
        continue;
      }
      const r = hasExport(t, im.imported);
      if (r === "unknown") unknown += 1;
      else {
        checked += 1;
        if (r === "no") {
          findings.push({
            rule: "missing-export",
            name: im.imported,
            spec: im.spec,
            line: im.line,
            title: `\`${im.imported}\` is not exported by ${im.spec} (${t})`,
          });
        }
      }
    }
    return { findings, unknown, checked };
  };
  /** Parse many files across worker threads (the parse is the whole cost); fills the cache. */
  const prewarm = async (rels) => {
    const n = Math.min(8, availableParallelism());
    const chunks = Array.from({ length: n }, (_, i) => rels.filter((_, j) => j % n === i));
    await Promise.all(
      chunks.map(
        (chunk) =>
          new Promise((res, rej) => {
            const w = new Worker(fileURLToPath(import.meta.url), { workerData: { root, chunk } });
            w.on("message", (list) => {
              for (const [rel, a] of list) {
                if (a) a.ex.names = new Set(a.ex.names);
                cache.set(rel, a);
              }
            });
            w.on("error", rej);
            w.on("exit", res);
          }),
      ),
    );
  };
  return { check, analyze, prewarm };
}

if (!isMainThread && workerData?.chunk) {
  const out = workerData.chunk.map((rel) => {
    try {
      const a = analyzeSource(rel, readFileSync(resolve(workerData.root, rel), "utf8"));
      return [rel, { ...a, ex: { ...a.ex, names: [...a.ex.names] } }];
    } catch {
      return [rel, null];
    }
  });
  parentPort.postMessage(out);
}

/* ── file sets ───────────────────────────────────────────────────────────── */

const git = (args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 << 20 }).split("\n").filter(Boolean);

const isTs = (f) => /\.tsx?$/.test(f) && !f.includes("node_modules/");

function targetFiles(allFiles) {
  const narrowed = (() => {
    try {
      return JSON.parse(process.env.MATRX_FINDINGS_PATHS ?? "null");
    } catch {
      return null;
    }
  })();
  if (narrowed?.length) {
    return { files: allFiles.filter((f) => isTs(f) && narrowed.some((p) => p === "" || f === p || f.startsWith(`${p}/`))), partial: true };
  }
  if (!ARGS.includes("--changed")) return { files: git(["ls-files", "*.ts", "*.tsx"]).filter(isTs), partial: false };
  const base = (() => {
    try {
      return git(["merge-base", "HEAD", "origin/main"])[0];
    } catch {
      return "HEAD";
    }
  })();
  const set = new Set([
    ...git(["diff", "--name-only", "--diff-filter=ACMR", base]),
    ...git(["diff", "--name-only", "--diff-filter=ACMR"]),
    ...git(["diff", "--name-only", "--diff-filter=ACMR", "--cached"]),
    ...git(["ls-files", "--others", "--exclude-standard"]),
  ]);
  return { files: [...set].filter(isTs), partial: true };
}

/* ── self-test ───────────────────────────────────────────────────────────── */

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "check-binder-"));
  try {
    mkdirSync(join(dir, "lib"), { recursive: true });
    const put = (rel, body) => writeFileSync(join(dir, rel), body);
    put("tsconfig.json", "{}");
    put("lib/a.ts", "export const real = 1;\nexport function over(a: string): void;\nexport function over(a: number): void;\nexport function over(a: any) {}\nexport interface Dual {}\nexport const Dual = 1;\n");
    put("lib/barrel.ts", 'export * from "./a";\n');
    const files = ["lib/a.ts", "lib/barrel.ts"];

    const dup = "planted-dup.ts";
    put(dup, 'export const toastDoor = 1;\nexport const toastDoor = 2;\n');
    const miss = "planted-missing.ts";
    put(miss, 'import { real, absent } from "./lib/a";\nimport { viaStar, real as r2 } from "./lib/barrel";\nexport const x = [real, absent, viaStar, r2];\n');
    const clean = "clean.ts";
    put(clean, 'import { real, over, Dual } from "./lib/a";\nimport { real as viaBarrel } from "./lib/barrel";\nexport const toastDoor = [real, over, Dual, viaBarrel];\nexport function f(a: string): void;\nexport function f(a: number): void;\nexport function f(a: any) {}\n');
    const all = [...files, dup, miss, clean];
    const an = createAnalyzer({ root: dir, files: all, read: (rel) => readFileSync(join(dir, rel), "utf8") });

    const results = [];
    const ok = (name, pass) => results.push({ name, pass });
    const d = an.check(dup).findings;
    ok("RED: two `export const toastDoor` is reported as duplicate-declaration (TS2451)", d.length === 1 && d[0].rule === "duplicate-declaration" && d[0].title.startsWith("TS2451"));
    const m = an.check(miss).findings.filter((f) => f.rule === "missing-export");
    ok("RED: an import of a name the target does not export is reported", m.some((f) => f.name === "absent"));
    ok("a name that DOES exist (directly, or through `export *`) is not reported", !m.some((f) => f.name === "real") && m.some((f) => f.name === "viaStar") === true);
    const c = an.check(clean);
    ok("GREEN: the clean file (overloads, type+value merge, barrel import) reports nothing", c.findings.length === 0 && c.checked >= 3);
    const imp = analyzeSource("i.ts", 'import { a } from "x";\nimport { a } from "y";\nconst b = 1;\nimport { b } from "z";\n');
    const f2 = declarationFindings(imp).map((f) => f.rule).sort();
    ok("duplicate-import and import-collides are reported", f2.includes("duplicate-import") && f2.includes("import-collides"));
    for (const r of results) console.log(`  ${r.pass ? "✓" : "✗"} ${r.name}`);
    return results.every((r) => r.pass);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ── main ────────────────────────────────────────────────────────────────── */

async function main() {
  if (ARGS.includes("--self-test")) {
    console.log("[binder] self-test — duplicate top-level declaration (2026-10-05 toastDoor) + missing named export:");
    const ok = selfTest();
    console.log(ok ? "[binder] self-test PASSED — red on the planted defects, green on the clean file." : "[binder] self-test FAILED — this guard no longer catches the original defect.");
    process.exit(ok ? 0 : 3);
  }

  const started = Date.now();
  const allFiles = git(["ls-files", "-co", "--exclude-standard"]);
  const { files, partial } = targetFiles(allFiles);
  const an = createAnalyzer({ root: ROOT, files: allFiles, read: (rel) => readFileSync(resolve(ROOT, rel), "utf8") });

  await an.prewarm(files);
  const findings = [];
  let unknown = 0;
  let checked = 0;
  for (const file of files) {
    const r = an.check(file);
    unknown += r.unknown;
    checked += r.checked;
    for (const f of r.findings) findings.push({ file, ...f });
  }

  const seenKeys = new Set();
  for (const f of findings) {
    const key = `${f.rule}|${f.file}|${f.name}${f.spec ? `|${f.spec}` : ""}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    emitItem({ key, status: "new", title: f.title, file: f.file, line: f.line, rule: f.rule });
  }
  if (!partial) endItems();

  const elapsed = formatDurationMs(Date.now() - started, { style: "compact" });
  const summary = `${files.length} file(s), ${checked} named import(s) verified against their target, ${unknown} import(s) UNKNOWN (unresolvable or opaque re-export — never a finding), ${elapsed}`;
  if (findings.length === 0) {
    console.log(`[binder] OK — no binder errors. ${summary}.`);
    return;
  }
  console.log(`\n[binder] ${findings.length} BINDER ERROR(S) — each one fails \`next build\` / type-check while \`check:parse\` stays green. ${summary}.\n`);
  for (const f of findings) console.log(`  ${f.file}:${f.line}  [${f.rule}] ${f.title}`);
  console.log("");
  if (ARGS.includes("--strict")) process.exit(1);
}

if (isMainThread && import.meta.url === `file://${process.argv[1]}`) await main();
