#!/usr/bin/env node
// check-matrx-imports — EVERY NAMED IMPORT FROM @ai-matrx/* EXISTS IN THE
// INSTALLED PACKAGE.
//
// THE DEFECT THIS EXISTS FOR (2026-09-25, ALC-13)
// -----------------------------------------------
// `features/content-ir/registry/kind-schema-source.ts` landed on main importing
// `createKindValidator` from `@ai-matrx/content-ir/registry`. The export existed
// in aidream's SOURCE (content-ir 0.19.0) but npm still served 0.18.6 and the
// lockfile resolved 0.18.6 — the consumer shipped before the package. The
// shared dev server answered 500 on every route ("Export createKindValidator
// doesn't exist in target module") and Vercel builds v0.4.2360 and v0.4.2361
// went red. Every existing guard was green:
//
//   • check:parse           — the file parses.
//   • check:matrx-packages  — 0.18.6 WAS npm's latest; versions agreed.
//   • check:matrx-dist-integrity — the installed bytes WERE the published bytes.
//   • type-check            — sees it (TS2305), but takes minutes, carries a
//                             backlog, and is advisory.
//
// Nothing asked the one question that mattered: does the package this checkout
// actually INSTALLED ship the name this file imports? This does, in seconds.
//
// WHAT IT CHECKS
// --------------
// Every tracked .ts/.tsx/.mts/.cts/.js/.jsx/.mjs file that mentions `@ai-matrx/`
// is parsed (TypeScript's parser, no type-checking). For every
//   import { a, b as c, type T } from "@ai-matrx/<pkg>[/<subpath>]"
//   export { a } from "@ai-matrx/<pkg>[/<subpath>]"
//   import d from "@ai-matrx/<pkg>"          (default)
// the INSTALLED copy nearest to the importing file (node_modules walked upward,
// exactly how Node and the bundler resolve it) is located, its `exports` map is
// resolved for that subpath to its types entry, and the module's exports are
// read with the TypeScript checker (so `export *` chains are followed). A
// finding names the file, the package, the installed VERSION, the subpath and
// the missing export — or a subpath the package does not export at all.
//
// Workspace links (`link:`/symlinks into source, e.g. packages/*) are skipped:
// source is ahead of npm by design and is not what a registry install ships.
//
//   node scripts/check-matrx-imports.mjs              # exit 1 on a missing export
//   node scripts/check-matrx-imports.mjs --root DIR   # audit another tree
//   node scripts/check-matrx-imports.mjs --self-test  # RED then GREEN, temp tree
//
// Exit codes: 0 clean · 1 an import names something the installed package does
//             not ship · 2 the script itself could not run — never a silent pass.
//
// Remedy for a finding: the consumer shipped before the package. Publish the
// package (aidream's npm train), then `pnpm update "@ai-matrx/<pkg>" --latest`
// and commit the lockfile. Never pin; never delete the import to go green.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const SCOPE = "@ai-matrx/";
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", ".wt", "tmp"]);

// ── file discovery ───────────────────────────────────────────────────────────

function listFiles(root) {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\0").filter((f) => f && SOURCE_EXT.test(f)).map((f) => join(root, f));
  } catch {
    // Not a git tree (the self-test and --root proofs): walk it.
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
        } else if (SOURCE_EXT.test(entry.name)) files.push(join(dir, entry.name));
      }
    };
    walk(root);
    return files;
  }
}

function splitSpecifier(spec) {
  const parts = spec.split("/");
  const name = `${parts[0]}/${parts[1]}`;
  const sub = parts.length > 2 ? `./${parts.slice(2).join("/")}` : ".";
  return { name, sub };
}

/** Every @ai-matrx named import/re-export in one file. */
export function collectImports(file, text) {
  const kind = /\.tsx$|\.jsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
  const found = [];
  for (const stmt of sf.statements) {
    const spec = stmt.moduleSpecifier;
    if (!spec || !ts.isStringLiteral(spec) || !spec.text.startsWith(SCOPE)) continue;
    const line = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1;
    const push = (name) => found.push({ specifier: spec.text, name, line });
    if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      const clause = stmt.importClause;
      if (clause.name) push("default");
      const nb = clause.namedBindings;
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) push((el.propertyName ?? el.name).text);
      }
    } else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) push((el.propertyName ?? el.name).text);
    }
  }
  return found;
}

// ── installed package resolution ─────────────────────────────────────────────

