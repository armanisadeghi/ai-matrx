#!/usr/bin/env npx tsx
/**
 * check:route-param-decode — a dynamic route file may never re-decode a
 * value the App Router already decoded.
 *
 * THE CLASS. Next.js hands `page.tsx` / `layout.tsx` / `route.ts` params
 * ALREADY percent-decoded — `await params` (or, in a Client Component,
 * `useParams()`) returns the segment's real value, not its wire encoding.
 * A second `decodeURIComponent(...)` on that value is a no-op for an
 * ordinary segment and a crash for one that legitimately contains a
 * literal `%` (an id/key/token whose real value is, say, `%25` reaches
 * the page as `%25`; decoding it a SECOND time throws `URIError: URI
 * malformed`, and the whole route 500s). Lane F-28 found and fixed the
 * first instance of this — `app/(core)/detail/[type]/[id]/page.tsx`,
 * commit 19c5cce8 — and named ~10 siblings it did not fix. Lane F-29's
 * census (2026-09-17) found the true count was 27 files / ~30 call sites,
 * including a 14-file cluster this route-file guard now watches for good:
 * every `app/(core)/shapes/(workspace)/[kind]/**` page and layout.
 *
 * WHAT IT FAILS ON — a call `decodeURIComponent(x)` (or `arr.map(decodeURIComponent)`
 * / `arr.map((s) => decodeURIComponent(s))`) where `x` (or `arr`) is TAINTED
 * by a route param: bound from `await params`, from a bare `params.foo` /
 * `(await params).foo` access, or from `useParams()` — in ANY file that sits
 * under `app/` in a directory carrying a `[param]`, `[...param]`, or
 * `[[...param]]` segment. This is a route-file guard, not a general
 * decodeURIComponent ban — decoding a COOKIE value, a query string, or a
 * pasted URL elsewhere in the app is normal and untouched.
 *
 * WHAT IT DELIBERATELY DOES NOT FAIL ON
 *   • decodeURIComponent applied to anything that did not come from `params`
 *     or `useParams()` — cookies, searchParams, request bodies, filenames.
 *   • A route file that never touches its dynamic segment's value.
 *   • Files outside `app/` (this is the App Router param contract, not a
 *     general JS rule — matrx-frontend has no other production consumer of
 *     router-decoded params).
 *
 * WHAT IT CANNOT SEE
 *   • A decode reached indirectly through a helper this file imports (an
 *     `features/**` function that itself double-decodes what the page
 *     handed it undecoded already) — the census that produced this guard
 *     checked those call sites by hand and found none; a future one needs
 *     the same manual check.
 *   • Renaming `params` to something else in a NON-standard way this file's
 *     taint tracker cannot follow (e.g. reassigning it through an unrelated
 *     object literal). Every real route file in this repo uses the literal
 *     names `params` / `searchParams` / `useParams()`, so this is a
 *     theoretical gap, not a live one.
 *
 * BINDING FORMS THE TAINT TRACKER FOLLOWS (Bugbot round 15, PR 228, comment
 * 4041859036, 2026-09-17 — the original tracker only walked `await params` /
 * `use(params)` / `useParams()` / plain property access, and stayed blind to
 * `Promise.all([params, searchParams])` array destructuring — the LIVE
 * pattern in `kind-registry/[kind]/page.tsx`, `chat/[conversationId]/page.tsx`
 * and three other route files):
 *   • `await params`, bare `params.foo` / `(await params).foo`, `useParams()`.
 *   • `use(params)` (React's Client Component unwrap of the params Promise).
 *   • `const [{ kind }, sp] = await Promise.all([params, searchParams])` —
 *     array destructure from `Promise.all([...])`, mapped positionally (each
 *     tainted array element propagates into the binding at that index; a
 *     nested pattern like `[{ kind }]` recurses the same as `{ kind }` does
 *     off a plain `params`).
 *   • `Promise.all([...]).then(([kind, sp]) => …)` — the same positional
 *     mapping onto a `.then` callback's first (array-pattern) parameter.
 *   • `props.params` / `props.searchParams` — any property access literally
 *     named `params` or `searchParams` is itself a taint source, regardless
 *     of its base identifier, so a page that takes its whole props object
 *     (`function Page(props: PageProps)`) rather than destructuring at the
 *     signature is covered without needing `props` itself pre-seeded.
 *   • Re-binding through a plain alias — `const p = params; const { id } =
 *     await p;` — already worked (identifier `p` inherits `params`'s taint
 *     in the same taint-growing pass) and is now covered by a self-test.
 *
 * Usage:
 *   pnpm check:route-param-decode             # report; exit 0
 *   pnpm check:route-param-decode:strict      # exit 1 on findings
 *   pnpm check:route-param-decode:self-test   # prove the guard can still fail
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { exitAfterDrain } from "./lib/exit-after-drain";

const REPO_ROOT = resolve(__dirname, "..");
const SCANNED_DIR = "app";
// A file lives on a dynamic route only if some ancestor directory (up to
// `app/`) carries a bracketed segment.
const HAS_DYNAMIC_SEGMENT = /\[[^/]*\]/;

interface Finding {
  file: string;
  line: number;
  snippet: string;
}

function isDynamicRouteFile(relPath: string): boolean {
  const dir = relPath.slice(0, relPath.lastIndexOf("/"));
  return HAS_DYNAMIC_SEGMENT.test(dir);
}

function unwrap(node: ts.Expression): ts.Expression {
  let n: ts.Expression = node;
  while (
    ts.isParenthesizedExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isNonNullExpression(n) ||
    ts.isAwaitExpression(n)
  ) {
    n = ts.isAwaitExpression(n) ? n.expression : (n as ts.Expression & { expression: ts.Expression }).expression;
  }
  return n;
}

/** True if `expr` (already unwrapped of await/paren/as) is rooted at an
 * identifier in `tainted` — either the identifier itself, or a
 * property/element access chain whose base is. */
