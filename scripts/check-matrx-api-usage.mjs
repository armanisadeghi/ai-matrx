#!/usr/bin/env node
// check-matrx-api-usage — CODE THAT USES AN @ai-matrx PACKAGE TYPE-CHECKS AGAINST
// THE VERSION THE COMMITTED LOCKFILE PINS (what Vercel actually builds).
//
// THE DEFECT THIS EXISTS FOR (2026-10-07, v0.4.2990 / v0.4.2991)
// --------------------------------------------------------------
// providers/WarmupHost.tsx shipped calling `warmup.currentScope()` and
// `warmup.notifyScopeChanged()` — methods added in @ai-matrx/agents 0.58.0 —
// while the committed pnpm-lock.yaml still pinned 0.57.0. Every page crashed
// with "v.currentScope is not a function" until v0.4.2992 locked 0.58.0. The
// code arrived through a sync-main sweep (349d36738d) that committed it without
// the lockfile bump.
//
//   • check:matrx-imports — green: it verifies NAMED imports only; a method on an
//                           object a package returns is invisible to it.
//   • type-check          — sees it (TS2339), but as one WARNING row carrying a
//                           ~100-error backlog, and against whatever this shared
//                           checkout happens to have INSTALLED (0.58.0 here), not
//                           what the lockfile pins.
//
// WHAT IT CHECKS
// --------------
// The files a change touched that import `@ai-matrx/*` are type-checked (the
// TypeScript checker, this repo's tsconfig) with every `@ai-matrx/<pkg>`
// resolved to the version the lockfile AT THAT COMMIT pins for the app. When the
// installed copy is a different version, the pinned tarball's own .d.ts files
// are fetched from npm into node_modules/.cache/matrx-api-usage/ and used
// instead. Only diagnostics that land on a package's API are reported — a
// missing property/method, a wrong argument, a missing export, a prop a package
// component does not take — so the repo's type backlog never drowns it.
//
// It NEVER blocks anything. In the release it runs AFTER the push, as an ERROR
// row, so the follow-up release can carry the fix minutes later; sync-main
// prints its findings as a loud warning and commits anyway.
//
//   node scripts/check-matrx-api-usage.mjs                    # files since the previous release tag, content at HEAD
//   node scripts/check-matrx-api-usage.mjs --rev <sha>        # the files <sha> changed, content + lockfile at <sha>
//   node scripts/check-matrx-api-usage.mjs --since <rev>      # files changed in <rev>..HEAD
//   node scripts/check-matrx-api-usage.mjs --files a.tsx b.ts # these files (content at --rev, default HEAD)
//   node scripts/check-matrx-api-usage.mjs --self-test        # replays the incident: RED on 349d36738d, GREEN on its fix
//
// Exit codes: 0 clean · 1 a package-API finding · 2 the check could not run
// (never a silent pass).
//
// Remedy for a finding: the code shipped before the lockfile. Run
// `pnpm sync:matrx-packages` (or `pnpm update "@ai-matrx/<pkg>" --latest`) and
// commit pnpm-lock.yaml — the next release carries it.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { emitItem, endItems } from "./checks/items.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE = "@ai-matrx/";
const REGISTRY = "https://registry.npmjs.org";
const CACHE_ROOT = join(REPO_ROOT, "node_modules", ".cache", "matrx-api-usage");
const SOURCE_EXT = /\.(ts|tsx|mts|cts)$/;
// Ambient declarations the app's files rely on (tsconfig.typecheck.json `include`), plus every
// file that augments a module or the global scope: a package's store/registry types are widened
// by `declare module "@ai-matrx/…"` in host files, and a partial program without them reports
// the narrower package type as a mismatch (it did: NoteBody.tsx vs the chat store, 2026-10-07).
const AMBIENT = ["global.d.ts", "cartesia.d.ts", "types/typecheck-env.d.ts"];
function augmentingFiles() {
  const out = gitOk(["grep", "-l", "-E", "^\\s*declare (module|global)", "--", "*.ts", "*.tsx"]);
  return out ? out.split("\n").filter((f) => f && !f.startsWith("node_modules/")) : [];
}
// Diagnostics that can describe a package's API being used wrongly. Anything else
// (implicit any, unused, strictness) is type-check's job, not this one's.
const API_CODES = new Set([
  2305, // Module has no exported member
  2307, // Cannot find module
  2339, // Property does not exist on type
  2345, // Argument not assignable to parameter
  2322, // Type not assignable (JSX props, object literals passed to package APIs)
  2353, // Object literal may only specify known properties
  2551, // Property does not exist. Did you mean
  2554, // Expected N arguments
  2555, // Expected at least N arguments
  2559, // Type has no properties in common
  2561, // Object literal may only specify known properties. Did you mean
  2614, // Module has no exported member. Did you mean to use import x from
  2724, // Module has no exported member named. Did you mean
  2741, // Property is missing in type
  2769, // No overload matches this call
  2349, // This expression is not callable
]);

