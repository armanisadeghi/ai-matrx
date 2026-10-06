#!/usr/bin/env node
/**
 * THE PACKED-TARBALL CANARY for @ai-matrx/chat (P26).
 *
 * A green source build is not package proof. This packs dist/ exactly as npm
 * would serve it, unpacks it into an EMPTY consumer project, and proves on the
 * artifact — never on src/:
 *
 *   1. RESOLUTION (Node): every public subpath — one per shipped module, named
 *      from the tarball's own file list — resolves through the published
 *      `exports`; `src/…`, a test file and an unknown domain do NOT.
 *   2. GRAPH (bundler): one esbuild pass imports every public subpath from the
 *      installed package; a broken relative specifier, a missing module or a
 *      bad export target anywhere in ≈1,500 modules fails it.
 *   3. "use client": each shipped .js carries the directive exactly when its
 *      source does — a stamped pure module is a client reference inside an
 *      RSC, an unstamped hook module is a server build error.
 *   4. TYPES: a consumer file type-imports every public subpath under
 *      `moduleResolution: bundler`; each must find its .d.ts.
 *   5. MANIFEST: every @ai-matrx/* dependency is "latest" (THE LATEST LAW), no
 *      peer is a pin, and `private` is absent.
 *
 * Dependencies are not downloaded: the consumer's node_modules links the app's
 * installed copies (the same bytes the app runs), and the package itself is the
 * unpacked tarball — nothing of the workspace is visible to it.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NAMED_ENTRIES } from "./public-surface.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(pkgDir, "../..");
const dist = join(pkgDir, "dist");
if (!existsSync(join(dist, "package.json"))) {
  console.error("✖ no dist/package.json — run `pnpm build` first");
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "ai-matrx-chat-canary-"));
const failures = [];
const ok = (msg) => console.log(`  ✔ ${msg}`);
const fail = (msg) => failures.push(msg);

// ── pack + unpack into an empty consumer ─────────────────────────────────────
const tgzName = execFileSync("npm", ["pack", "--silent", "--pack-destination", work], { cwd: dist, encoding: "utf8" })
  .trim().split("\n").pop();
const tgz = join(work, tgzName);
const consumer = join(work, "consumer");
const installed = join(consumer, "node_modules", "@ai-matrx", "chat");
mkdirSync(installed, { recursive: true });
execFileSync("tar", ["-xzf", tgz, "-C", installed, "--strip-components=1"]);
writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "chat-canary", private: true, type: "module" }));
const appModules = join(appRoot, "node_modules");
for (const name of readdirSync(appModules)) {
  if (name.startsWith(".")) continue;
  if (name.startsWith("@")) {
    mkdirSync(join(consumer, "node_modules", name), { recursive: true });
    for (const sub of readdirSync(join(appModules, name))) {
      if (name === "@ai-matrx" && sub === "chat") continue;
      symlinkSync(join(appModules, name, sub), join(consumer, "node_modules", name, sub));
    }
  } else {
    symlinkSync(join(appModules, name), join(consumer, "node_modules", name));
  }
}
console.log(`canary: ${tgzName} unpacked into ${consumer}`);

// ── the public subpaths, from the TARBALL's own file list ────────────────────
const shipped = execFileSync("tar", ["-tzf", tgz], { encoding: "utf8" })
  .split("\n").filter(Boolean).map((f) => f.replace(/^package\//, ""));
const modules = shipped.filter((f) => f.endsWith(".js"));
const subpaths = modules.map((f) => `@ai-matrx/chat/${f.slice(0, -3)}`);
for (const [sub] of Object.entries(NAMED_ENTRIES)) subpaths.push(`@ai-matrx/chat/${sub.slice(2)}`);

// 5. manifest
const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
const pinned = Object.entries(manifest.dependencies ?? {}).filter(([n, v]) => n.startsWith("@ai-matrx/") && v !== "latest");
if (pinned.length) fail(`@ai-matrx dependencies not "latest": ${pinned.map(([n, v]) => `${n}@${v}`).join(", ")}`);
const pinnedPeers = Object.entries(manifest.peerDependencies ?? {}).filter(([, v]) => /^\d/.test(v));
if (pinnedPeers.length) fail(`peer pinned: ${pinnedPeers.map(([n, v]) => `${n}@${v}`).join(", ")}`);
if (manifest.private) fail("published manifest is private");
if (shipped.some((f) => /__tests__|fixtures\/|\.test\./.test(f))) fail("a test or fixture file shipped");
if (!pinned.length && !pinnedPeers.length) ok(`manifest: ${Object.keys(manifest.dependencies).length} deps (@ai-matrx/* latest), peers ${Object.keys(manifest.peerDependencies).join(", ")}`);

// 1. Node resolution through `exports`
const probe = join(consumer, "probe.mjs");
writeFileSync(probe, `
const subs = ${JSON.stringify(subpaths)};
const mustFail = ["@ai-matrx/chat/src/host/index", "@ai-matrx/chat/testing/fake-db", "@ai-matrx/chat/not-a-domain/x", "@ai-matrx/chat"];
const bad = []; const leaked = [];
for (const s of subs) { try { import.meta.resolve(s); } catch (e) { bad.push(s + " :: " + e.code); } }
for (const s of mustFail) {
  let resolved = null;
  try { resolved = import.meta.resolve(s); } catch { continue; }
  // A pattern can map a test path to a file name that was never shipped.
  const { existsSync } = await import("node:fs");
  if (existsSync(new URL(resolved))) leaked.push(s);
}
console.log(JSON.stringify({ bad, leaked }));
`);
const res = JSON.parse(execFileSync(process.execPath, [probe], { cwd: consumer, encoding: "utf8" }));
if (res.bad.length) fail(`${res.bad.length} public subpath(s) do not resolve in Node: ${res.bad.slice(0, 5).join(" | ")}`);
else ok(`Node resolves all ${subpaths.length} public subpaths through exports`);
if (res.leaked.length) fail(`non-public specifier resolves to a shipped file: ${res.leaked.join(", ")}`);
else ok("src/…, test paths, unknown domains and the bare root stay unresolvable");

// 2. one bundler pass over every public subpath
const esbuild = await import(pathToFileURL(join(appModules, "esbuild", "lib", "main.js")).href);
const entry = join(consumer, "all.mjs");
writeFileSync(entry, subpaths.map((s, i) => `import * as m${i} from ${JSON.stringify(s)}; void m${i};`).join("\n"));
try {
  const out = await esbuild.build({
    absWorkingDir: consumer, entryPoints: [entry], bundle: true, write: false, format: "esm",
    platform: "browser", logLevel: "silent", jsx: "automatic", metafile: true,
    plugins: [{
      name: "externalize-everything-but-chat",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (a) =>
          a.path === "@ai-matrx/chat" || a.path.startsWith("@ai-matrx/chat/") ? undefined : { path: a.path, external: true });
      },
    }],
  });
  const inputs = Object.keys(out.metafile.inputs).filter((p) => p.includes("@ai-matrx/chat/")).length;
  ok(`esbuild bundles every public subpath from the installed package (${inputs} modules in the graph)`);
} catch (e) {
  fail(`bundler pass failed: ${(e.errors ?? []).slice(0, 5).map((x) => `${x.location?.file}:${x.location?.line} ${x.text}`).join(" | ") || e.message}`);
}

// 3. "use client" exactness, module by module against the source
// The directive is the first statement; only whole comments may precede it
// (a comment that MENTIONS 'use client' is not one).
const DIRECTIVE = {
  test(code) {
    let i = 0;
    for (;;) {
      while (i < code.length && /\s/.test(code[i])) i += 1;
      if (code.startsWith("//", i)) { const n = code.indexOf("\n", i); i = n < 0 ? code.length : n; continue; }
      if (code.startsWith("/*", i)) { const n = code.indexOf("*/", i + 2); i = n < 0 ? code.length : n + 2; continue; }
      break;
    }
    return /^["']use client["']/.test(code.slice(i, i + 13));
  },
};
let stamped = 0; const drift = [];
for (const f of modules) {
  const base = join(pkgDir, "src", f.slice(0, -3));
  const src = [`${base}.ts`, `${base}.tsx`].find(existsSync);
  if (!src) { drift.push(`${f} (no source)`); continue; }
  const want = DIRECTIVE.test(readFileSync(src, "utf8"));
  const got = DIRECTIVE.test(readFileSync(join(installed, f), "utf8"));
  if (got) stamped += 1;
  if (want !== got) drift.push(`${f} source=${want} shipped=${got}`);
}
if (drift.length) fail(`"use client" drift in ${drift.length} module(s): ${drift.slice(0, 5).join(" | ")}`);
else ok(`"use client" exact on all ${modules.length} modules (${stamped} client, ${modules.length - stamped} pure)`);

// 4. types for every public subpath
const typesEntry = join(consumer, "types.ts");
writeFileSync(typesEntry, subpaths.map((s, i) => `import type * as t${i} from ${JSON.stringify(s)};\nexport type T${i} = typeof t${i};`).join("\n"));
writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "es2022", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", strict: true,
    skipLibCheck: true, noEmit: true, types: [], lib: ["dom", "esnext"],
  },
  files: ["types.ts"],
}));
try {
  execFileSync("bash", [join(appRoot, "scripts", "tsc-capped.sh"), "tsc", "-p", join(consumer, "tsconfig.json")], {
    cwd: appRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  ok(`types resolve for all ${subpaths.length} public subpaths`);
} catch (e) {
  const lines = `${e.stdout ?? ""}${e.stderr ?? ""}`.split("\n").filter((l) => l.includes("error TS"));
  fail(`types: ${lines.length} error(s): ${lines.slice(0, 5).join(" | ")}`);
}

if (failures.length) {
  console.error(`\n✖ tarball canary FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n✔ tarball canary passed: ${tgzName}, ${modules.length} modules, ${subpaths.length} public subpaths`);
