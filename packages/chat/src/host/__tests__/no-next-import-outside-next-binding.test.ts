/**
 * no-next-import-outside-next-binding (R10, slice P10).
 *
 * The package runs in hosts that are not Next.js (matrx-extend, matrx-local,
 * mobile). Every Next-only module it needs lives in ONE place — the binding
 * under `packages/chat/src/next/**` — and everything else reaches routing
 * through the navigation port (`host/navigation`), whose default works
 * without Next.
 *
 * Fails on any import of `next` or `next/*` (static, `import type`, `export
 * from`, `import()`, `require()`) in a file under packages/chat/src that is
 * not under `src/next/`. Test files too: a test that still mocks
 * `next/navigation` for a package component mocks something that component
 * no longer reads — mock the seam (`host/navigation`) instead. Mocking any
 * other `next/*` module stays allowed: `next/dynamic` (the binding's lazy
 * modules read it) and modules only the app reaches (`next/cache`).
 * Comments are ignored (TypeScript parser).
 *
 * Remedy printed with each site: routing → `host/navigation` (`useRouter`,
 * `usePathname`, `useSearchParams`, `Link`); `next/dynamic` → a module under
 * `src/next/lazy/`; `next/headers` → a reader under `src/next/server/`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

const SRC = path.resolve(__dirname, "../..");
const BINDING = path.join(SRC, "next") + path.sep;

/**
 * Routing modules the package reads only through the navigation port; a test
 * mocking them mocks nothing a package component reads. (`next/dynamic` stays
 * mockable: the binding's lazy modules import it.)
 */
const SEAMED = new Set(["next/navigation", "next/link"]);

const MOCK_CALLS = new Set(["mock", "doMock", "unmock", "dontMock", "requireActual", "requireMock"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) files(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const isNext = (spec: string) => spec === "next" || spec.startsWith("next/");

function remedy(spec: string): string {
  if (spec === "next/navigation" || spec === "next/link")
    return "import useRouter / usePathname / useSearchParams / Link from the package's host/navigation seam";
  if (spec === "next/dynamic") return "declare the dynamic() in a module under src/next/lazy/ and import that";
  if (spec === "next/headers") return "put the server reader under src/next/server/";
  return "keep Next-only code under src/next/ (the binding)";
}

export interface NextImportSite {
  file: string;
  line: number;
  specifier: string;
  remedy: string;
}

/** Every `next/*` import in `source` that the binding rule forbids for `file`. */
export function findNextImports(file: string, source: string): NextImportSite[] {
  if (file.startsWith(BINDING)) return [];
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out: NextImportSite[] = [];
  const add = (node: ts.Node, spec: string) =>
    out.push({
      file: path.relative(SRC, file),
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      specifier: spec,
      remedy: remedy(spec),
    });
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isNext(node.moduleSpecifier.text)
    ) {
      add(node, node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression) &&
      isNext(node.moduleReference.expression.text)
    ) {
      add(node, node.moduleReference.expression.text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal) &&
      isNext(node.argument.literal.text)
    ) {
      add(node, node.argument.literal.text);
    } else if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      const spec = node.arguments[0].text;
      const callee = node.expression;
      if (isNext(spec)) {
        if (callee.kind === ts.SyntaxKind.ImportKeyword) add(node, spec);
        else if (ts.isIdentifier(callee) && callee.text === "require") add(node, spec);
        else if (
          ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === "jest" &&
          MOCK_CALLS.has(callee.name.text) &&
          SEAMED.has(spec)
        )
          add(node, spec);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("no next/* import outside the package's next binding", () => {
  it("finds every import form, ignores comments and the binding itself (the rule is not vacuous)", () => {
    const planted = [
      `import Link from "next/link";`,
      `import { useRouter } from "next/navigation";`,
      `import type { Metadata } from "next";`,
      `export { default } from "next/dynamic";`,
      `const h = require("next/headers");`,
      `const d = () => import("next/image");`,
      `type R = import("next/navigation").ReadonlyURLSearchParams;`,
      `jest.mock("next/navigation", () => ({}));`,
      `jest.mock("next/cache", () => ({}));`, // allowed: only app modules read it
      `jest.mock("next/dynamic", () => ({}));`, // allowed: the binding reads it
      `// import Link from "next/link";`, // comment: ignored
      `import { x } from "nextjs-thing";`, // not next
    ].join("\n");
    const outside = path.join(SRC, "agents", "planted.tsx");
    expect(findNextImports(outside, planted).map((s) => s.specifier)).toEqual([
      "next/link",
      "next/navigation",
      "next",
      "next/dynamic",
      "next/headers",
      "next/image",
      "next/navigation",
      "next/navigation",
    ]);
    expect(findNextImports(path.join(BINDING, "planted.tsx"), planted)).toEqual([]);
  });

  it("no package file outside src/next/ imports next/*", () => {
    const all = files(SRC);
    expect(all.length).toBeGreaterThan(1000);
    const sites = all.flatMap((file) => findNextImports(file, fs.readFileSync(file, "utf8")));
    const report = sites.map((s) => `${s.file}:${s.line}  ${s.specifier}  → ${s.remedy}`);
    expect(report).toEqual([]);
  });
});
