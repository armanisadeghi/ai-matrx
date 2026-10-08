#!/usr/bin/env node
// check-package-imports-resolve — THE FAST LAYER: every `@ai-matrx/<pkg>[/<subpath>]` import in app
// source (and in the installed @ai-matrx packages' own dist) resolves in the INSTALLED published
// version. Seconds, offline, regex + the package's own `exports` map — no TypeScript program.
//
// THE CLASS (5+ outages in 2 days, 2026-10-05..07; every route 500s on the dev server AND on Vercel):
//   • the app imported `@ai-matrx/chat/canvas/workspace/side-chat-address` before that chat version
//     was published; a sweep commits app changes seconds before the package publishes;
//   • the app imported `PERMISSION_LEVEL_HINTS` / `FORMULA_FUNCTIONS` before the packages shipped them;
//   • chat 0.4.18 published importing an `@ai-matrx/alchemy` subpath alchemy 0.20.6 lacks (the
//     installed graph is broken even though no app line is wrong).
//
//   • 2026-10-08, v0.4.3016: features/html-pages/capture/renderedCapture.ts did `await import("html-to-image")`.
//     html-to-image is NOT in package.json — it resolved on every dev machine only because .npmrc has
//     shamefully-hoist=true and @ai-matrx/alchemy depends on it. On Vercel: "Module not found: Can't
//     resolve 'html-to-image'", and v0.4.3016 failed on all three Vercel projects (check 4).
//
// FOUR CHECKS (each fails on its own; `--self-test` proves each separately):
//   1. SUBPATH   — the specifier's subpath is in the installed package's `exports` map and the mapped
//                  file exists on disk.
//   2. NAMED     — for `import { a, b as c } from "…"` / `export { a } from "…"`: when the target's
//                  export names are FULLY readable (explicit exports + relative `export *` chains),
//                  every imported name must be among them. A target it cannot fully read is skipped
//                  here — `pnpm check:matrx-imports` (TypeScript checker, minutes under load) owns that.
//   3. GRAPH     — every `@ai-matrx/<dep>[/subpath]` that an installed @ai-matrx package's dist imports
//                  must resolve in the <dep> installed beside it (subpath level).
//   4. DECLARED  — every bare specifier in app source (static import / export-from, `import("…")`,
//                  `require("…")`; `import type` skipped) names a package in the root package.json
//                  (dependencies, devDependencies, optionalDependencies, peerDependencies), or is a Node
//                  builtin, a tsconfig `paths` alias, or a relative/absolute path. A package that is only
//                  hoisted into node_modules is NOT declared — it works here and breaks the Vercel build.
//                  Remedy: declare the dependency, or (for formats/copy/export) go through the
//                  @ai-matrx/alchemy door. Baseline (shrink-only): scripts/package-imports-declared-baseline.json.
//
//   node scripts/check-package-imports-resolve.mjs              # exit 1 on a broken import
//   node scripts/check-package-imports-resolve.mjs --root DIR   # audit another tree (git or plain)
//   node scripts/check-package-imports-resolve.mjs --no-graph   # app source only
//   node scripts/check-package-imports-resolve.mjs --update-baseline  # shrink the declared baseline (never grows it)
//   node scripts/check-package-imports-resolve.mjs --self-test  # RED per rule, then GREEN
//
// Exit: 0 clean · 1 a broken import · 2 the script could not run (never a silent pass).
// Remedy: the consumer shipped before the package — publish the package, then
// `pnpm sync:matrx-packages` (waits for tarballs) and commit the lockfile. Never pin, never delete the
// import to go green.