function isTaintedExpr(expr: ts.Expression, tainted: Set<string>): boolean {
  const e = unwrap(expr);
  if (ts.isIdentifier(e)) return tainted.has(e.text);
  // `props.params` / `props.searchParams` — a property literally named
  // `params`/`searchParams` is a taint source regardless of its base, so a
  // page that keeps its whole props object (never destructures `params` at
  // the signature) is still caught.
  if (
    ts.isPropertyAccessExpression(e) &&
    (e.name.text === "params" || e.name.text === "searchParams")
  ) {
    return true;
  }
  if (ts.isPropertyAccessExpression(e)) return isTaintedExpr(e.expression, tainted);
  if (
    ts.isElementAccessExpression(e) &&
    ts.isStringLiteralLike(e.argumentExpression) &&
    (e.argumentExpression.text === "params" || e.argumentExpression.text === "searchParams")
  ) {
    return true;
  }
  if (ts.isElementAccessExpression(e)) return isTaintedExpr(e.expression, tainted);
  // React's `use(params)` (the sync-in-a-Client-Component unwrap of the
  // params Promise) is the same value `await params` is.
  if (
    ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    e.expression.text === "use" &&
    e.arguments[0]
  ) {
    return isTaintedExpr(e.arguments[0], tainted);
  }
  // `(path ?? [])` / `(path || [])` — a fallback-defaulted catch-all array
  // is still the tainted value on its left side.
  if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
    return isTaintedExpr(e.left, tainted);
  }
  return false;
}

function addBindingNames(name: ts.BindingName, tainted: Set<string>): void {
  if (ts.isIdentifier(name)) {
    tainted.add(name.text);
    return;
  }
  if (ts.isObjectBindingPattern(name)) {
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) addBindingNames(el.name, tainted);
    }
  }
  // A nested pattern off a value ALREADY established as tainted (the caller
  // only invokes this once it knows `name`'s whole source value is tainted)
  // — `[{ kind }]` destructured off one Promise.all element is the same
  // taint propagation as `{ kind }` destructured off plain `params`.
  if (ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) addBindingNames(el.name, tainted);
    }
  }
}

/** If `expr` (already unwrapped) is `Promise.all([...])` with a literal
 * array argument, return per-element taint (each checked via `isTaintedExpr`)
 * — otherwise null. `Promise.all(...)`'s return value is not itself "rooted
 * at" any single identifier, so `isTaintedExpr` can never see through it;
 * an array destructure or a `.then(([a, b]) => …)` callback needs the
 * POSITIONAL mapping this gives back instead. */
function promiseAllElementTaint(expr: ts.Expression, tainted: Set<string>): boolean[] | null {
  const e = unwrap(expr);
  if (
    ts.isCallExpression(e) &&
    ts.isPropertyAccessExpression(e.expression) &&
    ts.isIdentifier(e.expression.expression) &&
    e.expression.expression.text === "Promise" &&
    e.expression.name.text === "all" &&
    e.arguments[0] &&
    ts.isArrayLiteralExpression(e.arguments[0])
  ) {
    const arr = e.arguments[0] as ts.ArrayLiteralExpression;
    return arr.elements.map((el) => isTaintedExpr(el as ts.Expression, tainted));
  }
  return null;
}