const pkgDirCache = new Map();
/** The installed copy Node would resolve from `fromDir`, or null. */
function findInstalled(fromDir, name, root) {
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

function isWorkspaceSource(pkgDir) {
  try {
    if (!lstatSync(pkgDir).isSymbolicLink()) return false;
    return !realpathSync(pkgDir).split(sep).includes("node_modules");
  } catch {
    return false;
  }
}

const TYPE_CONDITIONS = ["types", "import", "module", "default", "require", "node", "browser"];

/** Resolve an exports target (string | conditions | array) to a types file. */
function pickTypes(target) {
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

function toDeclaration(pkgDir, file) {
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

/** { entry } | { missingSubpath: true } | { unresolved: reason } */
function resolveSubpath(pkgDir, manifest, sub) {
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
  return entry ? { entry } : { unresolved: `no declaration beside ${file}` };
}

// ── the run ──────────────────────────────────────────────────────────────────

export function audit(root) {
  root = resolve(root);
  const files = listFiles(root);
  const imports = []; // { file, line, specifier, name, pkgDir, version, sub, entry }
  const findings = [];
  const skipped = { workspace: 0, notInstalled: new Set(), unresolved: [] };

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes(SCOPE)) continue;
    for (const imp of collectImports(file, text)) {
      const { name: pkg, sub } = splitSpecifier(imp.specifier);
      const pkgDir = findInstalled(dirname(file), pkg, root);
      if (!pkgDir) {
        skipped.notInstalled.add(pkg);
        continue;
      }
      if (isWorkspaceSource(pkgDir)) {
        skipped.workspace++;
        continue;
      }
      const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
      const res = resolveSubpath(pkgDir, manifest, sub);
      const rel = relative(root, file);
      if (res.missingSubpath) {
        findings.push({ file: rel, line: imp.line, pkg, version: manifest.version, sub, name: imp.name, why: "subpath" });
        continue;
      }
      if (res.unresolved) {
        skipped.unresolved.push(`${pkg}@${manifest.version} ${sub}: ${res.unresolved}`);
        continue;
      }
      imports.push({ file: rel, line: imp.line, pkg, version: manifest.version, sub, name: imp.name, entry: res.entry });
    }
  }

  // A JSON subpath (`@ai-matrx/x/package.json`) exports its top-level keys + default.
  const exportsOf = new Map();
  for (const entry of new Set(imports.map((i) => i.entry))) {
    if (!entry.endsWith(".json")) continue;
    const data = JSON.parse(readFileSync(entry, "utf8"));
    exportsOf.set(entry, new Set(["default", ...(data && typeof data === "object" ? Object.keys(data) : [])]));
  }
  // One program over every distinct declaration entry: the checker follows `export *`.
  const entries = [...new Set(imports.map((i) => i.entry))].filter((e) => !e.endsWith(".json"));
  const program = ts.createProgram(entries, {
    noEmit: true,
    skipLibCheck: true,
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    types: [],
  });
  const checker = program.getTypeChecker();
  for (const entry of entries) {
    const sf = program.getSourceFile(entry);
    const sym = sf && checker.getSymbolAtLocation(sf);
    if (!sym) {
      // A declaration with no import/export is a global script: nothing to check against.
      exportsOf.set(entry, null);
      skipped.unresolved.push(`${relative(root, entry)}: not a module (no exports to check)`);
      continue;
    }
    const names = new Set(checker.getExportsOfModule(sym).map((s) => s.escapedName.toString()));
    if (sym.exports?.has("export=")) names.add("default").add("*export=*");
    exportsOf.set(entry, names);
  }
  for (const imp of imports) {
    const names = exportsOf.get(imp.entry);
    if (!names || names.has("*export=*")) continue;
    if (!names.has(imp.name)) findings.push({ ...imp, why: "export" });
  }
  return { files: files.length, imports: imports.length, findings, skipped };
}

function report(result) {
  const { findings } = result;
  const { unresolved, notInstalled, workspace } = result.skipped;
  if (unresolved.length || notInstalled.size || workspace) {
    console.log(
      `[matrx-imports] NOT CHECKED — ${workspace} workspace-source import(s)` +
        (notInstalled.size ? `; not installed: ${[...notInstalled].join(", ")}` : "") +
        (unresolved.length ? `; unresolvable entries:\n    ${unresolved.join("\n    ")}` : ""),
    );
  }
  if (findings.length === 0) {
    console.log(
      `[matrx-imports] OK — ${result.imports} @ai-matrx import name(s) all exist in the installed packages.`,
    );
    return 0;
  }
  const byPkg = new Map();
  for (const f of findings) {
    const key = `${f.pkg}@${f.version}`;
    if (!byPkg.has(key)) byPkg.set(key, []);
    byPkg.get(key).push(f);
  }
  console.error(
    `[matrx-imports] FAIL — ${findings.length} import(s) name something the INSTALLED @ai-matrx package does not ship:`,
  );
  for (const [key, list] of byPkg) {
    console.error(`\n  ${key}`);
    for (const f of list) {
      const target = f.sub === "." ? f.pkg : `${f.pkg}/${f.sub.slice(2)}`;
      const what =
        f.why === "subpath"
          ? `subpath "${f.sub}" is not in the package's exports map`
          : `export "${f.name}" is missing from "${target}"`;
      console.error(`    ${f.file}:${f.line}  ${what}`);
    }
  }
  console.error(
    `\n  The consumer shipped before the package. Publish the package (aidream npm train), then\n` +
      `  \`pnpm update "<pkg>" --latest\` and commit the lockfile. Never pin; never delete the import to go green.`,
  );
  return 1;
}

// ── self-test: the ALC-13 case, RED then GREEN, in a temp tree ──────────────

function writePkg(root, version, withValidator) {
  const dir = join(root, "node_modules", "@ai-matrx", "content-ir");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "@ai-matrx/content-ir",
      version,
      type: "module",
      exports: {
        ".": { import: { types: "./dist/index.d.ts", default: "./dist/index.js" } },
        "./registry": {
          import: { types: "./dist/registry.d.ts", default: "./dist/registry.js" },
          require: { types: "./dist/registry.d.cts", default: "./dist/registry.cjs" },
        },
        "./package.json": "./package.json",
      },
    }),
  );
  writeFileSync(join(dir, "dist", "index.d.ts"), `export * from "./registry.js";\nexport declare const VERSION: string;\n`);
  writeFileSync(
    join(dir, "dist", "kinds.d.ts"),
    `export interface KindSchema { id: string }\n` +
      (withValidator ? `export declare function createKindValidator(): unknown;\n` : ""),
  );
  writeFileSync(join(dir, "dist", "registry.d.ts"), `export * from "./kinds.js";\nexport declare function listKinds(): string[];\n`);
}

function selfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "matrx-imports-"));
  const failures = [];
  try {
    mkdirSync(join(tmp, "features"), { recursive: true });
    writeFileSync(
      join(tmp, "features", "kind-schema-source.ts"),
      `import {\n  createKindValidator,\n  listKinds,\n  type KindSchema,\n} from "@ai-matrx/content-ir/registry";\nexport { VERSION } from "@ai-matrx/content-ir";\nimport { version } from "@ai-matrx/content-ir/package.json";\n`,
    );
    writeFileSync(join(tmp, "features", "subpath.ts"), `import { x } from "@ai-matrx/content-ir/nope";\n`);

    // RED: 0.18.6 does not ship createKindValidator (the live 2026-09-25 case), and a non-exported subpath.
    writePkg(tmp, "0.18.6", false);
    pkgDirCache.clear();
    let r = audit(tmp);
    const miss = r.findings.find((f) => f.name === "createKindValidator");
    if (!miss) failures.push("RED: createKindValidator missing from 0.18.6 was not reported");
    else if (miss.version !== "0.18.6" || miss.pkg !== "@ai-matrx/content-ir" || miss.sub !== "./registry")
      failures.push(`RED: finding does not name package/version/subpath: ${JSON.stringify(miss)}`);
    if (!r.findings.some((f) => f.why === "subpath")) failures.push("RED: non-exported subpath was not reported");
    if (r.findings.some((f) => ["listKinds", "KindSchema", "VERSION", "version"].includes(f.name)))
      failures.push("RED: an export that exists (through export *) was reported missing");

    // GREEN: 0.19.0 ships it; drop the bad subpath file.
    rmSync(join(tmp, "features", "subpath.ts"));
    writePkg(tmp, "0.19.0", true);
    pkgDirCache.clear();
    r = audit(tmp);
    if (r.findings.length) failures.push(`GREEN: expected no findings, got ${JSON.stringify(r.findings)}`);
    if (r.imports !== 5) failures.push(`GREEN: expected 5 checked names, got ${r.imports}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (failures.length) {
    console.error("check-matrx-imports --self-test FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log("check-matrx-imports --self-test OK — RED on the missing export and subpath, GREEN once shipped.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code;
  try {
    if (process.argv.includes("--self-test")) code = selfTest();
    else {
      const i = process.argv.indexOf("--root");
      const root = i !== -1 ? process.argv[i + 1] : join(dirname(fileURLToPath(import.meta.url)), "..");
      code = report(audit(root));
    }
  } catch (err) {
    console.error(`[matrx-imports] could not run: ${err?.stack ?? err}`);
    code = 2;
  }
  process.exitCode = code;
}