import { execFileSync } from "node:child_process";
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_EXT = /\.(?:[cm]?[jt]sx?)$/;
// guard scripts and fixtures quote import statements inside strings; they are not app imports
const EXCLUDED = /^(?:scripts|migrations|docs)\/|\/(?:__fixtures__|fixtures|judgment-corpus)\//;
const SKIP_DIR = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo", "coverage", "tmp", "out"]);
const SPEC = String.raw`(@ai-matrx\/[A-Za-z0-9._-]+(?:\/[^"'\`\s]*)?)`;
const FROM_RE = new RegExp(String.raw`^[ \t]*(import|export)\s+(type\s+)?(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}|\*\s*(?:as\s+[\w$]+)?|([\w$]+))?\s*(?:from\s*)?["']${SPEC}["']`, "gm");
const DYN_RE = new RegExp(String.raw`(?:\bimport|\brequire)\s*\(\s*["']${SPEC}["']\s*\)`, "g");
const BARE_RE = new RegExp(String.raw`^[ \t]*import\s*["']${SPEC}["']`, "gm");

const die = (m) => { console.error(`[package-imports-resolve] CANNOT RUN: ${m}`); process.exit(2); };

function listFiles(root) {
  try {
    return execFileSync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] })
      .split("\0").filter((f) => f && SRC_EXT.test(f) && !f.split("/").some((p) => p === "node_modules"))
      .filter((f) => !EXCLUDED.test(f) && existsSync(path.join(root, f)));
  } catch {
    const out = [];
    const walk = (d) => { for (const n of readdirSync(d)) { if (SKIP_DIR.has(n)) continue; const p = path.join(d, n); const s = statSync(p); if (s.isDirectory()) walk(p); else if (SRC_EXT.test(n)) out.push(path.relative(root, p)); } };
    walk(root);
    return out;
  }
}

// ── installed package location (node resolution: nearest node_modules walking up) ──
const pkgCache = new Map();
function locate(fromDir, pkgName, stopAt) {
  let dir = fromDir;
  for (;;) {
    const cand = path.join(dir, "node_modules", ...pkgName.split("/"));
    if (existsSync(path.join(cand, "package.json"))) return cand;
    if ((stopAt && dir === stopAt) || path.dirname(dir) === dir) return null;
    dir = path.dirname(dir);
  }
}
function readPkg(dir) {
  if (!pkgCache.has(dir)) pkgCache.set(dir, JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")));
  return pkgCache.get(dir);
}

function pickTarget(node, conds) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) { for (const n of node) { const t = pickTarget(n, conds); if (t) return t; } return null; }
  if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) if (conds.includes(k)) { const t = pickTarget(v, conds); if (t) return t; }
  return null;
}
// the declaration file for a conditional target: {types} directly, or nested under import/default/require.
function typesOf(node) {
  if (typeof node === "string") return node.includes(".d.") ? node : null;
  if (Array.isArray(node)) { for (const n of node) { const t = typesOf(n); if (t) return t; } return null; }
  if (node && typeof node === "object") {
    if (typeof node.types === "string") return node.types;
    for (const k of ["import", "default", "require", "node"]) if (node[k]) { const t = typesOf(node[k]); if (t) return t; }
  }
  return null;
}
function resolveSub(manifest, sub) {
  const key = sub ? `.${sub}` : ".";
  const exp = manifest.exports;
  if (exp === undefined) return key === "." ? { files: [manifest.types, manifest.module, manifest.main, "index.js"].filter(Boolean) } : { missing: "has no exports map, so no subpaths" };
  const map = typeof exp === "string" || Array.isArray(exp) || !Object.keys(exp).some((k) => k.startsWith(".")) ? { ".": exp } : exp;
  let node = map[key]; let star = null;
  if (node === undefined) {
    for (const k of Object.keys(map)) {
      const i = k.indexOf("*"); if (i < 0) continue;
      const pre = k.slice(0, i); const post = k.slice(i + 1);
      if (key.startsWith(pre) && key.endsWith(post) && key.length >= k.length - 1) { node = map[k]; star = key.slice(pre.length, key.length - post.length); break; }
    }
  }
  if (node === undefined || node === null) return { missing: `does not export "${key}"` };
  const fix = (t) => (t && star !== null ? t.replaceAll("*", star) : t);
  const types = fix(typesOf(node));
  const runtime = fix(pickTarget(node, ["import", "default", "require", "node"]));
  const files = [types, runtime].filter(Boolean);
  if (!files.length) return { missing: `exports "${key}" with no usable target` };
  return { files, hasTypes: Boolean(types) };
}

