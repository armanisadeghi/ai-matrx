#!/usr/bin/env node
// check-matrx-dist-integrity — EVERY INSTALLED @ai-matrx/* IS THE PUBLISHED ONE,
// BYTE FOR BYTE.
//
// THE DEFECT THIS EXISTS FOR (2026-09-21, found by CI-FIX 2026-09-22)
// -------------------------------------------------------------------
// Somebody built @ai-matrx/design-system locally and copied the result OVER
// `node_modules/@ai-matrx/design-system/dist` in this shared checkout. The
// directory kept its published version number (0.34.0), the lockfile kept its
// integrity hash, `pnpm install` had nothing to do, and every existing guard
// stayed green:
//
//   • check:matrx-packages compares VERSIONS. 0.34.0 === npm's latest. Green.
//   • the lockfile's `integrity` is only verified when a package is FETCHED.
//     Nothing was fetched, so nothing was verified.
//   • tsc and the dev server read the overwritten dist and its overwritten
//     .d.ts, so the local machine compiled and ran perfectly.
//
// So a screen was written against a prop the SHIPPED package never reads, it
// worked on the machine that wrote it, and expanding a research template did
// nothing in every deployed build — for as long as nobody happened to reinstall.
// A version number is a CLAIM about bytes; this guard checks the bytes.
//
// WHAT IT CHECKS
// --------------
// For every @ai-matrx/* copy in the install graph (`node_modules/@ai-matrx/*`,
// `node_modules/.pnpm/*/node_modules/@ai-matrx/*`, `node_modules/*/node_modules/
// @ai-matrx/*`, deduplicated by realpath):
//
//   1. npm still HAS that exact version. An installed version the registry does
//      not have cannot be what is deployed, whatever the folder says.
//   2. Every file in the published tarball is present on disk with the SAME
//      sha256. A differing file, a missing file — each is named.
//
// Files the tarball does not carry are NOT flagged: pnpm and npm legitimately
// add `node_modules/`, and a build tool may drop a cache beside the package.
// Only bytes the registry actually shipped are claims this guard can check.
//
// WORKSPACE SOURCE IS NOT A GRAPH ENTRY, for the same reason check-matrx-packages
// skips it: in the aidream monorepo these resolve to `link:` into `apps/shared/*`,
// which is SOURCE, ahead of npm by design.
//
//   node scripts/check-matrx-dist-integrity.mjs             # loud, exit 1 on a difference
//   node scripts/check-matrx-dist-integrity.mjs --self-test # RED then GREEN, in a temp tree
//   node scripts/check-matrx-dist-integrity.mjs --root DIR  # audit another checkout
//   node scripts/check-matrx-dist-integrity.mjs --only NAME # one package
//
// Exit codes: 0 clean · 1 a package differs from npm · 2 the script itself could
//             not run (no network, npm unreachable) — never a silent pass.
//
// 🚨 THIS GUARD NEVER REPAIRS ANYTHING. It says what differs; a person (or the
// install gate) reinstalls. Rewriting node_modules from a checker is how a
// second, invisible hand starts editing the dependency tree.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

