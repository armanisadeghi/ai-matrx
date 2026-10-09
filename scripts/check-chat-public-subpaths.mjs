#!/usr/bin/env node
/**
 * check:chat-public-subpaths — the app reaches @ai-matrx/chat ONLY through its
 * public subpaths (P26, PACKAGE-INDEPENDENCE §5).
 *
 * The public surface is `packages/chat/scripts/public-surface.mjs`: `./host`,
 * `./host/react`, and one pattern per module domain —
 * `@ai-matrx/chat/<domain>/<path/to/module>` naming exactly one module. The
 * packed-tarball canary proves those resolve in the BUILT package; this proves
 * the app asks for nothing else, so the day the app consumes the published
 * package (P27) nothing it imports is missing.
 *
 * Every module specifier outside packages/chat (import/export-from, `import
 * type`, `import()`, `require()`, `jest.mock/requireActual/…`, `import("x")`
 * types) that names @ai-matrx/chat is judged, through the TypeScript parser
 * (comments and strings that are not specifiers are ignored):
 *
 *   SRC        `@ai-matrx/chat/src/…` — the source tree is never an address
 *   ROOT       bare `@ai-matrx/chat` — there is no root entry
 *   DOMAIN     first segment is not a public domain
 *   EXTENSION  the specifier carries a file extension
 *   DIRECTORY  names a directory — name the module (`…/index`)
 *   MISSING    names no module in packages/chat/src
 *   NOT_EXPORTED  names a real module the package does NOT export — the exports map is EXPLICIT
 *              (no wildcards; scripts/public-modules.json). Remedy: reach it through a stable subpath,
 *              or, if the app legitimately needs it, run
 *              `node ../aidream/apps/shared/chat/scripts/sync-public-surface.mjs --write`, commit and publish chat first
 *   TEST_PATH  a runtime file reaches a package test/fixture path
 *
 * A TEST file reaching a package test helper or fixture is allowed and counted
 * (test-only reach): the published package ships no tests, so P27 gives those
 * helpers a public `/testing` home. That count is printed, never hidden.
 *
 *   node scripts/check-chat-public-subpaths.mjs              # judge the app
 *   node scripts/check-chat-public-subpaths.mjs --self-test  # prove it can fail
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = "@ai-matrx/chat";
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const JEST_FNS = /^(mock|doMock|unmock|requireActual|requireMock|createMockFromModule|setMock)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "out", "tmp", "work", "_armani", "_dev", "coverage"]);
const TEST_SEGMENT = /(^|\/)(__tests__|__mocks__|__fixtures__|fixtures|test-utils)(\/|$)|\.(test|spec)$/;
const TEST_IMPORTER = /(^|\/)(__tests__|__mocks__|tests?|e2e|test-utils)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)jest\.[^/]+$/;

const ts = createRequire(path.join(REPO, "package.json"))("typescript");

/**
 * Where @ai-matrx/chat's source lives for `root`: an in-repo `packages/chat` (the self-test's
 * fixture tree), else the aidream checkout beside the repo — the package's one home since P27.
 */
function chatPackageDir(root) {
  const inRepo = path.join(root, "packages/chat");
  if (fs.existsSync(path.join(inRepo, "src"))) return inRepo;
  const beside = path.resolve(root, "../aidream/apps/shared/chat");
  if (!fs.existsSync(path.join(beside, "src")))
    throw new Error(`check-chat-public-subpaths: no @ai-matrx/chat source at ${beside}. Check out aidream beside this repo.`);
  return beside;
}

async function surface(root) {
  const mod = await import(pathToFileURL(path.join(chatPackageDir(root), "scripts/public-surface.mjs")).href);
  return {
    domains: new Set(mod.PUBLIC_DOMAINS),
    named: new Set(Object.keys(mod.NAMED_ENTRIES).map((k) => k.slice(2))),
    modules: new Set(mod.PUBLIC_MODULES),
  };
}