// ── the vocabulary of a module (null = not fully readable) ──
// A name an import wants is only "missing" when it appears NOWHERE in the module's declaration text
// and its relative `export *` closure — precision over recall: multi-declarator `export declare const a: X, b: Y`,
// destructured slice actions and re-exports all count as present, so a finding is a name the package
// genuinely does not mention. (The TypeScript-checker twin, `check:matrx-imports`, owns exact answers.)
function exportNames(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  if (/module\.exports|__exportStar|__export\(/.test(text)) return null; // CJS shape: not statically certain
  const names = new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? []);
  for (const m of text.matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
    const spec = m[1];
    if (!spec.startsWith(".")) return null; // star from another package: unreadable here
    const base = path.resolve(path.dirname(file), spec);
    const dts = [base.replace(/\.[cm]?js$/, ".d.ts"), `${base}.d.ts`, path.join(base, "index.d.ts")];
    const js = [base, `${base}.js`, path.join(base, "index.js")];
    const cands = file.endsWith(".d.ts") || file.endsWith(".d.mts") ? [...dts, ...js] : [...js, ...dts];
    const next = cands.find((c) => existsSync(c) && statSync(c).isFile());
    if (!next) return null;
    const sub = exportNames(next, seen);
    if (!sub) return null;
    for (const n of sub) names.add(n);
  }
  return names;
}