const argv = process.argv.slice(2);
const flagValue = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const SELF_TEST = argv.includes("--self-test");
const ROOT = resolve(flagValue("--root") ?? REPO);
const ONLY = flagValue("--only");
// The RESOLVED copies are the ones this app compiles and ships. CI installs from
// the lockfile so its virtual store is clean by construction; a full-graph audit
// there would pack ~90 tarballs to prove something the lockfile already proves.
// A developer machine runs the full graph, because residue there is real.
const RESOLVED_ONLY = argv.includes("--resolved-only");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const TAG = {
  ok: `${C.green}[ OK ]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
};

/** Every @ai-matrx/* directory in the install graph, deduplicated by realpath. */
function installedCopies(root) {
  const nm = join(root, "node_modules");
  const found = new Map(); // realpath -> {name, version, dir, root, vendored}

  // What `import "@ai-matrx/x"` resolves to from this repo — the copy that is
  // actually compiled and shipped. Everything else in the virtual store is a
  // resolution for something else, or residue.
  const rootResolved = new Map();
  const rootScope = join(nm, "@ai-matrx");
  if (existsSync(rootScope)) {
    for (const short of readdirSync(rootScope)) {
      try {
        rootResolved.set(`@ai-matrx/${short}`, realpathSync(join(rootScope, short)));
      } catch {
        /* a broken link is the install gate's problem, not this guard's */
      }
    }
  }
  const scopes = [];

  const pushScope = (dir) => {
    if (existsSync(dir)) scopes.push(dir);
  };
  pushScope(join(nm, "@ai-matrx"));
  for (const base of [join(nm, ".pnpm"), nm]) {
    if (!existsSync(base)) continue;
    let entries;
    try {
      entries = readdirSync(base);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e === "@ai-matrx") continue;
      pushScope(join(base, e, "node_modules", "@ai-matrx"));
    }
  }

  for (const scope of scopes) {
    let names;
    try {
      names = readdirSync(scope);
    } catch {
      continue;
    }
    for (const short of names) {
      const dir = join(scope, short);
      let real;
      try {
        real = realpathSync(dir);
      } catch {
        continue;
      }
      // Workspace SOURCE (`link:` into a monorepo) is not a registry install.
      if (!real.split(sep).includes("node_modules")) continue;
      if (found.has(real)) continue;
      const manifest = join(real, "package.json");
      if (!existsSync(manifest)) continue;
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(manifest, "utf8"));
      } catch {
        continue;
      }
      if (typeof pkg.name !== "string" || !pkg.name.startsWith("@ai-matrx/")) continue;
      if (typeof pkg.version !== "string") continue;
      // A copy installed from a LOCAL tarball (`file:vendor/...tgz`) did not come
      // from the registry, so npm's bytes are not the claim it makes. pnpm spells
      // that in the virtual-store directory name. Named, never silently skipped.
      const vendored = real.includes(`${sep}@ai-matrx+`) && real.includes("@file+");
      found.set(real, {
        name: pkg.name,
        version: pkg.version,
        dir: real,
        vendored,
        // ROOT is the copy the app actually resolves; the rest are virtual-store
        // entries kept for other resolutions, including versions nothing uses.
        root: real === rootResolved.get(pkg.name),
      });
    }
  }
  return [...found.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Every regular file under `dir`, as paths relative to `dir`, POSIX-separated. */
function filesUnder(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) filesUnder(p, base, out);
    else if (e.isFile()) out.push(relative(base, p).split(sep).join("/"));
  }
  return out;
}

const tarballCache = new Map(); // name@version -> extracted dir | {error}

/**
 * The PUBLISHED bytes for this exact version, extracted. `npm pack` is the one
 * transport that gives us what a consumer would actually receive.
 */
function publishedTree(name, version) {
  const key = `${name}@${version}`;
  if (tarballCache.has(key)) return tarballCache.get(key);
  const work = mkdtempSync(join(tmpdir(), "matrx-dist-"));
  let result;
  try {
    const out = execFileSync(
      "npm",
      ["pack", key, "--pack-destination", work, "--silent", "--loglevel", "error"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const tgz = out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".tgz"))
      .pop();
    const file = tgz && existsSync(join(work, tgz)) ? join(work, tgz) : null;
    if (!file) {
      const any = readdirSync(work).filter((f) => f.endsWith(".tgz"));
      if (!any.length) throw new Error("npm pack produced no tarball");
      result = { dir: extract(join(work, any[0]), work) };
    } else {
      result = { dir: extract(file, work) };
    }
  } catch (err) {
    result = { error: String(err?.stderr || err?.message || err).trim().slice(0, 400) };
  }
  tarballCache.set(key, result);
  return result;
}

function extract(tgz, work) {
  execFileSync("tar", ["xzf", tgz, "-C", work], { stdio: ["ignore", "ignore", "pipe"] });
  const pkgDir = join(work, "package");
  if (!existsSync(pkgDir)) throw new Error(`tarball has no package/ root: ${tgz}`);
  return pkgDir;
}

/** Compare one installed copy against its published tarball. */
function auditCopy(copy) {
  if (copy.vendored) {
    return { ...copy, verdict: "vendored", detail: "", differing: [], missing: [], checked: 0 };
  }
  const published = publishedTree(copy.name, copy.version);
  if (published.error) {
    return {
      ...copy,
      verdict: "unpublished",
      detail: published.error,
      differing: [],
      missing: [],
      checked: 0,
    };
  }
  const differing = [];
  const missing = [];
  let checked = 0;
  for (const rel of filesUnder(published.dir)) {
    const shipped = join(published.dir, rel);
    const here = join(copy.dir, rel);
    checked += 1;
    if (!existsSync(here) || !statSync(here).isFile()) {
      missing.push(rel);
      continue;
    }
    if (sha256(shipped) !== sha256(here)) differing.push(rel);
  }
  return {
    ...copy,
    verdict: differing.length || missing.length ? "differs" : "identical",
    detail: "",
    differing,
    missing,
    checked,
  };
}

function report(results) {
  console.log("");
  console.log(
    `${C.bold}Installed @ai-matrx packages vs the published tarball${C.reset} ` +
      `${C.dim}(a version number is a claim about bytes)${C.reset}`,
  );
  console.log(`${C.dim}       root: ${ROOT}${C.reset}`);
  console.log("");

  const bad = results.filter((r) => r.verdict !== "identical" && r.verdict !== "vendored");
  const WHERE = (r) => (r.root ? `${C.bold}RESOLVED${C.reset}` : `${C.dim}store${C.reset}`);
  for (const r of results) {
    if (r.verdict === "vendored") {
      console.log(
        `  ${TAG.warn}${r.name}@${r.version} ${C.dim}— installed from a LOCAL tarball (file:), not the registry; npm's bytes are not its claim${C.reset}`,
      );
      console.log(`        ${C.dim}${r.dir}${C.reset}`);
      continue;
    }
    if (r.verdict === "identical") {
      console.log(
        `  ${TAG.ok}${r.name}@${r.version} [${WHERE(r)}] ${C.dim}— ${r.checked} published file(s) identical${C.reset}`,
      );
      continue;
    }
    if (r.verdict === "unpublished") {
      console.log(
        `  ${TAG.fail}${r.name}@${r.version} [${WHERE(r)}] — npm does not have this version`,
      );
      console.log(`        ${C.dim}${r.detail}${C.reset}`);
      console.log(`        ${C.dim}${r.dir}${C.reset}`);
      continue;
    }
    console.log(
      `  ${TAG.fail}${r.name}@${r.version} [${WHERE(r)}] — ${r.differing.length} file(s) DIFFER, ` +
        `${r.missing.length} missing, of ${r.checked} published`,
    );
    console.log(`        ${C.dim}${r.dir}${C.reset}`);
    for (const f of [...r.differing, ...r.missing].slice(0, 12)) {
      console.log(`        ${C.dim}· ${f}${C.reset}`);
    }
    const rest = r.differing.length + r.missing.length - 12;
    if (rest > 0) console.log(`        ${C.dim}· …and ${rest} more${C.reset}`);
  }

  console.log("");
  if (!bad.length) {
    console.log(
      `${TAG.ok}${C.green}${results.length} installed @ai-matrx copy(ies) are byte-identical to npm.${C.reset}`,
    );
    console.log("");
    return 0;
  }
  const resolvedBad = bad.filter((r) => r.root);
  console.log(
    `${TAG.fail}${C.bold}${C.red}${bad.length} installed @ai-matrx package(s) are NOT what npm published` +
      `${resolvedBad.length ? ` — ${resolvedBad.length} of them RESOLVED, i.e. compiled into this app` : ""}.${C.reset}`,
  );
  for (const r of resolvedBad) {
    console.log(`  ${C.red}${C.bold}RESOLVED: ${r.name}@${r.version}${C.reset}`);
  }
  console.log(
    `  ${C.dim}A local build was copied over the installed copy, so this machine compiles and${C.reset}`,
  );
  console.log(
    `  ${C.dim}runs against code no deployed build has. Fix: reinstall the package from the${C.reset}`,
  );
  console.log(
    `  ${C.dim}registry. If the local bytes are the ones you want, PUBLISH them — a package is${C.reset}`,
  );
  console.log(
    `  ${C.dim}shared by every repo, and an unpublished dist is a change only you can see.${C.reset}`,
  );
  console.log(
    `  ${C.dim}This guard never rewrites node_modules; it only says what differs.${C.reset}`,
  );
  console.log("");
  return 1;
}

