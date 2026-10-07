#!/usr/bin/env node
// against-live — would this Applet row break on the DEPLOYED site? (lane N, 2026-10-07)
//
// THE DEFECT: Applet rows (app.definition.files) are compiled in the browser by the host against the
// @ai-matrx/* packages the DEPLOYED build carries. A row was updated to use `WritingBox` (applets 0.8.0+)
// while https://www.aimatrx.com still served a build locked to applets 0.7.7, so 7 live Applets broke.
// `applet-render-sweep.ts` compiles against the LOCALLY INSTALLED packages, so it said 107/107 ok.
//
// THE CHECK: read the deployed commit from /api/version, read pnpm-lock.yaml AT THAT COMMIT, take the
// version of every @ai-matrx/* package the rows import, `npm pack` exactly those tarballs (cached), unpack
// them into a scratch node_modules, and run check-matrx-imports' audit() over the rows' files — every
// named import must exist in the DEPLOYED version's exports (types and runtime).
//
//   node scripts/applets/against-live.mjs --self-test    # RED on a symbol absent from the old version, then GREEN
//
// Used by `applet-render-sweep.ts --against-live`. Exit codes follow the sweep: a row that would break = 1.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { audit, collectImports } from "../check-matrx-imports.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VERSION_URL = "https://www.aimatrx.com/api/version";
const CACHE = process.env.MATRX_APPLET_LIVE_CACHE ?? join(homedir(), ".cache", "matrx-applet-against-live");

export async function deployedCommit(url = VERSION_URL) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const body = await res.json();
  if (typeof body.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(body.commit)) throw new Error(`${url} carried no commit: ${JSON.stringify(body)}`);
  return body.commit;
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/** pnpm-lock.yaml text at `commit`, fetching the commit when this checkout lacks it. */
export function lockfileAt(commit) {
  try {
    git(["cat-file", "-e", `${commit}^{commit}`]);
  } catch {
    git(["fetch", "--quiet", "origin", commit]);
  }
  return git(["show", `${commit}:pnpm-lock.yaml`]);
}

/** { "@ai-matrx/applets": "0.7.7", ... } from the ROOT importer of a pnpm lockfile. */
export function lockedMatrxVersions(lockText) {
  const out = {};
  const lines = lockText.split("\n");
  const start = lines.findIndex((l) => l === "importers:");
  if (start < 0) throw new Error("lockfile has no importers section");
  let inRoot = false;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l)) break; // next top-level key
    if (/^  \S/.test(l)) {
      inRoot = l.trim() === ".:";
      continue;
    }
    if (!inRoot) continue;
    const m = l.match(/^ {6}'?(@ai-matrx\/[^':]+)'?:\s*$/);
    if (!m) continue;
    const v = (lines[i + 2] ?? "").match(/^ {8}version:\s*([^\s(]+)/);
    if (v) out[m[1]] = v[1];
  }
  return out;
}