const git = (args, opts = {}) =>
  execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });

function gitOk(args) {
  try {
    return git(args, { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

// ── The lockfile: what the APP itself resolves for each @ai-matrx package ─────
/** `{ "@ai-matrx/agents": "0.57.0", … }` from the root importer of a pnpm lockfile. */
export function appLockedVersions(lockText) {
  const out = {};
  const start = lockText.search(/^importers:\s*$/m);
  if (start < 0) return out;
  const rest = lockText.slice(start);
  const root = rest.search(/^ {2}\.:\s*$/m);
  if (root < 0) return out;
  const lines = rest.slice(root).split("\n").slice(1);
  let current = null;
  for (const line of lines) {
    if (/^ {2}\S/.test(line) || /^\S/.test(line)) break; // next importer / next section
    const name = line.match(/^ {6}'?(@ai-matrx\/[a-z0-9._-]+)'?:\s*$/);
    if (name) {
      current = name[1];
      continue;
    }
    if (/^ {6}\S/.test(line)) current = null;
    const version = current && line.match(/^ {8}version:\s*'?(\d[^('\s]*)/);
    if (version) out[current] = version[1];
  }
  return out;
}

function installedVersion(name) {
  try {
    return JSON.parse(readFileSync(join(REPO_ROOT, "node_modules", name, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

/** Fetch `<name>@<version>` from npm into the cache; returns the directory to resolve FROM. */
async function lockedCopy(name, version) {
  const bare = name.slice(SCOPE.length);
  const base = join(CACHE_ROOT, `${bare}@${version}`);
  const pkgDir = join(base, "node_modules", "@ai-matrx", bare);
  if (existsSync(join(pkgDir, "package.json"))) return base;
  const url = `${REGISTRY}/${name}/-/${bare}-${version}.tgz`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${name}@${version}: npm answered ${res.status} for ${url}`);
  const tmp = `${pkgDir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const tgz = join(tmp, "..", `${bare}-${version}-${process.pid}.tgz`);
  writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["-xzf", tgz, "-C", tmp, "--strip-components=1"]);
  rmSync(tgz, { force: true });
  rmSync(pkgDir, { recursive: true, force: true });
  renameSync(tmp, pkgDir);
  return base;
}

// ── Which files ──────────────────────────────────────────────────────────────
function previousReleaseTag(rev) {
  const out = gitOk(["describe", "--tags", "--match", "v*", "--abbrev=0", `${rev}^`]);
  return out ? out.trim() : null;
}

function changedFiles(from, to) {
  const out = gitOk(["diff", "--name-only", "--diff-filter=AMR", from, to]);
  return out ? out.split("\n").filter(Boolean) : [];
}

function fileAt(rev, path) {
  if (rev === null) {
    try {
      return readFileSync(join(REPO_ROOT, path), "utf8");
    } catch {
      return null;
    }
  }
  return gitOk(["show", `${rev}:${path}`]);
}

// ── The check ────────────────────────────────────────────────────────────────
/**
 * @param {{ rev: string|null, files: string[], lockText: string }} input
 *   rev null = read files and lockfile from the working tree.
 * @returns {Promise<{ findings: object[], checked: string[], drifted: object[] }>}
 */
export async function checkApiUsage({ rev, files, lockText }) {
  const roots = [];
  const contents = new Map();
  for (const rel of files) {
    if (!SOURCE_EXT.test(rel) || rel.endsWith(".d.ts")) continue;
    const text = fileAt(rev, rel);
    if (text === null || !text.includes(SCOPE)) continue;
    const abs = join(REPO_ROOT, rel);
    contents.set(abs, text);
    roots.push(abs);
  }
  if (!roots.length) return { findings: [], checked: [], drifted: [] };

  const locked = appLockedVersions(lockText);
  // EVERY @ai-matrx package resolves to the exact locked tarball, never to this shared checkout's
  // node_modules: other lanes reinstall it all day, and a half-finished install read as "package
  // missing" here (2026-10-07). Cached per version, so only a new version costs a download.
  const drifted = [];
  const resolveFrom = new Map(); // package name → directory whose node_modules holds the locked copy
  const entries = Object.entries(locked);
  for (let i = 0; i < entries.length; i += 8) {
    await Promise.all(
      entries.slice(i, i + 8).map(async ([name, version]) => {
        const have = installedVersion(name);
        if (have !== version) drifted.push({ name, locked: version, installed: have });
        resolveFrom.set(name, await lockedCopy(name, version));
      }),
    );
  }

  const config = ts.getParsedCommandLineOfConfigFile(join(REPO_ROOT, "tsconfig.json"), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    },
  });
  const options = { ...config.options, noEmit: true, incremental: false, tsBuildInfoFile: undefined, skipLibCheck: true };
  const host = ts.createCompilerHost(options, true);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = contents.get(resolve(fileName));
    if (text !== undefined) return ts.createSourceFile(fileName, text, languageVersion, true);
    return baseGetSourceFile(fileName, languageVersion, onError, shouldCreate);
  };
  const baseFileExists = host.fileExists.bind(host);
  host.fileExists = (f) => contents.has(resolve(f)) || baseFileExists(f);
  const baseReadFile = host.readFile.bind(host);
  host.readFile = (f) => contents.get(resolve(f)) ?? baseReadFile(f);

  const cache = ts.createModuleResolutionCache(REPO_ROOT, (s) => s, options);
  host.resolveModuleNameLiterals = (literals, containingFile, redirected, opts) =>
    literals.map((lit) => {
      const spec = lit.text;
      const pkg = spec.startsWith(SCOPE) ? spec.split("/").slice(0, 2).join("/") : null;
      const from = pkg && resolveFrom.get(pkg);
      const container = from ? join(from, "__resolve_from__.ts") : containingFile;
      return ts.resolveModuleName(spec, container, opts, host, from ? undefined : cache, redirected);
    });

  const ambient = [...new Set([...AMBIENT, ...augmentingFiles()])]
    .map((p) => join(REPO_ROOT, p))
    .filter((p) => existsSync(p) && !contents.has(p));
  const program = ts.createProgram({ rootNames: [...roots, ...ambient], options, host });
  const checker = program.getTypeChecker();

  const findings = [];
  for (const abs of roots) {
    const sf = program.getSourceFile(abs);
    if (!sf) continue;
    for (const d of program.getSemanticDiagnostics(sf)) {
      if (!API_CODES.has(d.code) || d.start === undefined) continue;
      const message = ts.flattenDiagnosticMessageText(d.messageText, " ");
      const pkg = packageOf(message) ?? attribute(checker, sf, d.start, resolveFrom);
      if (!pkg) continue;
      const { line } = sf.getLineAndCharacterOfPosition(d.start);
      findings.push({
        file: relative(REPO_ROOT, abs),
        line: line + 1,
        code: d.code,
        message,
        pkg,
        locked: locked[pkg] ?? null,
        installed: installedVersion(pkg),
      });
    }
  }
  return { findings, checked: roots.map((r) => relative(REPO_ROOT, r)), drifted };
}

function packageOf(text) {
  const m = String(text).match(/@ai-matrx\/[a-z0-9._-]+/);
  return m ? m[0] : null;
}

/** The @ai-matrx package a declaration lives in, from its file path (installed or cached copy). */
function packageOfPath(fileName) {
  const norm = fileName.split(sep).join("/");
  const m = norm.match(/node_modules\/(@ai-matrx\/[a-z0-9._-]+)\//);
  return m ? m[1] : null;
}

function declPackage(symbol, checker) {
  if (!symbol) return null;
  let s = symbol;
  if (s.flags & ts.SymbolFlags.Alias) {
    try {
      s = checker.getAliasedSymbol(s);
    } catch {
      /* unresolved alias */
    }
  }
  for (const decl of s.declarations ?? []) {
    const pkg = packageOfPath(decl.getSourceFile().fileName);
    if (pkg) return pkg;
  }
  return null;
}

function typePackage(type, checker) {
  if (!type) return null;
  const parts = type.isUnionOrIntersection() ? type.types : [type];
  for (const t of parts) {
    const pkg = declPackage(t.aliasSymbol, checker) ?? declPackage(t.getSymbol(), checker);
    if (pkg) return pkg;
  }
  return null;
}

/** Does the code at `pos` touch a declaration that lives in an @ai-matrx package? */
function attribute(checker, sf, pos) {
  let node = findNode(sf, pos);
  for (let depth = 0; node && depth < 8; depth += 1, node = node.parent) {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const pkg = typePackage(checker.getTypeAtLocation(node.expression), checker);
      if (pkg) return pkg;
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const sig = checker.getResolvedSignature(node);
      const pkg =
        (sig?.declaration && packageOfPath(sig.declaration.getSourceFile().fileName)) ||
        declPackage(checker.getSymbolAtLocation(node.expression), checker) ||
        typePackage(checker.getTypeAtLocation(node.expression), checker);
      if (pkg) return pkg;
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const pkg = declPackage(checker.getSymbolAtLocation(node.tagName), checker);
      if (pkg) return pkg;
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec && ts.isStringLiteral(spec) && spec.text.startsWith(SCOPE)) return spec.text.split("/").slice(0, 2).join("/");
    }
    if (ts.isStatement(node) && !ts.isExpressionStatement(node) && !ts.isVariableStatement(node) && !ts.isReturnStatement(node)) break;
  }
  return null;
}

function findNode(sf, pos) {
  let found = sf;
  const visit = (n) => {
    if (pos >= n.getStart(sf) && pos < n.getEnd()) {
      found = n;
      ts.forEachChild(n, visit);
    }
  };
  ts.forEachChild(sf, visit);
  return found;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { rev: undefined, since: undefined, files: [], selfTest: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--rev") args.rev = argv[++i];
    else if (a === "--since") args.since = argv[++i];
    else if (a === "--self-test") args.selfTest = true;
    else if (a === "--json") args.json = true;
    else if (a === "--worktree") args.rev = null;
    else if (a === "--files") {
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) args.files.push(argv[++i]);
    } else if (a === "--help" || a === "-h") {
      console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 47).join("\n"));
      process.exit(0);
    } else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

async function plan(args) {
  const rev = args.rev === undefined ? "HEAD" : args.rev;
  const revSha = rev === null ? null : gitOk(["rev-parse", "--verify", `${rev}^{commit}`])?.trim();
  if (rev !== null && !revSha) throw new Error(`not a commit: ${rev}`);
  let files = args.files;
  let range = "the named files";
  if (!files.length) {
    if (args.since) {
      files = changedFiles(args.since, revSha ?? "HEAD");
      range = `${args.since}..${rev ?? "worktree"}`;
    } else if (args.rev !== undefined && args.rev !== null) {
      files = changedFiles(`${revSha}^`, revSha);
      range = `${rev} (its own changes)`;
    } else {
      const prev = previousReleaseTag(revSha ?? "HEAD");
      if (!prev) throw new Error("no previous release tag (v*) reachable — pass --since <rev>");
      files = changedFiles(prev, revSha ?? "HEAD");
      range = `${prev}..${rev ?? "HEAD"}`;
    }
  }
  const lockText = rev === null ? readFileSync(join(REPO_ROOT, "pnpm-lock.yaml"), "utf8") : gitOk(["show", `${revSha}:pnpm-lock.yaml`]);
  if (!lockText) throw new Error(`no pnpm-lock.yaml at ${rev}`);
  return { rev: revSha, files, lockText, range, label: rev ?? "worktree" };
}

function print(result, { range, label }) {
  const { findings, checked, drifted } = result;
  for (const d of drifted) {
    console.log(`  note: ${d.name} installed ${d.installed ?? "(none)"} but the lockfile at ${label} pins ${d.locked} — checked against ${d.locked}`);
  }
  if (!findings.length) {
    console.log(`[ok] ${checked.length} file(s) using @ai-matrx packages type-check against the locked versions (${range}).`);
    return;
  }
  console.log(`[FAIL] PACKAGE API MISMATCH — ${findings.length} use(s) of an @ai-matrx API the LOCKED version does not have (${range}).`);
  console.log(`       This crashes or fails the build on Vercel even though this checkout may compile.`);
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}  TS${f.code}  ${f.pkg}@${f.locked ?? "?"}${f.installed && f.installed !== f.locked ? ` (installed ${f.installed})` : ""}`);
    console.log(`      ${f.message.slice(0, 300)}`);
    emitItem({
      key: `${f.file}|${f.pkg}|TS${f.code}|${f.message.slice(0, 120)}`,
      title: `${f.pkg}@${f.locked ?? "?"}: ${f.message}`,
      file: f.file,
      line: f.line,
      unit: f.pkg,
      rule: `TS${f.code}`,
    });
  }
  console.log(`  Remedy: pnpm sync:matrx-packages (or pnpm update "<pkg>" --latest), then commit pnpm-lock.yaml.`);
}

async function selfTest() {
  // The 2026-10-07 incident, replayed from history: 349d36738d swept WarmupHost.tsx in calling
  // agents 0.58.0 methods while its lockfile pinned 0.57.0 (RED); af5b5a1e62 locked 0.58.0 (GREEN).
  const cases = [
    { rev: "349d36738d", expect: "red", files: ["providers/WarmupHost.tsx"], must: /currentScope|notifyScopeChanged/ },
    { rev: "af5b5a1e62", expect: "green", files: ["providers/WarmupHost.tsx"] },
  ];
  let ok = true;
  for (const c of cases) {
    if (!gitOk(["rev-parse", "--verify", `${c.rev}^{commit}`])) {
      console.log(`[FAIL] self-test: commit ${c.rev} is not in this clone — cannot replay the incident`);
      process.exit(2);
    }
    const p = await plan({ rev: c.rev, files: c.files });
    const r = await checkApiUsage(p);
    const red = r.findings.length > 0;
    const pass = c.expect === "red" ? red && r.findings.some((f) => c.must.test(f.message)) : !red && r.checked.length > 0;
    console.log(`  [${pass ? "ok" : "FAIL"}] ${c.rev} expected ${c.expect.toUpperCase()}: ${r.findings.length} finding(s) over ${r.checked.length} file(s)`);
    for (const f of r.findings) console.log(`         ${f.file}:${f.line} TS${f.code} ${f.pkg}@${f.locked}: ${f.message.slice(0, 160)}`);
    ok &&= pass;
  }
  console.log(ok ? "[ok] self-test: the check goes RED on the incident and GREEN on its fix" : "[FAIL] self-test");
  process.exit(ok ? 0 : 1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) return selfTest();
  const p = await plan(args);
  const result = await checkApiUsage(p);
  if (args.json) console.log(JSON.stringify(result));
  else print(result, p);
  if (!args.files.length) endItems();
  process.exit(result.findings.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.log(`[FAIL] UNMEASURED — check-matrx-api-usage could not run: ${err?.stack ?? err}`);
    process.exit(2);
  });
}