function listFiles(root) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const p = path.join(d, e.name);
      const rel = path.relative(root, p).split(path.sep).join("/");
      if (rel === "packages/chat") continue;
      if (e.isDirectory()) walk(p);
      else if (EXTS.some((x) => e.name.endsWith(x))) out.push(p);
    }
  })(root);
  return out.sort();
}

/** One verdict for one specifier: null (public), "TEST_REACH", or a violation code. */
export function judgeSpec(spec, importerRel, root, { domains, named, modules }) {
  if (spec === SELF) return "ROOT";
  const sub = spec.slice(SELF.length + 1);
  if (named.has(sub)) return null;
  const first = sub.split("/")[0];
  if (first === "src") return "SRC";
  if (!domains.has(first)) return "DOMAIN";
  if (first === "testing" && !TEST_IMPORTER.test(importerRel)) return "TEST_PATH";
  const isTestPath = TEST_SEGMENT.test(sub);
  if (isTestPath && !TEST_IMPORTER.test(importerRel)) return "TEST_PATH";
  const base = path.join(chatPackageDir(root), "src", sub);
  // `a.slice` / `x.types` are module NAMES; `.json` / `.ts` / `.js` are extensions.
  if (/\.(json|[cm]?[jt]sx?|css|md)$/.test(sub)) return isTestPath ? "TEST_REACH" : "EXTENSION";
  if (fs.existsSync(`${base}.ts`) || fs.existsSync(`${base}.tsx`)) {
    if (isTestPath) return "TEST_REACH";
    return modules.has(sub) ? null : "NOT_EXPORTED";
  }
  if (fs.existsSync(path.join(base, "index.ts")) || fs.existsSync(path.join(base, "index.tsx"))) return "DIRECTORY";
  return "MISSING";
}

export async function census(root) {
  const surf = await surface(root);
  const violations = [];
  let publicCount = 0;
  let testReach = 0;
  for (const abs of listFiles(root)) {
    const text = fs.readFileSync(abs, "utf8");
    if (!text.includes(SELF)) continue;
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, /\.(tsx|jsx)$/.test(abs) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const add = (node, spec) => {
      if (spec !== SELF && !spec.startsWith(`${SELF}/`)) return;
      const verdict = judgeSpec(spec, rel, root, surf);
      if (verdict === null) { publicCount += 1; return; }
      if (verdict === "TEST_REACH") { testReach += 1; return; }
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      violations.push({ file: rel, line, spec, code: verdict });
    };
    (function visit(n) {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) add(n, n.moduleSpecifier.text);
      else if (ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteralLike(n.arguments[0])) {
        const ex = n.expression;
        if (ex.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(ex) && ex.text === "require") ||
          (ts.isPropertyAccessExpression(ex) && JEST_FNS.test(ex.name.text))) add(n, n.arguments[0].text);
      } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) add(n, n.argument.literal.text);
      else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && ts.isStringLiteral(n.moduleReference.expression)) add(n, n.moduleReference.expression.text);
      ts.forEachChild(n, visit);
    })(sf);
  }
  return { violations, publicCount, testReach };
}

const REMEDY = {
  SRC: "drop `src/` — the public address is @ai-matrx/chat/<domain>/<module>",
  ROOT: "name a subpath (`@ai-matrx/chat/host`, or `<domain>/<module>`)",
  DOMAIN: "only the domains in packages/chat/scripts/public-surface.mjs are public",
  EXTENSION: "drop the file extension",
  DIRECTORY: "name the module: append `/index`",
  MISSING: "no such module in packages/chat/src",
  NOT_EXPORTED: "a real module the package does not export (the exports map is explicit) — use a stable subpath, or add it: node ../aidream/apps/shared/chat/scripts/sync-public-surface.mjs --write, commit + publish chat first",
  TEST_PATH: "a package test/fixture path is reachable from tests only",
};

