/**
 * A JEST MOCK MUST TARGET A MODULE THE CODE UNDER TEST STILL IMPORTS.
 *
 * Break this guards (PACKAGE-INDEPENDENCE §5, P4): every port slice moves call
 * sites off an `@host/…` module. A `jest.mock("@host/lib/toast", …)` left
 * behind keeps "passing" — it replaces a module nothing loads any more, the
 * real port runs unmocked, and the assertions on the mock read an object the
 * code never touched.
 *
 * The rule, per test file under packages/chat/src: each `jest.mock` /
 * `jest.doMock` of a module in this repo must name a module that is reachable
 * from the test's own imports WITHOUT passing through a mocked module (a
 * factory mock never runs the real module, so its imports never load) and
 * without counting the test's own import of the mocked module (a test that
 * imports the mock to assert on it proves nothing about the subject).
 * Bare npm specifiers count as live when any reached file imports them.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const REPO = path.resolve(__dirname, "../../../../..");
const SRC = path.join(REPO, "packages/chat/src");
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const MOCK_FNS = new Set(["mock", "doMock"]);

export interface FileSystem {
  read(file: string): string | null;
  isFile(file: string): boolean;
}

const realFs: FileSystem = {
  read: (file) => {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      return null;
    }
  },
  isFile: (file) => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  },
};

/** Absolute file for a repo-local specifier, `bare:<spec>` for an npm one, null when unresolved. */
export function resolveSpecifier(
  spec: string,
  fromFile: string,
  repo: string,
  fsx: FileSystem,
): string | null {
  let base: string;
  if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else if (spec.startsWith("@host/")) base = path.join(repo, spec.slice(6));
  else if (spec.startsWith("@/")) base = path.join(repo, spec.slice(2));
  else if (spec === "@ai-matrx/chat/host")
    base = path.join(repo, "packages/chat/src/host/index");
  else if (spec.startsWith("@ai-matrx/chat/"))
    base = path.join(repo, "packages/chat/src", spec.slice(15));
  else return `bare:${spec}`;
  if (EXTS.some((x) => base.endsWith(x)) && fsx.isFile(base)) return base;
  for (const x of EXTS) if (fsx.isFile(base + x)) return base + x;
  for (const x of EXTS)
    if (fsx.isFile(path.join(base, `index${x}`)))
      return path.join(base, `index${x}`);
  return null;
}

// preProcessFile misses an `import()` nested inside a function body.
const DYNAMIC = /\b(?:import|require)\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

function importsOf(text: string): string[] {
  const info = ts.preProcessFile(text, true, true);
  const specs = new Set(info.importedFiles.map((f) => f.fileName));
  for (const m of text.matchAll(DYNAMIC)) specs.add(m[1]);
  return [...specs];
}

interface MockCall {
  spec: string;
  usesActual: boolean;
  line: number;
}

