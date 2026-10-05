#!/usr/bin/env tsx
/**
 * check-page-imports — ONLY A ROUTE MAY IMPORT A ROUTE'S PAGE.
 *
 * WHAT HAPPENED (2026-10-01). `features/user-lists/components/PicklistWindowBody.tsx` imported
 * `@/app/(core)/data/[tableId]/page` to mount the table page inside a window. The admin build
 * (Vercel `ai-matrx-manage`, MATRX_PROFILE=admin) PARKS app/(core) out of the tree, and the window
 * is reachable from the root layout (OverlayController), so manage.aimatrx.com failed to build on
 * main: "Module not found: Can't resolve '@/app/(core)/data/[tableId]/page'". Locally nothing is
 * ever parked (THE PARK LAW in next.config.js), so no local build or tsc can see it.
 *
 * THE RULE. A route leaf (page, layout, template, default, loading, error, not-found, global-error)
 * under app/ is imported only by Next, by another route leaf (a page re-exporting a page), or by a
 * test. Every other file — features/, components/, lib/, and component files inside app/ — imports
 * the shared piece from a feature module instead (for the table page:
 * features/unified-data/table-page/UnifiedDataTablePage.tsx). `import type` is erased and allowed.
 *
 *   pnpm check:page-imports              fail (exit 1) on any finding
 *   pnpm check:page-imports --root <dir> scan another checkout (e.g. a `git archive` of a commit)
 *   pnpm check:page-imports:self-test    plants REDs and GREENs in a temp dir and proves each
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import * as ts from "typescript";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROUTE_LEAVES = new Set([
  "page",
  "layout",
  "template",
  "default",
  "loading",
  "error",
  "not-found",
  "global-error",
]);
const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/;
const RESOLVE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".dev.tsx", ".dev.ts", ".mjs", ".cjs"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", ".turbo", ".wt"]);

interface Finding {
  file: string;
  line: number;
  specifier: string;
  target: string;
}

function isTest(rel: string): boolean {
  return /(^|\/)__tests__\//.test(rel) || /\.(test|spec|live\.test)\.[cm]?[jt]sx?$/.test(rel) || /(^|\/)(e2e|tests?)\//.test(rel);
}

/** `app/x/page.tsx` or `app/x/page.dev.tsx` → true. */
function isRouteLeaf(rel: string): boolean {
  if (!rel.startsWith("app/")) return false;
  const name = basename(rel).replace(SOURCE_EXT, "").replace(/\.dev$/, "");
  return ROUTE_LEAVES.has(name);
}

function listFiles(root: string): string[] {
  try {
    const out = execFileSync("git", ["-C", root, "ls-files", "-co", "--exclude-standard"], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\n").filter((f) => f && SOURCE_EXT.test(f) && !f.split("/").some((p) => SKIP_DIRS.has(p)));
  } catch {
    // Not a git checkout (a `git archive` export, the self-test tree): walk the disk.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue;
        const abs = join(dir, entry);
        if (statSync(abs).isDirectory()) walk(abs);
        else if (SOURCE_EXT.test(entry)) files.push(relative(root, abs).split(sep).join("/"));
      }
    };
    walk(root);
    return files;
  }
}

function resolveSpecifier(root: string, importerRel: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(root, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = resolve(root, dirname(importerRel), spec);
  else return null;
  const candidates = [base, ...RESOLVE_EXTS.map((e) => base + e), ...RESOLVE_EXTS.map((e) => join(base, "index" + e))];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return relative(root, c).split(sep).join("/");
  }
  // Unresolvable (a parked group, a deleted file): judge by the specifier's own path.
  const rel = relative(root, base).split(sep).join("/");
  return rel.startsWith("app/") ? rel + ".tsx" : null;
}

function specifiersOf(file: string, source: string): { spec: string; line: number }[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { spec: string; line: number }[] = [];
  const add = (node: ts.Node, lit: ts.Expression | undefined) => {
    if (lit && ts.isStringLiteralLike(lit)) out.push({ spec: lit.text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly) add(node, node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly) add(node, node.moduleSpecifier);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isDynamic = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === "require";
      if ((isDynamic || isRequire) && node.arguments.length) add(node, node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function scan(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const rel of listFiles(root)) {
    if (isTest(rel) || isRouteLeaf(rel) || rel.startsWith("scripts/")) continue;
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const source = readFileSync(abs, "utf8");
    if (!source.includes("page") && !source.includes("layout") && !/(template|default|loading|error|not-found)['"]/.test(source)) continue;
    for (const { spec, line } of specifiersOf(rel, source)) {
      const target = resolveSpecifier(root, rel, spec);
      if (target && isRouteLeaf(target)) findings.push({ file: rel, line, specifier: spec, target });
    }
  }
  return findings;
}

function report(findings: Finding[], root: string): number {
  if (!findings.length) {
    console.log(`✓ check:page-imports — no file outside a route imports a route's page/layout module (${root}).`);
    return 0;
  }
  console.log(`✗ check:page-imports — ${findings.length} import(s) of a route module from outside a route:\n`);
  for (const f of findings) console.log(`  ${f.file}:${f.line}  imports "${f.specifier}"  (${f.target})`);
  console.log(
    `\nA route group can be parked out of a Vercel build (manage.aimatrx.com parks app/(core)), so this ` +
      `import breaks that build. Move what the page renders into a feature module, import it from the ` +
      `page AND from here, and leave the page a thin mount.`,
  );
  return 1;
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "check-page-imports-"));
  const put = (rel: string, body: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  };
  try {
    put("app/(core)/t/[id]/page.tsx", `export default function P() { return null; }\n`);
    put("app/(core)/t/[id]/layout.tsx", `export default function L() { return null; }\n`);
    put("app/(core)/u/page.tsx", `export { default } from "../t/[id]/page";\n`); // GREEN: route re-exports route
    put("app/(core)/t/[id]/page.test.tsx", `import P from "./page";\n`); // GREEN: test
    put("features/a/Typed.tsx", `import type P from "@/app/(core)/t/[id]/page";\n`); // GREEN: type-only
    put("features/a/Alias.tsx", `import P from "@/app/(core)/t/[id]/page";\n`); // RED
    put("features/a/Lazy.tsx", `const P = () => import("@/app/(core)/t/[id]/layout");\n`); // RED
    put("app/(core)/t/[id]/Inner.tsx", `import P from "./page";\n`); // RED: component inside app
    put("components/b/Parked.tsx", `import P from "@/app/(admin)/gone/page";\n`); // RED: unresolvable (parked)
    const got = scan(dir).map((f) => f.file).sort();
    const want = ["app/(core)/t/[id]/Inner.tsx", "components/b/Parked.tsx", "features/a/Alias.tsx", "features/a/Lazy.tsx"];
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(ok ? `✓ self-test: 4 planted REDs caught, 3 GREENs passed.` : `✗ self-test: wanted ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    return ok ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const rootIdx = process.argv.indexOf("--root");
  const root = rootIdx > -1 ? resolve(process.argv[rootIdx + 1]) : process.cwd();
  return report(scan(root), root);
}

exitAfterDrain(main());