async function run(root) {
  const { violations, publicCount, testReach } = await census(root);
  if (violations.length) {
    console.error(`✖ chat public subpaths: ${violations.length} specifier(s) outside the public surface`);
    for (const v of violations) console.error(`  ${v.code.padEnd(9)} ${v.file}:${v.line}  "${v.spec}"  — ${REMEDY[v.code]}`);
    return 1;
  }
  console.log(`✔ chat public subpaths: ${publicCount} app specifier(s) all public; ${testReach} test-only reach into package test helpers/fixtures (leaves at P27 via a /testing subpath)`);
  return 0;
}

async function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat-public-subpaths-"));
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), body); };
  fs.mkdirSync(path.join(root, "packages/chat/scripts"), { recursive: true });
  fs.copyFileSync(path.join(chatPackageDir(REPO), "scripts/public-surface.mjs"), path.join(root, "packages/chat/scripts/public-surface.mjs"));
  fs.copyFileSync(path.join(chatPackageDir(REPO), "scripts/public-modules.json"), path.join(root, "packages/chat/scripts/public-modules.json"));
  // the fixture package exports exactly these (the real list is replaced so the cases are deterministic)
  fs.writeFileSync(path.join(root, "packages/chat/scripts/public-modules.json"), JSON.stringify(["agents/redux/a.slice", "agents/run/index", "testing/fake-db"]));
  w("packages/chat/src/host/index.ts", "export {};");
  w("packages/chat/src/agents/redux/b.internal.ts", "export {};");
  w("packages/chat/src/agents/redux/a.slice.ts", "export {};");
  w("packages/chat/src/agents/run/index.ts", "export {};");
  w("packages/chat/src/testing/fake-db.ts", "export {};");
  const cases = [
    ["features/ok.ts", `import { a } from "@ai-matrx/chat/agents/redux/a.slice"; import "@ai-matrx/chat/host"; // "@ai-matrx/chat/src/x" in a comment\n`, []],
    ["features/src.ts", `import x from "@ai-matrx/chat/src/agents/redux/a.slice";`, ["SRC"]],
    ["features/root.ts", `import x from "@ai-matrx/chat";`, ["ROOT"]],
    ["features/domain.ts", `const m = await import("@ai-matrx/chat/nope/x");`, ["DOMAIN"]],
    ["features/ext.ts", `import x from "@ai-matrx/chat/agents/redux/a.slice.ts";`, ["EXTENSION"]],
    ["features/dir.ts", `jest.mock("@ai-matrx/chat/agents/run");`, ["DIRECTORY"]],
    ["features/not-exported.ts", `import { b } from "@ai-matrx/chat/agents/redux/b.internal";`, ["NOT_EXPORTED"]],
    ["features/missing.ts", `export type T = import("@ai-matrx/chat/agents/gone").T;`, ["MISSING"]],
    ["features/runtime-test-path.ts", `import { fake } from "@ai-matrx/chat/testing/fake-db";`, ["TEST_PATH"]],
    ["features/__tests__/ok-test-reach.test.ts", `import { fake } from "@ai-matrx/chat/testing/fake-db";`, []],
  ];
  let failed = 0;
  for (const [rel, body, want] of cases) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "case-"));
    fs.cpSync(path.join(root, "packages"), path.join(dir, "packages"), { recursive: true });
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
    const got = (await census(dir)).violations.map((v) => v.code);
    const pass = JSON.stringify(got) === JSON.stringify(want);
    if (!pass) failed += 1;
    console.log(`  ${pass ? "✔" : "✖"} ${rel}: want [${want}] got [${got}]`);
  }
  console.log(failed ? `✖ self-test: ${failed} case(s) wrong` : `✔ self-test: ${cases.length}/${cases.length}`);
  return failed ? 1 : 0;
}

process.exit(process.argv.includes("--self-test") ? await selfTest() : await run(REPO));