function packTarball(pkg, version) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${pkg.replace("@", "").replace("/", "-")}-${version}.tgz`);
  if (!existsSync(file)) {
    execFileSync("npm", ["pack", `${pkg}@${version}`, "--pack-destination", CACHE, "--silent"], { stdio: ["ignore", "pipe", "inherit"] });
  }
  if (!existsSync(file)) throw new Error(`npm pack ${pkg}@${version} produced no ${file}`);
  return file;
}

function unpack(tgz, dest) {
  mkdirSync(dest, { recursive: true });
  execFileSync("tar", ["-xzf", tgz, "-C", dest, "--strip-components=1"]);
}

/**
 * Audit `rows` ({slug, files}) against an installed-package tree. `versions` is {pkg: version}; each is
 * installed from `fetchTarball(pkg, version)` (a .tgz path). Returns { findings, scratch }.
 */
export function checkRowsAgainstVersions(rows, versions, fetchTarball = packTarball) {
  const scratch = mkdtempSync(join(tmpdir(), "applet-live-"));
  try {
    const used = new Set();
    for (const row of rows) {
      for (const [file, src] of Object.entries(row.files ?? {})) {
        if (!src.includes("@ai-matrx/")) continue;
        const dest = join(scratch, "rows", row.slug, file);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, src);
        const ext = /\.(ts|tsx|js|jsx|mjs|mts|cts)$/.test(file) ? "" : ".tsx";
        if (ext) writeFileSync(`${dest}${ext}`, src);
        for (const imp of collectImports(dest + ext, src)) used.add(imp.specifier.split("/").slice(0, 2).join("/"));
      }
    }
    const notLocked = [];
    for (const pkg of used) {
      const version = versions[pkg];
      if (!version) {
        notLocked.push(pkg);
        continue;
      }
      unpack(fetchTarball(pkg, version), join(scratch, "node_modules", pkg));
    }
    writeFileSync(join(scratch, "package.json"), "{}");
    const result = audit(scratch, { only: ["rows"] }); // rows only: the package-graph audit of the unpacked deps is not the rows
    const findings = result.findings.map((f) => {
      const m = f.file.replace(/\\/g, "/").match(/^rows\/([^/]+)\//);
      return { ...f, slug: m ? m[1] : f.file };
    });
    for (const pkg of notLocked) findings.push({ slug: "(any)", file: pkg, line: 0, pkg, version: "(not in deployed lockfile)", sub: ".", name: "*", why: "not-deployed" });
    return { findings };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** The whole live check for rows read from the database. */
export async function checkRowsAgainstLive(rows) {
  const commit = await deployedCommit();
  const versions = lockedMatrxVersions(lockfileAt(commit));
  const { findings } = checkRowsAgainstVersions(rows, versions);
  return { commit, versions, findings };
}

export function describeFinding(f) {
  const target = f.sub === "." ? f.pkg : `${f.pkg}/${String(f.sub).slice(2)}`;
  if (f.why === "not-deployed") return `${f.pkg} is not a dependency of the deployed build`;
  if (f.why === "subpath") return `${target} does not exist in deployed ${f.pkg}@${f.version}`;
  return `"${f.name}" from "${target}" is missing in deployed ${f.pkg}@${f.version}`;
}

// ── self-test: a fixture row importing a symbol absent from the older (deployed) version ────────────────

function fakeTarball(dir, name, version, exportsSrc) {
  const root = join(dir, `${name}-${version}`);
  mkdirSync(join(root, "package"), { recursive: true });
  writeFileSync(join(root, "package", "package.json"), JSON.stringify({ name: `@ai-matrx/${name}`, version, type: "module", exports: { "./react": { types: "./react.d.ts", import: "./react.js" } } }));
  writeFileSync(join(root, "package", "react.js"), exportsSrc.map((n) => `export const ${n} = 1;`).join("\n"));
  writeFileSync(join(root, "package", "react.d.ts"), exportsSrc.map((n) => `export declare const ${n}: number;`).join("\n"));
  const tgz = join(dir, `${name}-${version}.tgz`);
  execFileSync("tar", ["-czf", tgz, "-C", root, "package"]);
  return tgz;
}

export function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "against-live-selftest-"));
  const failures = [];
  try {
    const old = fakeTarball(dir, "applets", "0.7.7", ["Card"]);
    const neu = fakeTarball(dir, "applets", "0.8.0", ["Card", "WritingBox"]);
    const fetchTarball = (_pkg, v) => (v === "0.7.7" ? old : neu);
    const rows = [
      { slug: "uses-new-export", files: { "App.tsx": `import { Card, WritingBox } from "@ai-matrx/applets/react";\nexport default function A(){return null}` } },
      { slug: "uses-old-only", files: { "App.tsx": `import { Card } from "@ai-matrx/applets/react";\nexport default function B(){return null}` } },
    ];
    const red = checkRowsAgainstVersions(rows, { "@ai-matrx/applets": "0.7.7" }, fetchTarball).findings;
    if (red.length !== 1 || red[0].slug !== "uses-new-export" || red[0].name !== "WritingBox") failures.push(`RED: expected exactly uses-new-export/WritingBox flagged on 0.7.7, got ${JSON.stringify(red.map((f) => [f.slug, f.name]))}`);
    const green = checkRowsAgainstVersions(rows, { "@ai-matrx/applets": "0.8.0" }, fetchTarball).findings;
    if (green.length !== 0) failures.push(`GREEN: expected no findings on 0.8.0, got ${JSON.stringify(green.map((f) => [f.slug, f.name]))}`);
    const lock = `importers:\n\n  .:\n    dependencies:\n      '@ai-matrx/applets':\n        specifier: latest\n        version: 0.7.7(react@19.3.0)\n      '@ai-matrx/agents':\n        specifier: latest\n        version: 1.2.3\n\n  other:\n    dependencies:\n      '@ai-matrx/applets':\n        specifier: latest\n        version: 9.9.9\n\npackages:\n`;
    const parsed = lockedMatrxVersions(lock);
    if (parsed["@ai-matrx/applets"] !== "0.7.7" || parsed["@ai-matrx/agents"] !== "1.2.3") failures.push(`lock parse: ${JSON.stringify(parsed)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (failures.length) {
    console.error("against-live --self-test FAILED:\n  " + failures.join("\n  "));
    return 1;
  }
  console.log("against-live --self-test OK — RED on WritingBox absent from applets 0.7.7, GREEN on 0.8.0; lockfile root-importer parse correct.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--self-test")) process.exitCode = selfTest();
  else console.error("usage: node scripts/applets/against-live.mjs --self-test  (the check itself runs via applet-render-sweep.ts --against-live)");
}