function scanFile(absPath: string, relPath: string): Finding[] {
  const raw = readFileSync(absPath, "utf8");
  if (!/decodeURIComponent/.test(raw)) return [];

  const sf = ts.createSourceFile(
    absPath,
    raw,
    ts.ScriptTarget.Latest,
    false,
    absPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // Seed the taint set with the two conventional router-param identifiers.
  const tainted = new Set<string>(["params"]);
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  // Pass 1: grow the taint set — a variable initialized from `await params`,
  // a bare `params`, a property/element access rooted at `params`, or a
  // direct `useParams()` call is a route-param value.
  const walkTaint = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = node.initializer;
      const isUseParamsCall =
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === "useParams";
      if (isUseParamsCall || isTaintedExpr(init, tainted)) {
        addBindingNames(node.name, tainted);
      } else if (ts.isArrayBindingPattern(node.name)) {
        // `const [{ kind }, sp] = await Promise.all([params, searchParams])`
        // — map each destructured element to its positional Promise.all
        // argument's taint, rather than the whole initializer's.
        const elementTaint = promiseAllElementTaint(init, tainted);
        if (elementTaint) {
          node.name.elements.forEach((el, i) => {
            if (ts.isBindingElement(el) && elementTaint[i]) addBindingNames(el.name, tainted);
          });
        }
      }
    }
    // `Promise.all([...]).then(([kind, sp]) => …)` — same positional
    // mapping, onto the callback's first (array-pattern) parameter.
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === "then") {
        const elementTaint = promiseAllElementTaint(callee.expression, tainted);
        const cb = node.arguments[0];
        if (
          elementTaint &&
          cb &&
          (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) &&
          cb.parameters[0] &&
          ts.isArrayBindingPattern(cb.parameters[0].name)
        ) {
          const pattern = cb.parameters[0].name as ts.ArrayBindingPattern;
          pattern.elements.forEach((el, i) => {
            if (ts.isBindingElement(el) && elementTaint[i]) addBindingNames(el.name, tainted);
          });
        }
      }
    }
    ts.forEachChild(node, walkTaint);
  };
  walkTaint(sf);
  // Params can be destructured in a second pass that depends on names the
  // first pass only just added (e.g. a `useParams()` alias destructured
  // later in the same file, or a re-binding chain like `const p = params;
  // const { id } = await p;`) — one more pass closes that.
  walkTaint(sf);

  const findings: Finding[] = [];
  const flag = (node: ts.Node) => {
    const line = lineOf(node.getStart(sf));
    const snippet = raw.split("\n")[line - 1]?.trim() ?? "";
    findings.push({ file: relPath, line, snippet });
  };

  const walkCalls = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;

      // decodeURIComponent(x)
      if (ts.isIdentifier(callee) && callee.text === "decodeURIComponent") {
        const arg = node.arguments[0];
        if (arg && isTaintedExpr(arg, tainted)) flag(node);
      }

      // x.map(decodeURIComponent)  /  x.map((s) => decodeURIComponent(s))
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "map" &&
        isTaintedExpr(callee.expression, tainted)
      ) {
        const mapArg = node.arguments[0];
        if (mapArg) {
          const isBareDecode =
            ts.isIdentifier(mapArg) && mapArg.text === "decodeURIComponent";
          const isArrowDecode =
            (ts.isArrowFunction(mapArg) || ts.isFunctionExpression(mapArg)) &&
            ts.isBlock(mapArg.body) === false &&
            ts.isCallExpression(mapArg.body) &&
            ts.isIdentifier(mapArg.body.expression) &&
            mapArg.body.expression.text === "decodeURIComponent";
          if (isBareDecode || isArrowDecode) flag(node);
        }
      }
    }
    ts.forEachChild(node, walkCalls);
  };
  walkCalls(sf);

  return findings;
}