function mockCallsOf(file: string, text: string): MockCall[] {
  const src = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: MockCall[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "jest" &&
      MOCK_FNS.has(node.expression.name.text)
    ) {
      const [first, factory, opts] = node.arguments;
      const virtual = opts?.getText().includes("virtual") ?? false;
      if (first && ts.isStringLiteralLike(first) && !virtual) {
        out.push({
          spec: first.text,
          usesActual: factory?.getText().includes("requireActual") ?? false,
          line: src.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}

/** Dead mocks in one test file: `file:line spec` for each mock nothing reachable imports. */
export function deadMocks(
  testFile: string,
  repo: string,
  fsx: FileSystem,
  cache: Map<string, string[]> = new Map(),
): string[] {
  const text = fsx.read(testFile);
  if (text == null) return [];
  const mocks = mockCallsOf(testFile, text);
  if (mocks.length === 0) return [];

  const resolved = mocks.map((m) => ({
    ...m,
    target: resolveSpecifier(m.spec, testFile, repo, fsx),
  }));
  // A factory mock never runs the real module; one built on requireActual does.
  const opaque = new Set(
    resolved.filter((m) => m.target && !m.usesActual).map((m) => m.target!),
  );
  const mocked = new Set(resolved.map((m) => m.target).filter(Boolean));

  const reached = new Set<string>(); // every target imported by a file that really loads
  const seen = new Set<string>();
  const stack: string[] = [];
  const follow = (from: string, specs: string[], isTest: boolean) => {
    for (const spec of specs) {
      const target = resolveSpecifier(spec, from, repo, fsx);
      if (!target) continue;
      // The test's own import of a mocked module is the assertion handle, not a use.
      if (isTest && mocked.has(target)) continue;
      reached.add(target);
      if (target.startsWith("bare:") || opaque.has(target) || seen.has(target))
        continue;
      seen.add(target);
      stack.push(target);
    }
  };
  follow(testFile, importsOf(text), true);
  while (stack.length) {
    const file = stack.pop()!;
    let specs = cache.get(file);
    if (!specs) {
      specs = importsOf(fsx.read(file) ?? "");
      cache.set(file, specs);
    }
    follow(file, specs, false);
  }

  return resolved
    .filter((m) => m.target && !reached.has(m.target))
    .map(
      (m) => `${path.relative(repo, testFile)}:${m.line} jest.mock("${m.spec}")`,
    );
}

function testFiles(dir: string): string[] {
  const out: string[] = [];
  (function walk(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.test\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p);
    }
  })(dir);
  return out.sort();
}

function memoryFs(files: Record<string, string>): FileSystem {
  return {
    read: (f) => files[f] ?? null,
    isFile: (f) => f in files,
  };
}

describe("a jest mock targets a live import", () => {
  const R = "/repo";
  const fixture = (subject: string) =>
    memoryFs({
      "/repo/lib/toast.ts": "export const toast = {};",
      "/repo/packages/chat/src/host/notify.ts": "export const toast = {};",
      "/repo/packages/chat/src/feature.ts": subject,
      "/repo/packages/chat/src/feature.test.ts": [
        'jest.mock("@host/lib/toast", () => ({ toast: { error: jest.fn() } }));',
        'import { run } from "./feature";',
        'const { toast } = await import("@host/lib/toast");',
      ].join("\n"),
    });

  it("passes while the subject still imports the mocked module", () => {
    const fsx = fixture('import { toast } from "@host/lib/toast"; export const run = 1;');
    expect(deadMocks("/repo/packages/chat/src/feature.test.ts", R, fsx)).toEqual([]);
  });

  it("counts an import() nested inside a function body", () => {
    const fsx = fixture(
      'export async function run() { const { toast } = await import("@host/lib/toast"); }',
    );
    expect(deadMocks("/repo/packages/chat/src/feature.test.ts", R, fsx)).toEqual([]);
  });

  it("fails once the subject moved to the port, even though the test itself imports the mock", () => {
    const fsx = fixture('import { toast } from "./host/notify"; export const run = 1;');
    expect(deadMocks("/repo/packages/chat/src/feature.test.ts", R, fsx)).toEqual([
      'packages/chat/src/feature.test.ts:1 jest.mock("@host/lib/toast")',
    ]);
  });

  it("does not count a module reached only through another factory mock", () => {
    const fsx = memoryFs({
      "/repo/a.ts": 'import "./b"; export const a = 1;',
      "/repo/b.ts": "export const b = 1;",
      "/repo/t.test.ts": [
        'jest.mock("./a", () => ({ a: 2 }));',
        'jest.mock("./b", () => ({ b: 2 }));',
        'import { a } from "./a";',
      ].join("\n"),
    });
    expect(deadMocks("/repo/t.test.ts", R, fsx)).toEqual([
      't.test.ts:1 jest.mock("./a")',
      't.test.ts:2 jest.mock("./b")',
    ]);
  });

  it("every port seam mock in packages/chat/src targets a module its test still loads", () => {
    const cache = new Map<string, string[]>();
    const dead = testFiles(SRC)
      .flatMap((f) => deadMocks(f, REPO, realFs, cache))
      // P4 (notify): a toast mock must follow the call sites onto the notify seam.
      .filter((line) => /lib\/toast|host\/notify/.test(line));
    expect(dead).toEqual([]);
  });
});
