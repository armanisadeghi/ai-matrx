#!/usr/bin/env node
/**
 * Second half of `pnpm build` (P26): make every specifier in dist/ explicit and
 * write the publish manifest.
 *
 * 1. EXPLICIT SPECIFIERS. tsup (bundle: false) and tsc keep source specifiers
 *    verbatim: `./thing` and `@ai-matrx/chat/agents/x`. Node ESM resolves
 *    neither (no extension probing, no directory index), and a self-reference
 *    would tie internal wiring to the public export map. Every relative and
 *    self specifier in each .js and .d.ts is rewritten to the exact relative
 *    file (`./thing.js` or `./thing/index.js`). A specifier that resolves to
 *    nothing FAILS the build, by file and line.
 * 2. PUBLISH MANIFEST. `dist/package.json` is the package.json the tarball
 *    ships: the published `exports` from public-surface.mjs, the peers, and the
 *    runtime dependencies — every bare import found in dist/, each one
 *    declared (`@ai-matrx/*` as "latest", THE LATEST LAW; third-party at the
 *    app's declared range). An undeclarable bare import FAILS the build.
 *
 * The workspace package.json stays dependency-free on purpose: in this repo the
 * package resolves its dependencies from the app's node_modules (one copy of
 * each), and declaring them here would let pnpm install a second copy beside
 * the app's. P27 moves these fields into the real manifest in aidream.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";
import { NAMED_ENTRIES, publishedExports } from "./public-surface.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(pkgDir, "dist");
const appRoot = resolve(pkgDir, "../..");
const SELF = "@ai-matrx/chat";

/** Peers: one copy must exist in the host; the host installs them. */
export const PEERS = ["react", "react-dom", "react-redux", "@reduxjs/toolkit", "next"];
/** A peer is a floor, never the app's pin (the app carries canary `next`). */
const PEER_RANGES = {
  react: ">=19.0.0",
  "react-dom": ">=19.0.0",
  "react-redux": ">=9.0.0",
  "@reduxjs/toolkit": ">=2.0.0",
  next: ">=16.0.0-0",
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".js") || p.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** Absolute dist path (no extension) -> explicit file, or null. */
function explicit(baseNoExt) {
  if (existsSync(`${baseNoExt}.js`)) return `${baseNoExt}.js`;
  if (existsSync(join(baseNoExt, "index.js"))) return join(baseNoExt, "index.js");
  // type-only modules: tsup emits an (empty) .js for every .ts, so a .d.ts
  // without a .js means the target was never a module of this package.
  return null;
}

function toRelative(fromFile, targetFile) {
  let r = relative(dirname(fromFile), targetFile).split("\\").join("/");
  if (!r.startsWith(".")) r = `./${r}`;
  return r;
}

const SPEC = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bexport\s*\*\s*from\s*)(["'])([^"'\n]+)\2/g;
const failures = [];
const bare = new Map(); // package name -> first file using it

// Comments are prose (JSDoc quoting `import "x"` is common); only code counts.
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

for (const file of walk(dist)) {
  const src = readFileSync(file, "utf8");
  for (const m of stripComments(src).matchAll(SPEC)) {
    const spec = m[3];
    if (spec.startsWith(".") || spec === SELF || spec.startsWith(`${SELF}/`)) continue;
    if (spec.startsWith("node:") || builtinModules.includes(spec.split("/")[0])) continue;
    const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    if (!bare.has(name)) bare.set(name, relative(dist, file));
  }
  const isDts = file.endsWith(".d.ts");
  const next = src.replace(SPEC, (whole, lead, q, spec) => {
    let target = null;
    if (spec.startsWith("./") || spec.startsWith("../")) {
      if (/\.(js|json|css)$/.test(spec)) return whole;
      target = explicit(resolve(dirname(file), spec));
    } else if (spec === SELF || spec.startsWith(`${SELF}/`)) {
      const sub = spec === SELF ? "." : `./${spec.slice(SELF.length + 1)}`;
      const named = NAMED_ENTRIES[sub];
      target = explicit(join(dist, named ?? sub.slice(2)));
    } else {
      return whole;
    }
    if (!target) {
      const line = src.slice(0, src.indexOf(whole)).split("\n").length;
      failures.push(`${relative(pkgDir, file)}:${line}  unresolved "${spec}"`);
      return whole;
    }
    return `${lead}${q}${toRelative(file, target)}${q}`;
  });
  if (next !== src) writeFileSync(file, next);
  void isDts;
}

// ── the publish manifest ─────────────────────────────────────────────────────
const workspace = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const app = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
// A type a peer re-exposes (RTK's `reselect`, `redux-thunk`) is declared at the
// range that peer itself depends on, so the consumer resolves the same copy.
const peerRange = (name) => {
  for (const peer of PEERS) {
    const f = join(appRoot, "node_modules", peer, "package.json");
    if (!existsSync(f)) continue;
    const range = JSON.parse(readFileSync(f, "utf8")).dependencies?.[name];
    if (range) return range;
  }
  return null;
};
const appRange = (name) => app.dependencies?.[name] ?? app.devDependencies?.[name] ?? peerRange(name);

const peerDependencies = {};
const dependencies = {};
// Names only a server file or a build script reads, never shipped to a browser
// consumer as a dependency of the chat package.
const NEVER_DEPS = new Set(["server-only", "typescript"]);
for (const [name, where] of [...bare.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  if (name === SELF || NEVER_DEPS.has(name)) continue;
  if (PEERS.includes(name)) {
    peerDependencies[name] = PEER_RANGES[name];
  } else if (name.startsWith("@ai-matrx/")) {
    dependencies[name] = "latest";
  } else {
    const range = appRange(name);
    if (!range) failures.push(`dist/${where}  imports "${name}", which the app does not declare — add it to the app or remove the import`);
    else dependencies[name] = range;
  }
}
if (bare.has("server-only")) dependencies["server-only"] = appRange("server-only") ?? "latest";

const manifest = {
  name: SELF,
  version: workspace.version,
  description: workspace.description,
  type: "module",
  sideEffects: true,
  license: "MIT",
  repository: { type: "git", url: "git+https://github.com/AI-Matrix-Engine/aidream.git", directory: "apps/shared/chat" },
  files: ["**/*.js", "**/*.d.ts", "README.md"],
  exports: Object.fromEntries(
    Object.entries(publishedExports()).map(([k, v]) => [
      k,
      typeof v === "string" ? v : { types: v.types.replace("./dist/", "./"), import: v.import.replace("./dist/", "./") },
    ]),
  ),
  peerDependencies,
  dependencies,
};
writeFileSync(join(dist, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);

if (failures.length) {
  console.error(`✖ finish-build: ${failures.length} problem(s)`);
  for (const f of failures.slice(0, 80)) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `✔ finish-build: specifiers explicit across ${walk(dist).length} files; manifest declares ${Object.keys(peerDependencies).length} peers + ${Object.keys(dependencies).length} dependencies`,
);