function listFiles(root: string): string[] {
  const out = execFileSync(
    "git",
    [
      "-C",
      root,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      `${SCANNED_DIR}/**/*.ts`,
      `${SCANNED_DIR}/**/*.tsx`,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !/__tests__|\.test\.|\.spec\./.test(f))
    .filter(isDynamicRouteFile);
}

function run(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const rel of listFiles(root)) {
    findings.push(...scanFile(join(root, rel), rel));
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

interface SelfTestCase {
  /** Directory name under `app/(core)/` — must be unique. */
  name: string;
  /** Lines with a planted double-decode; must contain `decodeURIComponent(`. */
  red: string[];
  /** The same lines with the decode removed (still reads the tainted value). */
  green: string[];
}

// One case per binding form the taint tracker follows — see the file header
// "BINDING FORMS THE TAINT TRACKER FOLLOWS" for what each proves and why
// (Bugbot round 15, PR 228, comment 4041859036).
const SELF_TEST_CASES: SelfTestCase[] = [
  {
    name: "destructured-params",
    red: [
      "export default async function PlantedPage({",
      "  params,",
      "}: {",
      "  params: Promise<{ id: string }>;",
      "}) {",
      "  const { id } = await params;",
      "  const decoded = decodeURIComponent(id);",
      "  return <div>{decoded}</div>;",
      "}",
      "",
    ],
    green: [
      "export default async function PlantedPage({",
      "  params,",
      "}: {",
      "  params: Promise<{ id: string }>;",
      "}) {",
      "  const { id } = await params;",
      "  return <div>{id}</div>;",
      "}",
      "",
    ],
  },
  {
    // The LIVE pattern in kind-registry/[kind]/page.tsx and four other
    // route files — an array destructure off Promise.all([params, ...]).
    name: "promise-all-array-destructure",
    red: [
      "export default async function PlantedPage({",
      "  params,",
      "  searchParams,",
      "}: {",
      "  params: Promise<{ id: string }>;",
      "  searchParams: Promise<Record<string, string | string[] | undefined>>;",
      "}) {",
      "  const [{ id }, sp] = await Promise.all([params, searchParams]);",
      "  const decoded = decodeURIComponent(id);",
      "  return <div>{decoded}{String(sp)}</div>;",
      "}",
      "",
    ],
    green: [
      "export default async function PlantedPage({",
      "  params,",
      "  searchParams,",
      "}: {",
      "  params: Promise<{ id: string }>;",
      "  searchParams: Promise<Record<string, string | string[] | undefined>>;",
      "}) {",
      "  const [{ id }, sp] = await Promise.all([params, searchParams]);",
      "  return <div>{id}{String(sp)}</div>;",
      "}",
      "",
    ],
  },
  {
    // `.then(([a, b]) => …)` off the same Promise.all — same positional
    // mapping, onto a callback parameter instead of a variable declaration.
    name: "promise-all-then-callback",
    red: [
      "export default function PlantedPage({",
      "  params,",
      "  searchParams,",
      "}: {",
      "  params: Promise<{ id: string }>;",
      "  searchParams: Promise<Record<string, string | string[] | undefined>>;",
      "}) {",
      "  Promise.all([params, searchParams]).then(([{ id }, sp]) => {",
      "    const decoded = decodeURIComponent(id);",
      "    console.log(decoded, sp);",
      "  });",
      "  return <div />;",
      "}",
      "",
    ],
    green: [
      "export default function PlantedPage({",
      "  params,",
      "  searchParams,",
      "}: {",
      "  params: Promise<{ id: string }>;",
      "  searchParams: Promise<Record<string, string | string[] | undefined>>;",
      "}) {",
      "  Promise.all([params, searchParams]).then(([{ id }, sp]) => {",
      "    console.log(id, sp);",
      "  });",
      "  return <div />;",
      "}",
      "",
    ],
  },
  {
    // `props.params` — the whole props object kept, never destructured at
    // the signature (the live shape in `_flashcard/[category]/page.tsx`).
    name: "props-dot-params",
    red: [
      "export default async function PlantedPage(props: {",
      "  params: Promise<{ id: string }>;",
      "}) {",
      "  const { id } = await props.params;",
      "  const decoded = decodeURIComponent(id);",
      "  return <div>{decoded}</div>;",
      "}",
      "",
    ],
    green: [
      "export default async function PlantedPage(props: {",
      "  params: Promise<{ id: string }>;",
      "}) {",
      "  const { id } = await props.params;",
      "  return <div>{id}</div>;",
      "}",
      "",
    ],
  },
  {
    // Re-binding through a plain alias before destructuring — already
    // worked (the taint-growing pass processes declarations in source
    // order), locked in here so a future refactor can't silently drop it.
    name: "rebound-alias",
    red: [
      "export default async function PlantedPage({",
      "  params,",
      "}: {",
      "  params: Promise<{ id: string }>;",
      "}) {",
      "  const p = params;",
      "  const { id } = await p;",
      "  const decoded = decodeURIComponent(id);",
      "  return <div>{decoded}</div>;",
      "}",
      "",
    ],
    green: [
      "export default async function PlantedPage({",
      "  params,",
      "}: {",
      "  params: Promise<{ id: string }>;",
      "}) {",
      "  const p = params;",
      "  const { id } = await p;",
      "  return <div>{id}</div>;",
      "}",
      "",
    ],
  },
];

/** Prove the guard can still fail (red), then that the same tree with the
 * decode removed passes (green) — the exact before/after this lane's fix
 * produced on every real site, once per binding form it now follows. */
function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "route-param-decode-selftest-"));
  execFileSync("git", ["-C", dir, "init", "-q"]);

  const failures: string[] = [];

  for (const testCase of SELF_TEST_CASES) {
    const routeDir = join(dir, "app", "(core)", testCase.name, "[id]");
    execFileSync("mkdir", ["-p", routeDir]);
    const pagePath = join(routeDir, "page.tsx");

    writeFileSync(pagePath, testCase.red.join("\n"), "utf8");
    const redFindings = run(dir);
    const redCaught = redFindings.some(
      (f) =>
        f.file.endsWith(`${testCase.name}/[id]/page.tsx`) &&
        f.snippet.includes("decodeURIComponent("),
    );
    if (!redCaught) {
      failures.push(`[${testCase.name}] RED — the guard did not catch the planted double-decode.`);
    }

    writeFileSync(pagePath, testCase.green.join("\n"), "utf8");
    const greenFindings = run(dir).filter((f) => f.file.endsWith(`${testCase.name}/[id]/page.tsx`));
    if (greenFindings.length > 0) {
      failures.push(
        `[${testCase.name}] GREEN — with the decode removed the guard still reported: ${JSON.stringify(greenFindings)}`,
      );
    }
  }

  // A non-route file (no `[param]` ancestor) doing the exact same decode
  // must NOT be flagged — the guard is route-file-scoped, not a blanket ban.
  const staticDir = join(dir, "app", "(core)", "static-not-dynamic");
  execFileSync("mkdir", ["-p", staticDir]);
  writeFileSync(
    join(staticDir, "page.tsx"),
    [
      "export default function StaticPage({ searchParams }: { searchParams: { q?: string } }) {",
      "  const q = decodeURIComponent(searchParams.q ?? \"\");",
      "  return <div>{q}</div>;",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  const staticFindings = run(dir).filter((f) => f.file.includes("static-not-dynamic"));
  if (staticFindings.length > 0) {
    failures.push(
      "[static-not-dynamic] the guard flagged a decode outside any [param] directory (searchParams, not a route param).",
    );
  }

  rmSync(dir, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error("SELF-TEST FAILED:\n" + failures.map((f) => `  - ${f}`).join("\n"));
    return 1;
  }
  console.log(
    `SELF-TEST PASSED — ${SELF_TEST_CASES.length} binding forms each proved red (planted decode caught) then ` +
      "green (decode removed, clean); a decode outside any [param] directory is left alone.",
  );
  return 0;
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return selfTest();
  const strict = argv.includes("--strict");

  const findings = run(REPO_ROOT);
  if (findings.length === 0) {
    console.log(
      "OK — no dynamic route file re-decodes a value the App Router already decoded.",
    );
    return 0;
  }

  console.error(
    `\nDOUBLE-DECODED ROUTE PARAM — ${findings.length} finding${findings.length === 1 ? "" : "s"}:\n`,
  );
  for (const f of findings) {
    console.error(`  ${relative(REPO_ROOT, join(REPO_ROOT, f.file))}:${f.line}  ${f.snippet}`);
  }
  console.error(
    "\nNext.js hands page/layout/route files an ALREADY-DECODED param (App Router\n" +
      "router-decoded contract). A second decodeURIComponent is a no-op for an\n" +
      "ordinary segment and throws URIError for one carrying a literal `%`. Remove\n" +
      "the second decode; if the value is used raw downstream, the CALLER already\n" +
      "has the real value. See lib/detail/FEATURE.md and CLAUDE.md.\n",
  );
  return strict ? 1 : 0;
}

exitAfterDrain(main());