function parseImports(text) {
  const out = [];
  const lineOf = (i) => text.slice(0, i).split("\n").length;
  for (const m of text.matchAll(FROM_RE)) {
    const names = [];
    if (m[3]) names.push("default");
    if (m[5]) names.push("default");
    if (m[4] !== undefined) for (const part of m[4].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").split(",")) { const p = part.trim().replace(/^type\s+/, ""); if (p) names.push(p.split(/\s+as\s+/)[0].trim()); }
    out.push({ spec: m[6], names, line: lineOf(m.index) });
  }
  for (const re of [DYN_RE, BARE_RE]) for (const m of text.matchAll(re)) out.push({ spec: m[1], names: [], line: lineOf(m.index) });
  return out;
}

function splitSpec(spec) {
  const m = /^(@ai-matrx\/[^/]+)(\/.*)?$/.exec(spec);
  return m ? { pkg: m[1], sub: m[2] ?? "" } : null;
}

export function audit({ root, graph = true }) {
  root = path.resolve(root);
  const findings = []; const resolvedCache = new Map();
  let imports = 0; let skippedWorkspace = 0;

  const checkOne = (importerAbs, importerLabel, imp, stopAt, namedAllowed) => {
    const sp = splitSpec(imp.spec); if (!sp) return;
    imports += 1;
    const dir = locate(path.dirname(importerAbs), sp.pkg, stopAt);
    if (!dir) { findings.push(`${importerLabel}:${imp.line} imports "${imp.spec}" but ${sp.pkg} is not installed here`); return; }
    if (!realpathSync(dir).includes(`${path.sep}node_modules${path.sep}`)) { skippedWorkspace += 1; return; } // workspace source link
    const manifest = readPkg(dir);
    const ck = `${dir}|${sp.sub}`;
    if (!resolvedCache.has(ck)) {
      const r = resolveSub(manifest, sp.sub);
      if (r.missing) resolvedCache.set(ck, { missing: r.missing });
      else {
        const abs = r.files.map((f) => path.join(dir, f.replace(/^\.\//, ""))).filter((f) => existsSync(f));
        resolvedCache.set(ck, abs.length ? { abs, hasTypes: r.hasTypes } : { missing: `maps "${sp.sub || "."}" to ${r.files.join(" / ")}, which is not in the installed package` });
      }
    }
    const r = resolvedCache.get(ck);
    if (r.missing) { findings.push(`${importerLabel}:${imp.line} imports "${imp.spec}" but installed ${sp.pkg}@${manifest.version} ${r.missing}`); return; }
    if (!namedAllowed || !imp.names.length || !r.hasTypes) return; // names are only trusted from a declaration file
    const nk = `${ck}|names`;
    if (!resolvedCache.has(nk)) { let names = null; for (const f of r.abs) { names = exportNames(f); if (names) break; } resolvedCache.set(nk, names); }
    const names = resolvedCache.get(nk);
    if (!names) return;
    for (const n of imp.names) if (!names.has(n)) findings.push(`${importerLabel}:${imp.line} imports { ${n} } from "${imp.spec}" but installed ${sp.pkg}@${manifest.version} does not export "${n}" there`);
  };

  // 1+2: app source
  for (const rel of listFiles(root)) {
    const abs = path.join(root, rel);
    let text; try { text = readFileSync(abs, "utf8"); } catch { continue; }
    if (!text.includes("@ai-matrx/")) continue;
    for (const imp of parseImports(text)) checkOne(abs, rel, imp, root, true);
  }

  // 3: installed @ai-matrx packages' own dist → the sibling installed beside them (subpath level)
  let graphPkgs = 0;
  if (graph) {
    const scope = path.join(root, "node_modules", "@ai-matrx");
    if (existsSync(scope)) {
      for (const name of readdirSync(scope)) {
        const link = path.join(scope, name);
        let real; try { real = realpathSync(link); } catch { continue; }
        if (!real.includes(`${path.sep}node_modules${path.sep}`)) continue;
        graphPkgs += 1;
        const own = `@ai-matrx/${name}`;
        const walk = (d) => { for (const n of readdirSync(d)) { if (n === "node_modules") continue; const p = path.join(d, n); const s = lstatSync(p); if (s.isDirectory()) walk(p); else if (/\.(?:js|mjs|cjs|d\.ts|d\.mts|d\.cts)$/.test(n)) scanDist(p); } };
        const scanDist = (p) => {
          const text = readFileSync(p, "utf8"); if (!text.includes("@ai-matrx/")) return;
          for (const imp of parseImports(text)) {
            const sp = splitSpec(imp.spec); if (!sp || sp.pkg === own) continue;
            checkOne(p, `${own}@${readPkg(real).version}/${path.relative(real, p)}`, imp, null, true);
          }
        };
        walk(real);
      }
    }
  }
  return { findings: [...new Set(findings)], imports, skippedWorkspace, graphPkgs };
}

// ── 4: DECLARED — a bare specifier must name a package.json dependency (hoisting is not a declaration) ──
const ANY_FROM_RE = /^[ \t]*(import|export)\s+(type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s*(?:as\s+[\w$]+)?|[\w$]+)\s*from\s*["']([^"'\n]+)["']/gm;
const ANY_DYN_RE = /(?:(?<![\w$.])import|(?<![\w$.])require)\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
const ANY_BARE_RE = /^[ \t]*import\s*["']([^"'\n]+)["']/gm;
const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, "").split("/")[0]));

function stripJsonc(t) {
  let out = ""; let i = 0; let str = false;
  while (i < t.length) {
    const c = t[i];
    if (str) { out += c; if (c === "\\") { out += t[i + 1] ?? ""; i += 2; continue; } if (c === '"') str = false; i += 1; continue; }
    if (c === '"') { str = true; out += c; i += 1; continue; }
    if (c === "/" && t[i + 1] === "/") { while (i < t.length && t[i] !== "\n") i += 1; continue; }
    if (c === "/" && t[i + 1] === "*") { i += 2; while (i < t.length && !(t[i] === "*" && t[i + 1] === "/")) i += 1; i += 2; continue; }
    out += c; i += 1;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

function declaredContext(root) {
  const pj = path.join(root, "package.json");
  if (!existsSync(pj)) return null;
  const j = JSON.parse(readFileSync(pj, "utf8"));
  const declared = new Set();
  for (const k of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) for (const n of Object.keys(j[k] ?? {})) declared.add(n);
  const aliases = [];
  const tj = path.join(root, "tsconfig.json");
  if (existsSync(tj)) {
    try {
      const c = JSON.parse(stripJsonc(readFileSync(tj, "utf8"))).compilerOptions ?? {};
      for (const k of Object.keys(c.paths ?? {})) aliases.push(k.endsWith("*") ? { prefix: k.slice(0, -1) } : { exact: k });
    } catch { die("tsconfig.json is not parseable for the DECLARED check"); }
  }
  return { declared, aliases };
}

export function packageOf(spec) {
  if (spec.startsWith("@")) { const [s, n] = spec.split("/"); return n ? `${s}/${n}` : null; }
  return spec.split("/")[0];
}

function undeclaredIn(text, ctx) {
  const out = [];
  const lineOf = (i) => text.slice(0, i).split("\n").length;
  const seen = (spec, index) => {
    const ls = text.lastIndexOf("\n", index - 1) + 1;
    const before = text.slice(ls, index);
    if (/^\s*(?:\*|\/\/|\/\*)/.test(before) || /\/\/|\/\*/.test(before)) return; // quoted inside a comment, not an import
    if (spec.startsWith(".") || spec.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(spec) && !spec.startsWith("node:")) return;
    if (spec.startsWith("node:")) return;
    if (ctx.aliases.some((a) => (a.exact ? spec === a.exact : spec.startsWith(a.prefix)))) return;
    const pkg = packageOf(spec);
    if (!pkg || ctx.declared.has(pkg) || BUILTINS.has(pkg)) return;
    out.push({ pkg, spec, line: lineOf(index) });
  };
  for (const m of text.matchAll(ANY_FROM_RE)) if (!m[2]) seen(m[3], m.index);
  for (const m of text.matchAll(ANY_DYN_RE)) seen(m[1], m.index);
  for (const m of text.matchAll(ANY_BARE_RE)) seen(m[1], m.index);
  return out;
}

export function auditDeclared({ root }) {
  root = path.resolve(root);
  const ctx = declaredContext(root);
  if (!ctx) return { findings: [], scanned: 0, skipped: true };
  const findings = []; let scanned = 0;
  for (const rel of listFiles(root)) {
    if (rel.startsWith(".scratch/")) continue; // untracked-by-design scratch, never built
    let text; try { text = readFileSync(path.join(root, rel), "utf8"); } catch { continue; }
    scanned += 1;
    for (const f of undeclaredIn(text, ctx)) findings.push({ file: rel, pkg: f.pkg, line: f.line, spec: f.spec });
  }
  return { findings, scanned };
}

const BASELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "package-imports-declared-baseline.json");
function readBaseline() { return existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {}; }
// the baseline is keyed file -> [undeclared package names]; line numbers drift, names do not
function groupByFile(findings) { const g = {}; for (const f of findings) (g[f.file] ??= new Set()).add(f.pkg); return g; }

function selfTest() {
  const work = mkdtempSync(path.join(tmpdir(), "pkg-imports-resolve-"));
  try {
    const mk = (rootName, files, installed) => {
      const root = path.join(work, rootName); mkdirSync(root, { recursive: true });
      for (const [rel, body] of Object.entries(files)) { const p = path.join(root, rel); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, body); }
      for (const [pkg, spec] of Object.entries(installed)) {
        // a real directory under a ".pnpm"-style path so realpath contains node_modules
        const dir = path.join(root, "node_modules", ".pnpm", `${pkg.replace("/", "+")}@1.0.0`, "node_modules", ...pkg.split("/"));
        mkdirSync(dir, { recursive: true });
        for (const [rel, body] of Object.entries(spec.files)) { const p = path.join(dir, rel); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, body); }
        writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: pkg, version: "1.0.0", exports: spec.exports }));
        const link = path.join(root, "node_modules", ...pkg.split("/")); mkdirSync(path.dirname(link), { recursive: true });
        symlinkSync(dir, link);
      }
      return root;
    };
    const alchemy = { exports: { ".": "./dist/index.js", "./react": { types: "./dist/react.d.ts", default: "./dist/react.js" } }, files: { "dist/index.js": "export const a = 1;\n", "dist/react.js": "export const useA = 1;\n", "dist/react.d.ts": "export declare const useA: number;\nexport * from './more';\n", "dist/more.d.ts": "export declare const extra: number;\n" } };
    const cases = [
      ["clean", { "app/x.ts": 'import { useA, extra } from "@ai-matrx/alchemy/react";\nimport { a } from "@ai-matrx/alchemy";\n' }, { "@ai-matrx/alchemy": alchemy }, 0, null],
      ["subpath", { "app/x.ts": 'import { useA } from "@ai-matrx/alchemy/react/surface";\n' }, { "@ai-matrx/alchemy": alchemy }, 1, /does not export "\.\/react\/surface"/],
      ["subpath-missing-package-subpath-dynamic", { "app/x.ts": 'const m = await import("@ai-matrx/alchemy/does-not-exist");\n' }, { "@ai-matrx/alchemy": alchemy }, 1, /does-not-exist/],
      ["named", { "app/x.ts": 'import {\n  useA,\n  PERMISSION_LEVEL_HINTS,\n} from "@ai-matrx/alchemy/react";\n' }, { "@ai-matrx/alchemy": alchemy }, 1, /does not export "PERMISSION_LEVEL_HINTS"/],
      ["minified-external-star", { "app/x.ts": 'import { ContentTransferMenu } from "@ai-matrx/alchemy/react";\n' }, { "@ai-matrx/alchemy": { ...alchemy, files: { ...alchemy.files, "dist/react.d.ts": 'export * from "@ai-matrx/alchemy/react/workspace";\n', "dist/react.js": 'export*from"@ai-matrx/alchemy/react/workspace";\n' } } }, 0, null],
      ["graph", {}, { "@ai-matrx/alchemy": alchemy, "@ai-matrx/chat": { exports: { ".": "./dist/index.js" }, files: { "dist/index.js": 'import { s } from "@ai-matrx/alchemy/react/surface";\nexport { s };\n' } } }, 1, /@ai-matrx\/chat@1\.0\.0\/dist\/index\.js.*alchemy@1\.0\.0 does not export "\.\/react\/surface"/],
    ];
    let bad = 0;
    for (const [label, files, installed, want, re] of cases) {
      const r = audit({ root: mk(label, files, installed) });
      const ok = r.findings.length === want && (!re || re.test(r.findings[0]));
      if (!ok) { bad += 1; console.error(`SELF-TEST FAIL ${label}: wanted ${want}, got ${JSON.stringify(r.findings)}`); } else console.log(`self-test ${label}: ${want ? "RED as required" : "GREEN as required"}`);
    }
    // 4: DECLARED — RED on an undeclared (merely hoisted) package, GREEN once declared / builtin / alias / relative / type-only
    const declCases = [
      ["declared-red-dynamic", { "package.json": '{"dependencies":{"react":"1"}}', "tsconfig.json": '{"compilerOptions":{"paths":{"@/*":["./*"]}}}', "features/x.ts": 'const m = await import("html-to-image");\n' }, 1, /html-to-image/],
      ["declared-red-static-scoped", { "package.json": '{"dependencies":{}}', "x.ts": 'import { a } from "@scope/pkg/deep/path";\n' }, 1, /@scope\/pkg/],
      ["declared-red-require", { "package.json": '{"dependencies":{}}', "x.js": 'const z = require("left-pad");\n' }, 1, /left-pad/],
      ["declared-green", { "package.json": '{"dependencies":{"html-to-image":"1","@scope/pkg":"1"},"devDependencies":{"vitest":"1"}}', "tsconfig.json": '// c\n{"compilerOptions":{"paths":{"@/*":["./*"],}}}', "a.ts": 'import { toPng } from "html-to-image";\nimport { b } from "@scope/pkg/deep";\nimport { t } from "vitest";\nimport fs from "node:fs";\nimport path from "path";\nimport fsp from "fs/promises";\nimport x from "@/lib/x";\nimport y from "./y";\nimport type { Q } from "type-only-undeclared";\n// import("in-a-comment")\n' }, 0, null],
    ];
    for (const [label, files, want, re] of declCases) {
      const root = path.join(work, label); mkdirSync(root, { recursive: true });
      for (const [rel, body] of Object.entries(files)) { const p = path.join(root, rel); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, body); }
      const r = auditDeclared({ root }).findings;
      const ok = r.length === want && (!re || re.test(r[0].pkg));
      if (!ok) { bad += 1; console.error(`SELF-TEST FAIL ${label}: wanted ${want}, got ${JSON.stringify(r)}`); } else console.log(`self-test ${label}: ${want ? "RED as required" : "GREEN as required"}`);
    }
    if (bad) process.exit(1);
    console.log("[package-imports-resolve] self-test OK");
  } finally { rmSync(work, { recursive: true, force: true }); }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) { selfTest(); process.exit(0); }
  const ri = args.indexOf("--root");
  const root = ri >= 0 ? args[ri + 1] : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  if (!existsSync(path.join(root, "node_modules"))) die(`no node_modules under ${root} (run pnpm install first)`);
  const t0 = Date.now();
  const decl = auditDeclared({ root });
  const grouped = groupByFile(decl.findings);
  if (args.includes("--update-baseline")) {
    // SHRINK-ONLY: the baseline may only lose entries; a new undeclared import is declared in package.json, not baselined.
    const old = readBaseline(); const next = {};
    for (const [f, pk] of Object.entries(grouped)) { const kept = [...pk].filter((n) => (old[f] ?? []).includes(n)); if (kept.length) next[f] = kept.sort(); }
    if (args.includes("--seed")) for (const [f, pk] of Object.entries(grouped)) next[f] = [...pk].sort();
    writeFileSync(BASELINE, JSON.stringify(Object.fromEntries(Object.entries(next).sort()), null, 2) + "\n");
    console.log(`[package-imports-resolve] declared baseline written: ${Object.keys(next).length} file(s).`); process.exit(0);
  }
  const base = readBaseline(); const newOnes = []; const stale = [];
  for (const [f, pk] of Object.entries(grouped)) for (const n of pk) if (!(base[f] ?? []).includes(n)) newOnes.push(`${f} imports "${n}" which is not declared in package.json`);
  for (const [f, names] of Object.entries(base)) for (const n of names) if (!grouped[f]?.has(n)) stale.push(`${f}: baseline lists "${n}" but it is no longer imported undeclared (run --update-baseline)`);
  if (newOnes.length || stale.length) {
    console.error(`[FAIL] [package-imports-resolve] DECLARED: ${newOnes.length} undeclared import(s), ${stale.length} stale baseline entr(ies):\n`);
    for (const f of [...newOnes, ...stale]) console.error(`  - ${f}`);
    console.error("\n  A package that is only hoisted into node_modules works on this machine and fails the Vercel build\n  (v0.4.3016, html-to-image). Declare it in package.json, or use the @ai-matrx door that owns it.");
    process.exit(1);
  }
  const r = audit({ root, graph: !args.includes("--no-graph") });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.findings.length) {
    console.error(`[FAIL] [package-imports-resolve] ${r.findings.length} @ai-matrx import(s) do not resolve in the INSTALLED published packages (${secs}s):\n`);
    for (const f of r.findings) console.error(`  - ${f}`);
    console.error("\n  The consumer shipped before the package. Publish the package, then `pnpm sync:matrx-packages` (waits for the tarball)\n  and commit the lockfile. Never pin; never delete the import to go green.");
    process.exit(1);
  }
  console.log(`[package-imports-resolve] OK — ${r.imports} @ai-matrx import(s) resolve; ${decl.scanned} files DECLARED-checked (${decl.findings.length} baselined) (${r.skippedWorkspace} workspace-linked skipped, ${r.graphPkgs} installed package(s) graph-checked) in ${secs}s.`);
}