// ── THE SELF-TEST ────────────────────────────────────────────────────────────
// A guard you cannot show failing is not a guard. This builds a REAL install
// tree from a REAL published tarball in a temp directory, proves GREEN, plants
// the exact defect (one byte changed in a shipped dist file, version untouched),
// proves RED and names the file, then proves GREEN again.
function selfTest() {
  const copies = installedCopies(REPO);
  if (!copies.length) {
    console.log(`${TAG.fail}self-test cannot run: no @ai-matrx package is installed here.`);
    return 2;
  }
  // The smallest one, so the self-test is cheap.
  const subject = copies
    .map((c) => ({ c, n: (() => { try { return filesUnder(c.dir).length; } catch { return 1e9; } })() }))
    .sort((a, b) => a.n - b.n)[0].c;

  const published = publishedTree(subject.name, subject.version);
  if (published.error) {
    console.log(
      `${TAG.fail}self-test cannot run: npm pack ${subject.name}@${subject.version} failed — ${published.error}`,
    );
    return 2;
  }

  const sandbox = mkdtempSync(join(tmpdir(), "matrx-dist-selftest-"));
  const short = subject.name.split("/")[1];
  const dest = join(sandbox, "node_modules", "@ai-matrx", short);
  execFileSync("mkdir", ["-p", dirname(dest)]);
  execFileSync("cp", ["-R", published.dir, dest]);

  const run = () => {
    try {
      const out = execFileSync(
        process.execPath,
        [fileURLToPath(import.meta.url), "--root", sandbox, "--only", subject.name],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return { code: 0, out };
    } catch (err) {
      return { code: err.status ?? 2, out: String(err.stdout ?? "") + String(err.stderr ?? "") };
    }
  };

  const results = [];
  const green1 = run();
  results.push(["A. a faithful copy of the tarball is GREEN", green1.code === 0, green1.code]);

  // Plant the defect: change one byte of one SHIPPED file. The version, the
  // directory name and package.json are untouched — exactly what happened on
  // 2026-09-21.
  const shipped = filesUnder(dest).filter((f) => f !== "package.json");
  const victim = join(dest, shipped[0]);
  const original = readFileSync(victim);
  execFileSync("cp", [victim, `${victim}.selftest-backup`]);
  execFileSync("bash", ["-c", `printf '\\n// planted by the self-test\\n' >> ${JSON.stringify(victim)}`]);
  const red = run();
  results.push([
    "B. one changed byte in a shipped file is RED",
    red.code === 1 && red.out.includes(shipped[0]),
    `${red.code}, named=${red.out.includes(shipped[0])}`,
  ]);

  // Plant the second shape: a shipped file DELETED.
  execFileSync("cp", [`${victim}.selftest-backup`, victim]);
  execFileSync("mv", [victim, `${victim}.moved-away`]);
  const redMissing = run();
  results.push([
    "C. a shipped file that is missing is RED",
    redMissing.code === 1 && redMissing.out.includes(shipped[0]),
    `${redMissing.code}, named=${redMissing.out.includes(shipped[0])}`,
  ]);

  execFileSync("mv", [`${victim}.moved-away`, victim]);
  execFileSync("rm", [`${victim}.selftest-backup`]);
  const green2 = run();
  results.push(["D. restoring the byte goes GREEN again", green2.code === 0, green2.code]);

  console.log("");
  console.log(`${C.bold}check-matrx-dist-integrity self-test${C.reset} ${C.dim}(${subject.name}@${subject.version})${C.reset}`);
  let pass = true;
  for (const [label, ok, detail] of results) {
    console.log(`  ${ok ? TAG.ok : TAG.fail}${label} ${C.dim}(${detail})${C.reset}`);
    if (!ok) pass = false;
  }
  console.log("");
  console.log(
    pass
      ? `${TAG.ok}${C.green}PASS — the guard goes RED on an overwritten dist and GREEN on the published one.${C.reset}`
      : `${TAG.fail}${C.red}FAIL — the guard did not behave as claimed.${C.reset}`,
  );
  console.log("");
  return pass ? 0 : 1;
}

function main() {
  if (SELF_TEST) return selfTest();
  let copies = installedCopies(ROOT);
  if (ONLY) copies = copies.filter((c) => c.name === ONLY);
  if (RESOLVED_ONLY) copies = copies.filter((c) => c.root);
  if (!copies.length) {
    console.log(
      `${TAG.warn}no @ai-matrx package is installed under ${ROOT}/node_modules — nothing to check.`,
    );
    return 0;
  }
  return report(copies.map(auditCopy));
}

process.exit(main());
