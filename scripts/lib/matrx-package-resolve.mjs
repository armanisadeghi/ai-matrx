// matrx-package-resolve — where an @ai-matrx specifier lands in the INSTALLED package: the copy
// Node would resolve, its exports map, the declaration and runtime files a subpath names.
// No TypeScript here on purpose: the dev server's pending-import rescue loader
// (scripts/lib/matrx-pending-imports.mjs) runs in every Turbopack loader worker, and loading the
// compiler there drove the shared preview past its 48 GB watchdog (2026-10-08). The guard
// (scripts/check-matrx-imports.mjs) uses these same functions, so both judge resolution one way.

import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export function clearPackageResolution() {
  pkgDirCache.clear();
}

export function splitSpecifier(spec) {
  const parts = spec.split("/");
  const name = `${parts[0]}/${parts[1]}`;
  const sub = parts.length > 2 ? `./${parts.slice(2).join("/")}` : ".";
  return { name, sub };
}


const pkgDirCache = new Map();
/** The installed copy Node would resolve from `fromDir`, or null. */
export function findInstalled(fromDir, name, root) {
  const key = `${fromDir}\0${name}`;
  if (pkgDirCache.has(key)) return pkgDirCache.get(key);
  let dir = fromDir;
  let result = null;
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) {
      result = candidate;
      break;
    }
    const parent = dirname(dir);
    if (parent === dir || !(dir + sep).startsWith(dirname(root) + sep)) break;
    dir = parent;
  }
  pkgDirCache.set(key, result);
  return result;
}

export function isWorkspaceSource(pkgDir) {
  try {
    if (!lstatSync(pkgDir).isSymbolicLink()) return false;
    return !realpathSync(pkgDir).split(sep).includes("node_modules");
  } catch {
    return false;
  }
}

const TYPE_CONDITIONS = ["types", "import", "module", "default", "require", "node", "browser"];

/** Resolve an exports target (string | conditions | array) to a types file. */
export function pickTypes(target) {
  if (typeof target === "string") return target;
  if (Array.isArray(target)) {
    for (const t of target) {
      const r = pickTypes(t);
      if (r) return r;
    }
    return null;
  }
  if (target && typeof target === "object") {
    for (const cond of TYPE_CONDITIONS) {
      if (cond in target) {
        const r = pickTypes(target[cond]);
        if (r) return r;
      }
    }
  }
  return null;
}

export function toDeclaration(pkgDir, file) {
  const abs = join(pkgDir, file);
  if (/\.d\.[cm]?ts$/.test(abs) || /\.[cm]?tsx?$/.test(abs) || /\.json$/.test(abs)) {
    return existsSync(abs) ? abs : null;
  }
  if (!/\.[cm]?jsx?$/.test(abs)) return null;
  for (const candidate of [
    abs.replace(/\.m?js$/, ".d.ts"),
    abs.replace(/\.cjs$/, ".d.cts"),
    abs.replace(/\.mjs$/, ".d.mts"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// The RUNTIME side. A .d.ts can promise a value the shipped JavaScript does not carry (a
// hand-written declaration, a bundler that dropped a re-export); the bundler then fails on the
// JS, not the types. So every VALUE import is also looked up in the runtime entry's own exports.
const RUNTIME_CONDITIONS = ["import", "module", "browser", "node", "default", "require"];

/** Resolve an exports target to its runtime JS file (never the `types` condition). */
export function pickRuntime(target) {
  if (typeof target === "string") return /\.d\.[cm]?ts$/.test(target) ? null : target;
  if (Array.isArray(target)) {
    for (const t of target) {
      const r = pickRuntime(t);
      if (r) return r;
    }
    return null;
  }
  if (target && typeof target === "object") {
    for (const cond of RUNTIME_CONDITIONS) {
      if (cond in target) {
        const r = pickRuntime(target[cond]);
        if (r) return r;
      }
    }
  }
  return null;
}

export function resolveRelativeJs(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  for (const c of [base, `${base}.js`, `${base}.mjs`, join(base, "index.js"), join(base, "index.mjs")]) {
    try {
      if (existsSync(c) && !lstatSync(c).isDirectory()) return c;
    } catch {
      /* next candidate */
    }
  }
  return null;
}


/** { entry } | { missingSubpath: true } | { missingFile: path } | { unresolved: reason } */
export function resolveSubpath(pkgDir, manifest, sub) {
  const exp = manifest.exports;
  if (exp === undefined) {
    if (sub !== ".") return { unresolved: "no exports map" };
    const t = manifest.types ?? manifest.typings ?? manifest.module ?? manifest.main ?? "index.js";
    const entry = toDeclaration(pkgDir, t);
    return entry ? { entry } : { unresolved: `no declaration for ${t}` };
  }
  let map = exp;
  if (typeof exp === "string" || Array.isArray(exp) || !Object.keys(exp).some((k) => k.startsWith("."))) {
    map = { ".": exp };
  }
  let target = map[sub];
  if (target === undefined) {
    for (const [key, value] of Object.entries(map)) {
      const star = key.indexOf("*");
      if (star === -1) continue;
      const pre = key.slice(0, star);
      const post = key.slice(star + 1);
      if (sub.startsWith(pre) && sub.endsWith(post) && sub.length >= pre.length + post.length) {
        const mid = sub.slice(pre.length, sub.length - post.length);
        target = JSON.parse(JSON.stringify(value).split("*").join(mid));
        break;
      }
    }
  }
  if (target === undefined || target === null) return { missingSubpath: true };
  const file = pickTypes(target);
  if (!file) return { unresolved: "exports target has no usable condition" };
  const entry = toDeclaration(pkgDir, file);
  const runtimeRel = pickRuntime(target);
  const runtime = runtimeRel && /\.m?js$/.test(runtimeRel) && existsSync(join(pkgDir, runtimeRel)) ? join(pkgDir, runtimeRel) : null;
  // THE 2026-10-07 CASE (v0.4.2980 never deployed): chat 0.4.0 deleted
  // dist/agents/model-registry/, but its `./agents/*` wildcard still MATCHES the specifier, so the
  // subpath looked "exported" and the missing file was filed under NOT CHECKED. A specifier whose
  // exports target names no declaration AND no runtime file on disk is a Turbopack
  // "Module not found" — a finding, never a skip.
  if (!entry && !(runtimeRel && existsSync(join(pkgDir, runtimeRel)))) return { missingFile: runtimeRel ?? file };
  return entry ? { entry, runtime } : { unresolved: `no declaration beside ${file}` };
}

