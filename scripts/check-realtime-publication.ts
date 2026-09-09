#!/usr/bin/env tsx
/**
 * REALTIME PUBLICATION GUARD — every table this system SUBSCRIBES to over
 * `postgres_changes` must be a member of the `supabase_realtime` publication.
 *
 * THE CLASS THIS EXISTS FOR. A `postgres_changes` binding on a table that is not
 * in the publication is the quietest defect in the platform: the channel joins,
 * `SUBSCRIBED` fires, every log line looks healthy, and NOT ONE EVENT is ever
 * delivered. Nothing throws, nothing warns, no error surface records it. It has
 * now shipped FOUR times:
 *
 *   1. `workbench.notes`      — 2026-07-10, and it cost real user data.
 *   2. `tool.ui` + `app.definition`
 *   3. `users.user_memory` + `iam.permissions`
 *   4. `communication.meet_*` (six tables) — Meet was silent from the day it
 *      shipped until MRI-A10 censused the class on 2026-09-08.
 *
 * Publication membership is NOT granted by `platform.create_entity_table`; it is
 * a separate, explicit, easily-forgotten migration. Nothing in the type system,
 * the RLS layer, or any runtime surface can see the gap. Only this can.
 *
 * WHY IT IS AN AST RESOLVER AND NOT A GREP. MRI-A10's census found that
 * `schema:` and `table:` are USUALLY NOT string literals at the call site. They
 * arrive as `repository.tables.notes`, `adapter.realtimeTable`, a `scoped()`
 * helper spread into the binding, a module-level `const`, or a property chain
 * three files away. A regex scanner goes GREEN over exactly the indirect shapes
 * that have failed four times — which is worse than no guard at all, because it
 * manufactures confidence. So this file resolves each binding through the
 * TypeScript AST: string literals, `const` references (local and imported),
 * object property chains, template literals with constant parts, spreads of
 * helper calls, and the known helper shapes.
 *
 * 🚨 AN UNVERIFIABLE SUBSCRIPTION IS A FAILING ONE. Anything the resolver cannot
 * settle statically is reported as UNRESOLVED and FAILS — it is never skipped,
 * never warned about, never counted as clean. The one escape is an explicit
 * annotation AT the call site:
 *
 *     // realtime-publication: communication.meet_notes
 *
 * which this check then VERIFIES against the live publication like any other
 * pair. An annotation buys you nothing except the right to be checked.
 *
 * 🚨 UNMEASURED IS NOT PASSED. Without Supabase credentials, or without the
 * sibling `aidream` checkout, this exits 2 and says the word UNMEASURED. It
 * never degrades to a warning that reads as a pass (THE STRICTNESS LAW clause 7).
 *
 * SCOPE — both repos, because both subscribe against the same database:
 *   - this repo (the app), and
 *   - `aidream/apps/shared/<pkg>/src` (the @ai-matrx packages the app mounts).
 *     Resolved like every other cross-repo check here: `$AIDREAM_DIR`, else
 *     `../aidream` beside this repo.
 *
 * Usage:
 *   pnpm check:realtime-publication              # the real check
 *   pnpm check:realtime-publication --self-test  # prove the guard can FAIL (exit 0 = it can)
 *   pnpm check:realtime-publication --list       # print the resolved census
 *
 * Exit codes:
 *   0  every subscribed pair resolves and is published
 *   1  findings: an unpublished pair, or a binding that cannot be resolved
 *   2  UNMEASURED (no credentials, DB unreachable, or no aidream checkout)
 *   3  the self-test could not make this guard fail, or the script crashed
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AIDREAM_DIR = process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream");
const AIDREAM_PACKAGES = join(AIDREAM_DIR, "apps", "shared");
const PUBLICATION = "supabase_realtime";
const SELF_TEST = process.argv.includes("--self-test");
const LIST_ONLY = process.argv.includes("--list");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const TAG = {
  info: `${C.cyan}[INFO]${C.reset}`,
  warn: `${C.yellow}[WARN]${C.reset}`,
  fail: `${C.red}[FAIL]${C.reset}`,
  ok: `${C.green}[ OK ]${C.reset}`,
};

/* ────────────────────────────── file discovery ───────────────────────────── */

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  "out",
  ".turbo",
  ".vercel",
]);
const EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];

/**
 * A file is a SEED (a place a binding may be declared) if its text mentions any
 * of these. Resolution then follows imports into files that mention none of them
 * — a `const` table name usually lives in a plain constants module.
 */
const SEED_MARKERS_BASE = [
  "postgres_changes",
  "postgresChanges",
  "realtimeTable",
  "useRealtimeChannel",
  "realtime-publication:",
];

/**
 * Plus every registered forwarding helper's NAME — its call sites are binding
 * sites, and they mention none of the markers above. Leaving them out is how
 * `chat.agent_run` went unseen in the first draft of this file.
 */
function seedMarkers(): string[] {
  return [...SEED_MARKERS_BASE, ...FORWARDING_HELPERS.map((h) => h.name)];
}

/** Test/fixture files declare synthetic table names that are not real bindings. */
function isTestFile(file: string): boolean {
  return /(\.test\.|\.spec\.|__tests__|\/testing\/|\/__mocks__\/)/.test(file.replace(/\\/g, "/"));
}

function walk(dir: string, out: string[]): void {
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(target, out);
    } else if (EXTS.some((e) => entry.name.endsWith(e))) {
      out.push(target);
    }
  }
}

/** matrx-frontend roots that can hold application code. */
const FRONTEND_ROOTS = [
  "actions",
  "app",
  "components",
  "constants",
  "features",
  "hooks",
  "lib",
  "providers",
  "services",
  "types",
  "utils",
];

function collectSeeds(): { file: string; repo: "matrx-frontend" | "aidream" }[] {
  const seeds: { file: string; repo: "matrx-frontend" | "aidream" }[] = [];
  const consider = (file: string, repo: "matrx-frontend" | "aidream"): void => {
    if (isTestFile(file)) return;
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      return;
    }
    if (!seedMarkers().some((m) => text.includes(m))) return;
    seeds.push({ file, repo });
  };

  for (const root of FRONTEND_ROOTS) {
    const files: string[] = [];
    walk(join(ROOT, root), files);
    for (const f of files) consider(f, "matrx-frontend");
  }

  // aidream/apps/shared/<pkg>/src
  let pkgs: string[] = [];
  try {
    pkgs = readdirSync(AIDREAM_PACKAGES, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    pkgs = [];
  }
  for (const pkg of pkgs) {
    const src = join(AIDREAM_PACKAGES, pkg, "src");
    if (!existsSync(src)) continue;
    const files: string[] = [];
    walk(src, files);
    for (const f of files) consider(f, "aidream");
  }

  return seeds;
}

/* ──────────────────────────────── parsing ────────────────────────────────── */

const sourceCache = new Map<string, ts.SourceFile | null>();

function parse(file: string): ts.SourceFile | null {
  const cached = sourceCache.get(file);
  if (cached !== undefined) return cached;
  let sf: ts.SourceFile | null = null;
  try {
    const text = readFileSync(file, "utf8");
    // 🚨 SCRIPT KIND BY EXTENSION. Parsing a `.ts` file as TSX makes
    // `deliver<InterviewTurnRow>(row, handler)` read as an unterminated JSX
    // element, and everything after it is lost — features/vision-interview's
    // four `interview.*` bindings vanished silently until this was fixed. A
    // resolver that quietly drops a file is the failure mode this guard exists
    // to prevent, so the kind is chosen, never assumed.
    const kind = file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  } catch {
    sf = null;
  }
  sourceCache.set(file, sf);
  return sf;
}

/** tsconfig `@/*` → repo root; `@components/*` → components/. */
function resolveAlias(spec: string, fromFile: string): string | null {
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return join(dirname(fromFile), spec);
  }
  if (spec.startsWith("@/")) return join(ROOT, spec.slice(2));
  if (spec.startsWith("@components/")) return join(ROOT, "components", spec.slice("@components/".length));
  if (spec.startsWith("@lib/")) return join(ROOT, "lib", spec.slice("@lib/".length));
  if (spec.startsWith("@utils/")) return join(ROOT, "utils", spec.slice("@utils/".length));
  return null;
}

function resolveModuleFile(spec: string, fromFile: string): string | null {
  const base = resolveAlias(spec, fromFile);
  if (base === null) return null;
  const candidates = [
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => join(base, "index" + e)),
    base,
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/* ─────────────────────────────── resolution ──────────────────────────────── */

interface Site {
  file: string;
  line: number;
  repo: string;
  /** How the binding was recognised — reported in the coverage table. */
  shape: string;
}

interface ResolvedPair {
  schema: string;
  table: string;
  via: string;
  site: Site;
}

interface Unresolved {
  site: Site;
  why: string;
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  for (;;) {
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isNonNullExpression(current)) {
      current = current.expression;
      continue;
    }
    return current;
  }
}

/** Local scope substitutions (a helper's parameters bound to literal arguments). */
type Bindings = ReadonlyMap<string, ts.Expression>;

interface Ctx {
  sf: ts.SourceFile;
  /** Parameter substitutions active in this frame (a helper's params → args). */
  bindings: Bindings;
  /** Guards against cyclical const/import chains. */
  seen: Set<string>;
}

function childCtx(ctx: Ctx, sf: ts.SourceFile, bindings?: Bindings): Ctx {
  return { sf, bindings: bindings ?? new Map(), seen: ctx.seen };
}

/** A value plus the frame it must be resolved in. Mixing frames is the bug. */
interface Valued {
  expr: ts.Expression;
  ctx: Ctx;
}

interface ResolvedObject {
  props: Map<string, Valued>;
  /** True when a spread could not be resolved — the object is NOT fully known. */
  opaqueSpread: boolean;
  /** The spread expression that could not be resolved, for forwarding checks. */
  opaqueSpreadExpr: ts.Expression | null;
}

/* ── identifier / declaration lookup ──────────────────────────────────────── */

type Declared =
  | { kind: "value"; expr: ts.Expression; sf: ts.SourceFile }
  | { kind: "destructured"; source: ts.Expression; key: string; sf: ts.SourceFile }
  | { kind: "fn"; fn: ts.FunctionDeclaration; sf: ts.SourceFile };

/**
 * Find what an identifier refers to: a `const` in an enclosing scope (including
 * a destructured one), a function declaration, or a named import followed into
 * its module (one barrel hop).
 */
function findDeclaration(name: string, sf: ts.SourceFile, from: ts.Node): Declared | null {
  let scope: ts.Node | undefined = from;
  while (scope) {
    const statements: ts.NodeArray<ts.Statement> | null = ts.isSourceFile(scope)
      ? scope.statements
      : ts.isBlock(scope)
        ? scope.statements
        : null;
    if (statements) {
      for (const st of statements) {
        if (ts.isFunctionDeclaration(st) && st.name?.text === name) {
          return { kind: "fn", fn: st, sf };
        }
        if (!ts.isVariableStatement(st)) continue;
        for (const decl of st.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            if (decl.name.text === name && decl.initializer) {
              return { kind: "value", expr: decl.initializer, sf };
            }
            continue;
          }
          // `const { schema, table } = <expr>` / `const { a: b } = <expr>`
          if (ts.isObjectBindingPattern(decl.name) && decl.initializer) {
            for (const element of decl.name.elements) {
              if (!ts.isIdentifier(element.name) || element.name.text !== name) continue;
              const key = element.propertyName ? propertyKey(element.propertyName) : name;
              if (key === null) continue;
              return { kind: "destructured", source: decl.initializer, key, sf };
            }
          }
        }
      }
    }
    scope = scope.parent;
  }

  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    if (!ts.isStringLiteral(st.moduleSpecifier)) continue;
    const clause = st.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    const spec = clause.namedBindings.elements.find((e) => e.name.text === name);
    if (!spec) continue;
    const exported = (spec.propertyName ?? spec.name).text;
    const modFile = resolveModuleFile(st.moduleSpecifier.text, sf.fileName);
    if (!modFile) return null;
    const modSf = parse(modFile);
    if (!modSf) return null;
    const direct = findExportedConst(modSf, exported);
    if (direct) return { kind: "value", expr: direct, sf: modSf };
    return followReExport(modSf, exported);
  }
  return null;
}

function findExportedConst(sf: ts.SourceFile, name: string): ts.Expression | null {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const decl of st.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
        return decl.initializer;
      }
    }
  }
  return null;
}

function followReExport(sf: ts.SourceFile, name: string): Declared | null {
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
    if (!ts.isStringLiteral(st.moduleSpecifier)) continue;
    const target = resolveModuleFile(st.moduleSpecifier.text, sf.fileName);
    if (!target) continue;
    const targetSf = parse(target);
    if (!targetSf) continue;
    if (st.exportClause && ts.isNamedExports(st.exportClause)) {
      const spec = st.exportClause.elements.find((e) => e.name.text === name);
      if (!spec) continue;
      const hit = findExportedConst(targetSf, (spec.propertyName ?? spec.name).text);
      return hit ? { kind: "value", expr: hit, sf: targetSf } : null;
    }
    const hit = findExportedConst(targetSf, name);
    if (hit) return { kind: "value", expr: hit, sf: targetSf };
  }
  return null;
}

function ownerFile(node: ts.Node): ts.SourceFile {
  let current: ts.Node = node;
  while (current.parent) current = current.parent;
  return current as ts.SourceFile;
}

/* ── THE `repository.tables.X` SHAPE: resolving a root nobody declares ────── */

/**
 * `repository.schema` / `repository.tables.notes` / `adapter.realtimeTable`.
 *
 * The root is a FUNCTION PARAMETER (or destructured from one) whose value is
 * supplied by a caller, so no scope lookup can reach it. Chasing it through the
 * type system is a full type-checker job and still loses — `MeetRepository`
 * declares `schema: string`, which narrows to nothing.
 *
 * What is knowable, and mechanically: the SHAPE. Search the file's own package
 * for every object literal that declares EVERY key the chain uses (`schema` AND
 * `tables` for `repository`; `realtimeTable` for an adapter) and resolve the
 * chain against each. Every candidate is a value the root can really hold at
 * runtime, so the answer is their UNION — not the first, and not a guess. Three
 * library-source adapters each carry a different `realtimeTable`, and all three
 * are genuinely subscribed by the one call site that consumes them.
 *
 * Zero candidates → UNRESOLVED, which fails. Never a skip.
 */
const packageScopeCache = new Map<string, string[]>();

/** The nearest sensible search boundary for a file: its package, else its feature. */
function packageScopeOf(file: string): string {
  const normalized = file.replace(/\\/g, "/");
  const shared = normalized.indexOf("/apps/shared/");
  if (shared !== -1) {
    const after = normalized.slice(shared + "/apps/shared/".length);
    const pkg = after.split("/")[0];
    if (pkg) return normalized.slice(0, shared + "/apps/shared/".length) + pkg;
  }
  const rel = relative(ROOT, file);
  if (!rel.startsWith("..")) {
    const parts = rel.split(/[\\/]/);
    // features/<x>, lib/<x>, hooks, app/<x> … two segments is the feature.
    if (parts.length > 2) return join(ROOT, parts[0] as string, parts[1] as string);
    return join(ROOT, parts[0] as string);
  }
  return dirname(file);
}

function filesInScope(scope: string): string[] {
  const cached = packageScopeCache.get(scope);
  if (cached) return cached;
  const files: string[] = [];
  walk(scope, files);
  const usable = files.filter((f) => !isTestFile(f));
  packageScopeCache.set(scope, usable);
  return usable;
}

/** Every object literal in `scope` declaring all of `keys`, with its own frame. */
function candidateObjectsByShape(scope: string, keys: string[], ctx: Ctx): ResolvedObject[] {
  const out: ResolvedObject[] = [];
  for (const file of filesInScope(scope)) {
    const text = (() => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return "";
      }
    })();
    if (!keys.every((k) => text.includes(k))) continue;
    const sf = parse(file);
    if (!sf) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const declared = new Set<string>();
        for (const prop of node.properties) {
          if (ts.isPropertyAssignment(prop)) {
            const name = propertyKey(prop.name);
            if (name) declared.add(name);
          } else if (ts.isShorthandPropertyAssignment(prop)) {
            declared.add(prop.name.text);
          }
        }
        if (keys.every((k) => declared.has(k))) {
          const resolved = resolveObjects(node, childCtx(ctx, sf), 0);
          out.push(...resolved);
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
  }
  return out;
}

/** The root identifier and the property keys of a chain, e.g. a.b.c → [a, b, c]. */
function chainOf(expr: ts.Expression): { root: ts.Identifier; keys: string[] } | null {
  const keys: string[] = [];
  let current = unwrap(expr);
  for (;;) {
    if (ts.isPropertyAccessExpression(current)) {
      keys.unshift(current.name.text);
      current = unwrap(current.expression);
      continue;
    }
    if (ts.isElementAccessExpression(current) && ts.isStringLiteral(current.argumentExpression)) {
      keys.unshift(current.argumentExpression.text);
      current = unwrap(current.expression);
      continue;
    }
    break;
  }
  if (!ts.isIdentifier(current) || keys.length === 0) return null;
  return { root: current, keys };
}

/* ── the resolvers (plural: a value may legitimately have several) ───────── */

function resolveStrings(expr: ts.Expression, ctx: Ctx, depth = 0): string[] {
  if (depth > 14) return [];
  const node = unwrap(expr);

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];

  if (ts.isTemplateExpression(node)) {
    let heads = [node.head.text];
    for (const span of node.templateSpans) {
      const parts = resolveStrings(span.expression, ctx, depth + 1);
      if (parts.length === 0) return [];
      const next: string[] = [];
      for (const head of heads) for (const part of parts) next.push(head + part + span.literal.text);
      heads = next;
    }
    return heads;
  }

  if (ts.isConditionalExpression(node)) {
    return [
      ...resolveStrings(node.whenTrue, ctx, depth + 1),
      ...resolveStrings(node.whenFalse, ctx, depth + 1),
    ];
  }

  if (ts.isIdentifier(node)) {
    const substituted = ctx.bindings.get(node.text);
    if (substituted) return resolveStrings(substituted, ctx, depth + 1);
    const sf = ownerFile(node);
    const key = `str:${sf.fileName}#${node.text}#${node.getStart(sf)}`;
    if (ctx.seen.has(key)) return [];
    ctx.seen.add(key);
    const decl = findDeclaration(node.text, sf, node);
    if (!decl) return [];
    if (decl.kind === "value") return resolveStrings(decl.expr, childCtx(ctx, decl.sf), depth + 1);
    if (decl.kind === "destructured") {
      const objects = resolveObjects(decl.source, childCtx(ctx, decl.sf), depth + 1);
      const out: string[] = [];
      for (const obj of objects) {
        const value = obj.props.get(decl.key);
        if (value) out.push(...resolveStrings(value.expr, value.ctx, depth + 1));
      }
      return out;
    }
    return [];
  }

  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const key = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isStringLiteral(node.argumentExpression)
        ? node.argumentExpression.text
        : null;
    if (key === null) return [];
    const objects = resolveObjects(node.expression, ctx, depth + 1);
    const out: string[] = [];
    for (const obj of objects) {
      const value = obj.props.get(key);
      if (value) out.push(...resolveStrings(value.expr, value.ctx, depth + 1));
    }
    return dedupe(out);
  }

  return [];
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function resolveObjects(expr: ts.Expression, ctx: Ctx, depth = 0): ResolvedObject[] {
  if (depth > 14) return [];
  const node = unwrap(expr);

  if (ts.isObjectLiteralExpression(node)) {
    const props = new Map<string, Valued>();
    let opaqueSpread = false;
    let opaqueSpreadExpr: ts.Expression | null = null;
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const name = propertyKey(prop.name);
        if (name) props.set(name, { expr: prop.initializer, ctx });
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        props.set(prop.name.text, { expr: prop.name, ctx });
      } else if (ts.isSpreadAssignment(prop)) {
        const spreads = resolveObjects(prop.expression, ctx, depth + 1);
        if (spreads.length === 0) {
          opaqueSpread = true;
          opaqueSpreadExpr = prop.expression;
          continue;
        }
        // Several candidates for ONE spread would multiply the object out; keep
        // it honest and merge only when the spread is unambiguous.
        if (spreads.length > 1) {
          opaqueSpread = true;
          opaqueSpreadExpr = prop.expression;
          continue;
        }
        const only = spreads[0] as ResolvedObject;
        if (only.opaqueSpread) {
          opaqueSpread = true;
          opaqueSpreadExpr = only.opaqueSpreadExpr;
        }
        for (const [k, v] of only.props) if (!props.has(k)) props.set(k, v);
      }
    }
    return [{ props, opaqueSpread, opaqueSpreadExpr }];
  }

  if (ts.isIdentifier(node)) {
    const substituted = ctx.bindings.get(node.text);
    if (substituted) return resolveObjects(substituted, ctx, depth + 1);
    const sf = ownerFile(node);
    const key = `obj:${sf.fileName}#${node.text}#${node.getStart(sf)}`;
    if (ctx.seen.has(key)) return [];
    ctx.seen.add(key);
    const decl = findDeclaration(node.text, sf, node);
    if (!decl) return [];
    if (decl.kind === "value") return resolveObjects(decl.expr, childCtx(ctx, decl.sf), depth + 1);
    if (decl.kind === "destructured") {
      const objects = resolveObjects(decl.source, childCtx(ctx, decl.sf), depth + 1);
      const out: ResolvedObject[] = [];
      for (const obj of objects) {
        const value = obj.props.get(decl.key);
        if (value) out.push(...resolveObjects(value.expr, value.ctx, depth + 1));
      }
      return out;
    }
    return [];
  }

  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const key = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isStringLiteral(node.argumentExpression)
        ? node.argumentExpression.text
        : null;
    if (key === null) return [];
    const objects = resolveObjects(node.expression, ctx, depth + 1);
    const out: ResolvedObject[] = [];
    for (const obj of objects) {
      const value = obj.props.get(key);
      if (value) out.push(...resolveObjects(value.expr, value.ctx, depth + 1));
    }
    return out;
  }

  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    if (!ts.isIdentifier(callee)) return [];
    const sf = ownerFile(callee);
    const substituted = ctx.bindings.get(callee.text);
    let target: ts.Node | null = substituted ? unwrap(substituted) : null;
    let targetSf = sf;
    if (!target) {
      const decl = findDeclaration(callee.text, sf, callee);
      if (!decl) return [];
      if (decl.kind === "fn") {
        target = decl.fn;
        targetSf = decl.sf;
      } else if (decl.kind === "value") {
        target = unwrap(decl.expr);
        targetSf = decl.sf;
      } else {
        return [];
      }
    }
    if (
      !target ||
      (!ts.isArrowFunction(target) && !ts.isFunctionExpression(target) && !ts.isFunctionDeclaration(target))
    ) {
      return [];
    }
    // Arguments live in the CALLER's frame; the body in the callee's. Collapse
    // each argument to a literal first so the two frames never mix.
    const bound = new Map<string, ts.Expression>();
    target.parameters.forEach((param, index) => {
      if (!ts.isIdentifier(param.name)) return;
      const arg = node.arguments[index] ?? param.initializer;
      if (!arg) return;
      const literals = resolveStrings(arg, ctx, depth + 1);
      bound.set(
        param.name.text,
        literals.length === 1 ? ts.factory.createStringLiteral(literals[0] as string) : arg,
      );
    });
    const body = returnedExpression(target);
    if (!body) return [];
    return resolveObjects(body, childCtx(ctx, targetSf, bound), depth + 1);
  }

  return [];
}

/**
 * The elements of an array expression, each with the frame it belongs to.
 * A bindings array is almost never an inline literal — it is a `useMemo(() =>
 * [...], deps)` or a module const — so this follows identifiers, memo wrappers
 * and one-return helpers to reach the elements.
 */
function resolveArrayElements(expr: ts.Expression, ctx: Ctx, depth = 0): Valued[] | null {
  if (depth > 12) return null;
  const node = unwrap(expr);

  if (ts.isArrayLiteralExpression(node)) {
    const out: Valued[] = [];
    for (const el of node.elements) {
      if (ts.isSpreadElement(el)) {
        const nested = resolveArrayElements(el.expression, ctx, depth + 1);
        if (nested === null) return null;
        out.push(...nested);
        continue;
      }
      out.push({ expr: el, ctx });
    }
    return out;
  }

  if (ts.isIdentifier(node)) {
    const substituted = ctx.bindings.get(node.text);
    if (substituted) return resolveArrayElements(substituted, ctx, depth + 1);
    const sf = ownerFile(node);
    const key = `arr:${sf.fileName}#${node.text}#${node.getStart(sf)}`;
    if (ctx.seen.has(key)) return null;
    ctx.seen.add(key);
    const decl = findDeclaration(node.text, sf, node);
    if (!decl || decl.kind !== "value") return null;
    return resolveArrayElements(decl.expr, childCtx(ctx, decl.sf), depth + 1);
  }

  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : "";
    // `useMemo(() => [...], deps)` / `useCallback` — the array is the factory's
    // return value.
    if (name === "useMemo" || name === "useCallback") {
      const factory = node.arguments[0];
      if (!factory) return null;
      const fn = unwrap(factory);
      if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return null;
      const body = returnedExpression(fn);
      return body ? resolveArrayElements(body, ctx, depth + 1) : null;
    }
    // `xs.map(el => ({ … }))` — every element has ONE shape, so the callback's
    // returned object IS the binding. The callback parameter stays unbound,
    // which is exactly what makes a forwarded `w.schema` / `w.table` visible.
    if (name === "map" && ts.isPropertyAccessExpression(callee)) {
      const fn = node.arguments[0] ? unwrap(node.arguments[0] as ts.Expression) : null;
      if (!fn || (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))) return null;
      const body = returnedExpression(fn);
      return body ? [{ expr: body, ctx }] : null;
    }

    // A locally-declared helper that returns the array.
    if (ts.isIdentifier(callee)) {
      const sf = ownerFile(callee);
      const decl = findDeclaration(callee.text, sf, callee);
      if (!decl) return null;
      const target = decl.kind === "fn" ? decl.fn : decl.kind === "value" ? unwrap(decl.expr) : null;
      if (
        !target ||
        (!ts.isArrowFunction(target) && !ts.isFunctionExpression(target) && !ts.isFunctionDeclaration(target))
      ) {
        return null;
      }
      const body = returnedExpression(target);
      return body ? resolveArrayElements(body, childCtx(ctx, decl.sf), depth + 1) : null;
    }
    return null;
  }

  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const key = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isStringLiteral(node.argumentExpression)
        ? node.argumentExpression.text
        : null;
    if (key === null) return null;
    const objects = resolveObjects(node.expression, ctx, depth + 1);
    for (const obj of objects) {
      const value = obj.props.get(key);
      if (value) {
        const nested = resolveArrayElements(value.expr, value.ctx, depth + 1);
        if (nested !== null) return nested;
      }
    }
    return null;
  }

  return null;
}

/**
 * The property chain a value REALLY sits on, seeing through destructuring.
 * `const { schema, table } = adapter.realtimeTable` makes the shorthand
 * `schema` mean `adapter.realtimeTable.schema` — which is a chain this can
 * resolve, where the bare identifier is a dead end.
 */
function effectiveChain(
  value: Valued,
  depth = 0,
): { keys: string[]; ctx: Ctx } | null {
  if (depth > 8) return null;
  const direct = chainOf(value.expr);
  if (direct) return { keys: direct.keys, ctx: value.ctx };
  const node = unwrap(value.expr);
  if (!ts.isIdentifier(node)) return null;
  if (value.ctx.bindings.has(node.text)) return null;
  const sf = ownerFile(node);
  const decl = findDeclaration(node.text, sf, node);
  if (!decl || decl.kind !== "destructured") return null;
  const inner = effectiveChain({ expr: decl.source, ctx: childCtx(value.ctx, decl.sf) }, depth + 1);
  if (!inner) return null;
  return { keys: [...inner.keys, decl.key], ctx: inner.ctx };
}

/**
 * Last resort for a chain whose ROOT is a caller-supplied parameter:
 * `repository.tables.notes`, `adapter.realtimeTable`. See the long note above
 * `candidateObjectsByShape`.
 */
function walkChain(root: ResolvedObject, keys: string[]): string[] {
  let objects: ResolvedObject[] = [root];
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i] as string;
    const next: ResolvedObject[] = [];
    for (const obj of objects) {
      const value = obj.props.get(key);
      if (value) next.push(...resolveObjects(value.expr, value.ctx, 0));
    }
    objects = next;
  }
  const last = keys[keys.length - 1] as string;
  const out: string[] = [];
  for (const obj of objects) {
    const value = obj.props.get(last);
    if (value) out.push(...resolveStrings(value.expr, value.ctx, 0));
  }
  return dedupe(out);
}

/**
 * 🚨 THE PAIR IS RESOLVED PER CANDIDATE, NEVER CROSS-PRODUCTED. Two adapters
 * carrying `{schema:"tool",table:"ui"}` and `{schema:"app",table:"definition"}`
 * describe two subscriptions — `tool.ui` and `app.definition`. Resolving the
 * two chains independently and pairing every schema with every table invents
 * `app.ui` and `tool.definition`, which do not exist and would be reported as
 * missing from the publication forever. Each candidate object answers BOTH
 * chains or it answers neither.
 */
function resolveChainPairsByShape(
  schemaChain: { keys: string[]; ctx: Ctx },
  tableChain: { keys: string[]; ctx: Ctx },
): { schema: string; table: string }[] {
  const scope = packageScopeOf(schemaChain.ctx.sf.fileName);
  const requiredKeys = dedupe([schemaChain.keys[0] as string, tableChain.keys[0] as string]);
  const candidates = candidateObjectsByShape(scope, requiredKeys, schemaChain.ctx);
  const out: { schema: string; table: string }[] = [];
  for (const candidate of candidates) {
    const schemas = walkChain(candidate, schemaChain.keys);
    const tables = walkChain(candidate, tableChain.keys);
    if (schemas.length !== 1 || tables.length !== 1) continue;
    out.push({ schema: schemas[0] as string, table: tables[0] as string });
  }
  return out.filter(
    (pair, index) =>
      out.findIndex((p) => p.schema === pair.schema && p.table === pair.table) === index,
  );
}

/** The single expression a concise-body arrow, or a one-return function, yields. */
function returnedExpression(
  fn: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration,
): ts.Expression | null {
  if (ts.isArrowFunction(fn) && fn.body && !ts.isBlock(fn.body)) return fn.body;
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return null;
  const returns = body.statements.filter(ts.isReturnStatement);
  if (returns.length !== 1) return null;
  return returns[0]?.expression ?? null;
}

function propertyKey(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

/* ─────────────────────────── binding-site discovery ──────────────────────── */

const ANNOTATION = /realtime-publication:\s*([a-z0-9_]+)\.([a-z0-9_]+)/gi;
/** How far above a binding an annotation comment may sit and still bind to it. */
const ANNOTATION_LOOKBACK_LINES = 12;

function annotationsFor(sf: ts.SourceFile, node: ts.Node): { schema: string; table: string }[] {
  const text = sf.getFullText();
  const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  const lines = text.split("\n");
  const out: { schema: string; table: string }[] = [];
  const from = Math.max(0, startLine - 1 - ANNOTATION_LOOKBACK_LINES);
  for (let i = from; i < Math.min(lines.length, endLine); i += 1) {
    const line = lines[i] ?? "";
    ANNOTATION.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ANNOTATION.exec(line)) !== null) {
      out.push({ schema: (m[1] ?? "").toLowerCase(), table: (m[2] ?? "").toLowerCase() });
    }
  }
  return out;
}

/**
 * HELPERS THAT FORWARD THEIR OWN PARAMETERS.
 *
 * `useRunListRealtime({ table, schema })` builds a real binding out of values
 * its CALLER supplies. The declaration site can never name a table, and its
 * call sites can. So each one is registered here with the default schema its
 * signature declares, the declaration is recognised as a forwarder, and every
 * CALL becomes a binding site in its own right.
 *
 * This registry is not optional politeness: a binding that forwards the
 * enclosing function's parameters and whose function is NOT registered here is
 * reported as a finding telling you to register it. That is what stops the next
 * generic wrapper from opening a silent hole.
 */
const FORWARDING_HELPERS: { name: string; defaultSchema: string; why: string }[] = [
  {
    name: "useRunListRealtime",
    defaultSchema: "public",
    why: "hooks/useRunListRealtime.ts — one generic owner-scoped run-list subscription; the caller names the run table.",
  },
];

interface BindingSite {
  expr: ts.Expression;
  shape: string;
  node: ts.Node;
  /** `expr` is an ARRAY of bindings, not one binding. */
  isList?: boolean;
  /** The schema this shape uses when the binding omits one. */
  defaultSchema?: string;
}

function collectBindingSites(sf: ts.SourceFile): BindingSite[] {
  const sites: BindingSite[] = [];

  const visit = (node: ts.Node): void => {
    // (a) `.on("postgres_changes", { … })`
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "on" &&
      node.arguments.length >= 2
    ) {
      const first = unwrap(node.arguments[0] as ts.Expression);
      if (
        (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) &&
        first.text === "postgres_changes"
      ) {
        sites.push({ expr: node.arguments[1] as ts.Expression, shape: ".on(postgres_changes)", node });
      }
    }

    // (b) `postgresChanges: [ … ]` — the @ai-matrx/realtime spec shape.
    if (ts.isPropertyAssignment(node) && propertyKey(node.name) === "postgresChanges") {
      const value = unwrap(node.initializer);
      if (ts.isArrayLiteralExpression(value)) {
        for (const el of value.elements) {
          if (ts.isSpreadElement(el)) {
            sites.push({ expr: el.expression, shape: "postgresChanges[] spread", node: el });
            continue;
          }
          sites.push({ expr: el, shape: "postgresChanges[]", node: el });
        }
      } else {
        sites.push({ expr: value, shape: "postgresChanges (non-literal)", node, isList: true });
      }
    }

    // (c) `useRealtimeChannel(client, topic, bindings, options)` — @ai-matrx/data.
    //     The bindings are the THIRD POSITIONAL argument and are almost always a
    //     `useMemo(() => [...], deps)` result, never an inline literal.
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "useRealtimeChannel") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "useRealtimeChannel"))
    ) {
      const list = node.arguments[2];
      if (list) {
        sites.push({ expr: list, shape: "useRealtimeChannel bindings[]", node: list, isList: true });
      } else {
        sites.push({ expr: node, shape: "useRealtimeChannel (no bindings arg)", node });
      }
    }

    // (d) A registered forwarding helper's CALL site — see FORWARDING_HELPERS.
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const calleeName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : "";
      const helper = FORWARDING_HELPERS.find((h) => h.name === calleeName);
      if (helper) {
        const arg = node.arguments[0];
        if (arg) {
          sites.push({
            expr: arg,
            shape: `${helper.name}()`,
            node,
            defaultSchema: helper.defaultSchema,
          });
        } else {
          sites.push({ expr: node, shape: `${helper.name}() (no options)`, node });
        }
      }
    }

    // (e) `realtimeTable: { schema, table }` — the library-source adapter shape.
    //     The consumer (useTabRealtimeWatcher) destructures it from a parameter,
    //     so the DECLARATION is where the pair is knowable.
    if (ts.isPropertyAssignment(node) && propertyKey(node.name) === "realtimeTable") {
      sites.push({ expr: node.initializer, shape: "adapter.realtimeTable", node });
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sf, visit);
  return sites;
}

/* ───────────────────────────────── the scan ──────────────────────────────── */

interface ScanResult {
  pairs: ResolvedPair[];
  unresolved: Unresolved[];
  forwarders: Site[];
  siteCount: number;
  byShape: Map<string, { total: number; resolved: number }>;
}

function displayPath(file: string): string {
  const inFrontend = relative(ROOT, file);
  if (!inFrontend.startsWith("..")) return `matrx-frontend/${inFrontend}`;
  const inAidream = relative(AIDREAM_DIR, file);
  if (!inAidream.startsWith("..")) return `aidream/${inAidream}`;
  return file;
}

/**
 * THE TRANSPORT ITSELF. `@ai-matrx/realtime` and `@ai-matrx/data` contain the
 * `.on("postgres_changes", …)` calls that every consumer's binding travels
 * through. Those sites name NO table — they hand the caller's binding to the
 * Supabase client — so demanding a literal there is a demand that cannot be met,
 * and a guard nobody can satisfy is a guard somebody deletes.
 *
 * Two of them are recognised STRUCTURALLY, with no list at all:
 *   - `{ schema: X.schema, table: X.table }` — same opaque base, forwarded whole;
 *   - `{ ...binding, onChange: … }` — a caller's binding copied with a new handler.
 * That is precise: you cannot hide a real table behind either shape.
 *
 * The two below cannot be recognised structurally because they forward a binding
 * OBJECT rather than its fields, so they are named here WITH their reason. An
 * entry that matches nothing on a run is itself a finding — a stale allowlist
 * entry is how a list like this rots into a blanket exemption.
 */
const TRANSPORT_FORWARDERS: { file: string; shape: string; why: string }[] = [
  {
    file: "aidream/apps/shared/realtime/src/core/rooms.ts",
    shape: ".on(postgres_changes)",
    why: "RoomRegistry.attach re-binds a holder's already-declared filter onto the shared channel (`binding.filter as PostgresChangeFilter`). The table was named by the consumer that created the binding, and that consumer is scanned in its own right.",
  },
  {
    file: "aidream/apps/shared/realtime/src/react/use-channel.ts",
    shape: "postgresChanges (non-literal)",
    why: "useChannel re-wraps `declared.postgresChanges` from the caller's spec to route onChange through a ref. It copies the caller's list; it declares no table.",
  },
];

function isAllowlistedForwarder(site: Site): { why: string } | null {
  const hit = TRANSPORT_FORWARDERS.find((f) => f.file === site.file && f.shape === site.shape);
  return hit ? { why: hit.why } : null;
}

/**
 * Is `name` bound by a PARAMETER of some enclosing function (directly, or
 * through an object binding pattern)? That is the signature of a helper that
 * forwards its caller's values, and it is the one case where the declaration
 * site genuinely cannot know the table.
 */
function isParameterBound(name: string, from: ts.Node): boolean {
  let scope: ts.Node | undefined = from;
  while (scope) {
    const params: readonly ts.ParameterDeclaration[] | null =
      ts.isFunctionDeclaration(scope) || ts.isFunctionExpression(scope) || ts.isArrowFunction(scope) || ts.isMethodDeclaration(scope)
        ? scope.parameters
        : null;
    if (params) {
      for (const param of params) {
        if (ts.isIdentifier(param.name) && param.name.text === name) return true;
        if (ts.isObjectBindingPattern(param.name)) {
          for (const el of param.name.elements) {
            if (ts.isIdentifier(el.name) && el.name.text === name) return true;
          }
        }
      }
    }
    scope = scope.parent;
  }
  return false;
}

/** The nearest named function / const-arrow enclosing a node. */
function enclosingName(node: ts.Node): string | null {
  let scope: ts.Node | undefined = node;
  while (scope) {
    if (ts.isFunctionDeclaration(scope) && scope.name) return scope.name.text;
    if (
      ts.isVariableDeclaration(scope) &&
      ts.isIdentifier(scope.name) &&
      scope.initializer &&
      (ts.isArrowFunction(scope.initializer) || ts.isFunctionExpression(scope.initializer))
    ) {
      return scope.name.text;
    }
    scope = scope.parent;
  }
  return null;
}

/** `{ schema: X.schema, table: X.table }` with the same opaque base X. */
function isFieldForwarding(schema: Valued | undefined, table: Valued | undefined): boolean {
  if (!schema || !table) return false;
  const s = unwrap(schema.expr);
  const t = unwrap(table.expr);
  if (!ts.isPropertyAccessExpression(s) || !ts.isPropertyAccessExpression(t)) return false;
  if (s.name.text !== "schema" || t.name.text !== "table") return false;
  return s.expression.getText() === t.expression.getText();
}

function scan(seeds: { file: string; repo: "matrx-frontend" | "aidream" }[]): ScanResult {
  const pairs: ResolvedPair[] = [];
  const unresolved: Unresolved[] = [];
  const forwarders: Site[] = [];
  const byShape = new Map<string, { total: number; resolved: number }>();
  let siteCount = 0;

  for (const seed of seeds) {
    const sf = parse(seed.file);
    if (!sf) continue;
    // A LIST site (`useRealtimeChannel(_, _, bindings)`, a non-literal
    // `postgresChanges`) is expanded into its elements first; an element is a
    // binding like any other, and a list that will not open is one finding, not
    // a silent zero.
    const expanded: BindingSite[] = [];
    for (const site of collectBindingSites(sf)) {
      if (!site.isList) {
        expanded.push(site);
        continue;
      }
      const listCtx: Ctx = { sf, bindings: new Map(), seen: new Set() };
      const elements = resolveArrayElements(site.expr, listCtx);
      if (elements === null || elements.length === 0) {
        expanded.push({ ...site, isList: false });
        continue;
      }
      for (const el of elements) {
        expanded.push({ expr: el.expr, shape: site.shape, node: el.expr });
      }
    }
    for (const site of expanded) {
      siteCount += 1;
      const bucket = byShape.get(site.shape) ?? { total: 0, resolved: 0 };
      bucket.total += 1;
      byShape.set(site.shape, bucket);

      const meta: Site = {
        file: displayPath(seed.file),
        line: lineOf(sf, site.node),
        repo: seed.repo,
        shape: site.shape,
      };

      const freshCtx = (): Ctx => ({ sf, bindings: new Map(), seen: new Set() });
      const objects = resolveObjects(site.expr, freshCtx());

      // 1. Fully static, from the AST alone.
      const schemas: string[] = [];
      const tables: string[] = [];
      let opaque = objects.length === 0;
      let schemaProp: Valued | undefined;
      let tableProp: Valued | undefined;
      let sawSchemaProp = false;
      let sawTableProp = false;
      let allSpreadForwarded = objects.length > 0;
      for (const obj of objects) {
        if (obj.opaqueSpread) opaque = true;
        const s = obj.props.get("schema");
        const t = obj.props.get("table");
        schemaProp ??= s;
        tableProp ??= t;
        if (s) sawSchemaProp = true;
        if (t) sawTableProp = true;
        // `{ ...binding, onChange }` — nothing but a forwarded caller binding.
        if (!(obj.opaqueSpread && !s && !t)) allSpreadForwarded = false;
        if (s) schemas.push(...resolveStrings(s.expr, s.ctx));
        if (t) tables.push(...resolveStrings(t.expr, t.ctx));
      }

      // A shape that declares a default schema (a registered helper) supplies
      // it when the call omits one — exactly as the helper's signature does.
      if (schemas.length === 0 && site.defaultSchema && tables.length > 0 && !sawSchemaProp) {
        schemas.push(site.defaultSchema);
        sawSchemaProp = true;
      }

      // A pair is a PAIR. If both sides are multi-valued the cross-product would
      // invent combinations that never occur (see resolveChainPairsByShape), so
      // that is an ambiguity, not a resolution — it falls through and fails.
      const ambiguousPair = dedupe(schemas).length > 1 && dedupe(tables).length > 1;
      if (!opaque && !ambiguousPair && schemas.length > 0 && tables.length > 0) {
        bucket.resolved += 1;
        for (const schema of dedupe(schemas)) {
          for (const table of dedupe(tables)) {
            pairs.push({ schema: schema.toLowerCase(), table: table.toLowerCase(), via: "AST", site: meta });
          }
        }
        continue;
      }

      // 2. THE `repository.tables.X` / `adapter.realtimeTable` SHAPE — a chain
      //    whose root is a caller-supplied parameter. Resolved against every
      //    object in the package that declares that shape (see the long note).
      if (schemaProp && tableProp) {
        const sChain = effectiveChain(schemaProp);
        const tChain = effectiveChain(tableProp);
        if (sChain && tChain) {
          const shapePairs = resolveChainPairsByShape(sChain, tChain);
          if (shapePairs.length > 0) {
            bucket.resolved += 1;
            for (const pair of shapePairs) {
              pairs.push({
                schema: pair.schema.toLowerCase(),
                table: pair.table.toLowerCase(),
                via: "shape-resolved chain",
                site: meta,
              });
            }
            continue;
          }
        }
      }

      // 3. Annotated at the call site — resolved, and then CHECKED like any pair.
      const annotations = annotationsFor(sf, site.node);
      if (annotations.length > 0) {
        bucket.resolved += 1;
        for (const a of annotations) {
          pairs.push({ schema: a.schema, table: a.table, via: "annotation", site: meta });
        }
        continue;
      }

      // 4. The transport itself, which names no table.
      if (isFieldForwarding(schemaProp, tableProp) || allSpreadForwarded) {
        bucket.resolved += 1;
        forwarders.push(meta);
        continue;
      }
      const allowlisted = isAllowlistedForwarder(meta);
      if (allowlisted) {
        bucket.resolved += 1;
        forwarders.push(meta);
        continue;
      }

      // 5. A helper forwarding its OWN parameters. Registered → its call sites
      //    carry the truth and are scanned separately. Unregistered → a finding
      //    naming the fix, because an unregistered wrapper is a silent hole.
      const paramForwarded =
        schemaProp !== undefined &&
        tableProp !== undefined &&
        [schemaProp, tableProp].every((v) => {
          const node = unwrap(v.expr);
          return ts.isIdentifier(node) && isParameterBound(node.text, node);
        });
      if (paramForwarded) {
        const owner = enclosingName(site.node);
        if (owner && FORWARDING_HELPERS.some((h) => h.name === owner)) {
          bucket.resolved += 1;
          forwarders.push(meta);
          continue;
        }
        unresolved.push({
          site: meta,
          why:
            `\`schema\`/\`table\` are this function's own parameters` +
            (owner ? ` (\`${owner}\`)` : "") +
            ` — register it in FORWARDING_HELPERS in scripts/check-realtime-publication.ts` +
            ` so its CALL sites are scanned, or inline the pair here`,
        });
        continue;
      }

      const missing: string[] = [];
      if (objects.length === 0) {
        missing.push("the binding object could not be resolved to an object literal");
      } else {
        if (opaque) missing.push("a spread whose source could not be resolved");
        if (!sawSchemaProp) missing.push("no `schema` property");
        else if (schemas.length === 0) missing.push("`schema` is not a static value");
        if (!sawTableProp) missing.push("no `table` property");
        else if (tables.length === 0) missing.push("`table` is not a static value");
      }
      unresolved.push({ site: meta, why: missing.join("; ") });
    }
  }

  return { pairs, unresolved, forwarders, siteCount, byShape };
}
/* ────────────────────────────── the live half ────────────────────────────── */

function loadSupabaseEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!key && m[1] === "SUPABASE_SECRET_KEY") key = v;
      }
      if (url && key) break;
    }
  }
  return url && key ? { url, key } : null;
}

const PUBLICATION_QUERY = `
  select schemaname, tablename
  from pg_publication_tables
  where pubname = '${PUBLICATION}'
  order by schemaname, tablename
`;

async function fetchPublication(): Promise<
  { rows: { schemaname: string; tablename: string }[]; failure: null } | { rows: null; failure: string }
> {
  const env = loadSupabaseEnv();
  if (!env) return { rows: null, failure: "no NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY in env or .env* files" };
  const endpoint = `${env.url.replace(/\/$/, "")}/rest/v1/rpc/execute_admin_query`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        // `execute_admin_query` lives in `public`; PostgREST exposes `api` by
        // default here, so without these it 404s on a perfectly healthy DB.
        "Content-Profile": "public",
        "Accept-Profile": "public",
      },
      body: JSON.stringify({ query: PUBLICATION_QUERY }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { rows: null, failure: `execute_admin_query returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    const parsed: unknown = JSON.parse(await res.text());
    const rows = unwrapRows(parsed);
    if (rows === null) return { rows: null, failure: "execute_admin_query returned an unreadable shape" };
    if (rows.length === 0) {
      return { rows: null, failure: `pg_publication_tables returned ZERO rows for '${PUBLICATION}' — that is not a healthy publication, it is a failed read` };
    }
    return { rows, failure: null };
  } catch (err) {
    return {
      rows: null,
      failure: `could not reach Supabase at ${endpoint} (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

function unwrapRows(data: unknown): { schemaname: string; tablename: string }[] | null {
  const candidates: unknown[] = [];
  if (Array.isArray(data)) candidates.push(...data);
  else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["rows", "result", "data"]) {
      if (Array.isArray(obj[key])) candidates.push(...(obj[key] as unknown[]));
    }
  }
  // `execute_admin_query` may hand back [{ rows: [...] }] or [[...]].
  if (candidates.length === 1 && candidates[0] && typeof candidates[0] === "object" && !("schemaname" in (candidates[0] as object))) {
    const inner = unwrapRows(candidates[0]);
    if (inner) return inner;
  }
  const out: { schemaname: string; tablename: string }[] = [];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      const nested = unwrapRows(c);
      if (nested) out.push(...nested);
      continue;
    }
    if (!c || typeof c !== "object") continue;
    const row = c as Record<string, unknown>;
    if (typeof row.schemaname === "string" && typeof row.tablename === "string") {
      out.push({ schemaname: row.schemaname, tablename: row.tablename });
    }
  }
  return out.length > 0 ? out : null;
}

function unmeasured(reason: string): never {
  console.log("");
  console.log(`${TAG.warn} ${C.bold}${C.yellow}LIVE PULL FAILED — the realtime publication is UNMEASURED${C.reset}`);
  console.log(`  ${C.dim}${reason}${C.reset}`);
  console.log(`  ${C.dim}Nothing was compared against pg_publication_tables. That is NOT a pass.${C.reset}`);
  console.log("");
  process.exit(2);
}

/* ──────────────────────────────── self-test ──────────────────────────────── */

/**
 * THE FALSIFIABILITY PROOF. A guard nobody has seen fail is not a guard. This
 * plants two files in a throwaway directory and runs the SAME resolver over
 * them:
 *   1. a binding on a table that is certainly not in the publication;
 *   2. a binding whose table name is computed at runtime and carries no
 *      annotation — the UNRESOLVED case.
 * Both must be caught. If either is missed, the self-test exits 1 and the guard
 * is broken.
 */
function runSelfTest(publication: Set<string> | null): number {
  const dir = mkdtempSync(join(tmpdir(), "realtime-pub-selftest-"));
  try {
    const unpublishedFile = join(dir, "planted-unpublished.ts");
    writeFileSync(
      unpublishedFile,
      [
        "const REGISTRY = { tables: { ghost: \"definitely_not_published_table\" } } as const;",
        "const SCHEMA = \"nowhere\";",
        "export const spec = {",
        "  topic: \"x\",",
        "  postgresChanges: [",
        "    { event: \"*\", schema: SCHEMA, table: REGISTRY.tables.ghost, onChange: () => {} },",
        "  ],",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );

    const unresolvableFile = join(dir, "planted-unresolvable.ts");
    writeFileSync(
      unresolvableFile,
      [
        "export function build(pick: (n: number) => string) {",
        "  return {",
        "    topic: \"y\",",
        "    postgresChanges: [",
        "      { event: \"*\", schema: pick(1), table: pick(2), onChange: () => {} },",
        "    ],",
        "  };",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = scan([
      { file: unpublishedFile, repo: "matrx-frontend" },
      { file: unresolvableFile, repo: "matrx-frontend" },
    ]);

    console.log("");
    console.log(`${C.bold}SELF-TEST — can this guard actually fail?${C.reset}`);

    let bad = 0;
    let unmeasuredHalf = false;

    const planted = result.pairs.find(
      (p) => p.schema === "nowhere" && p.table === "definitely_not_published_table",
    );
    if (!planted) {
      console.log(`  ${TAG.fail} the planted UNPUBLISHED binding was not even resolved — the resolver is broken`);
      bad += 1;
    } else if (publication && publication.has("nowhere.definitely_not_published_table")) {
      console.log(`  ${TAG.fail} 'nowhere.definitely_not_published_table' is somehow IN the publication — pick another name`);
      bad += 1;
    } else if (publication === null) {
      console.log(
        `  ${TAG.warn} planted UNPUBLISHED binding resolved, but the publication half is UNMEASURED — the RED could not be confirmed against the live list`,
      );
      unmeasuredHalf = true;
    } else {
      console.log(`  ${TAG.ok} planted UNPUBLISHED binding is caught: nowhere.definitely_not_published_table (${displayPath(unpublishedFile)}:${planted.site.line})`);
    }

    const missed = result.unresolved.find((u) => u.site.file.includes("planted-unresolvable"));
    if (!missed) {
      console.log(`  ${TAG.fail} the planted UNRESOLVABLE binding was NOT reported — the guard would go green over a subscription it cannot verify`);
      bad += 1;
    } else {
      console.log(`  ${TAG.ok} planted UNRESOLVABLE binding is caught: ${missed.site.file}:${missed.site.line} — ${missed.why}`);
    }

    // And the annotation escape hatch must actually work, or the only remedy is
    // "delete the guard".
    const annotatedFile = join(dir, "planted-annotated.ts");
    writeFileSync(
      annotatedFile,
      [
        "export function build(pick: (n: number) => string) {",
        "  return {",
        "    postgresChanges: [",
        "      // realtime-publication: nowhere.annotated_ghost",
        "      { event: \"*\", schema: pick(1), table: pick(2), onChange: () => {} },",
        "    ],",
        "  };",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    const annotated = scan([{ file: annotatedFile, repo: "matrx-frontend" }]);
    const viaAnnotation = annotated.pairs.find((p) => p.via === "annotation" && p.table === "annotated_ghost");
    if (!viaAnnotation) {
      console.log(`  ${TAG.fail} an annotated binding was still reported UNRESOLVED — the escape hatch is broken`);
      bad += 1;
    } else if (annotated.unresolved.length > 0) {
      console.log(`  ${TAG.fail} an annotated binding produced findings anyway`);
      bad += 1;
    } else {
      console.log(`  ${TAG.ok} the annotation escape hatch resolves AND is then checked like any other pair`);
    }

    console.log("");
    if (unmeasuredHalf) {
      console.log(
        `${TAG.warn} ${C.bold}${C.yellow}LIVE PULL FAILED — the self-test is UNMEASURED${C.reset}`,
      );
      console.log(
        `  ${C.dim}The static half proved itself; the publication comparison could not run, so the${C.reset}`,
      );
      console.log(`  ${C.dim}planted RED was not confirmed end to end. That is NOT a pass.${C.reset}`);
      console.log("");
      return 2;
    }
    if (bad === 0) {
      console.log(
        `${TAG.ok} ${C.bold}${C.green}SELF-TEST PASSED — the guard catches a planted unpublished subscription AND a planted unresolvable one.${C.reset}`,
      );
      console.log("");
      return 0;
    }
    console.log(
      `${TAG.fail} ${C.bold}${C.red}SELF-TEST FAILED — this guard cannot be trusted (${bad} problem(s) above).${C.reset}`,
    );
    console.log("");
    return 3;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ────────────────────────────────── main ─────────────────────────────────── */

async function main(): Promise<number> {
  const aidreamPresent = existsSync(AIDREAM_PACKAGES);

  const live = await fetchPublication();
  const publication =
    live.rows === null ? null : new Set(live.rows.map((r) => `${r.schemaname}.${r.tablename}`));

  if (SELF_TEST) return runSelfTest(publication);

  if (!aidreamPresent) {
    // THE STRICTNESS LAW clause 7: a guard that cannot reach half its input
    // FAILS. The @ai-matrx packages hold real bindings (@ai-matrx/meet's
    // watchMeeting among them); scanning only this repo and reporting green
    // would be the fourth-time defect wearing a tick.
    console.log("");
    console.log(`${TAG.warn} ${C.bold}${C.yellow}LIVE PULL FAILED — the realtime publication is UNMEASURED${C.reset}`);
    console.log(`  ${C.dim}no aidream checkout at ${AIDREAM_PACKAGES} (set AIDREAM_DIR).${C.reset}`);
    console.log(`  ${C.dim}The @ai-matrx package bindings were NOT scanned. That is NOT a pass.${C.reset}`);
    console.log("");
    return 2;
  }

  const seeds = collectSeeds();
  const result = scan(seeds);

  const distinct = new Map<string, ResolvedPair[]>();
  for (const p of result.pairs) {
    const key = `${p.schema}.${p.table}`;
    const list = distinct.get(key) ?? [];
    list.push(p);
    distinct.set(key, list);
  }

  console.log("");
  console.log(
    `${C.bold}Realtime publication guard${C.reset} ${C.dim}(postgres_changes bindings vs pg_publication_tables '${PUBLICATION}')${C.reset}`,
  );
  console.log(
    `  ${C.dim}${result.siteCount} binding site(s) in ${seeds.length} candidate file(s); ${distinct.size} distinct (schema, table) pair(s).${C.reset}`,
  );
  for (const [shape, counts] of [...result.byShape].sort()) {
    console.log(
      `  ${C.dim}· ${shape.padEnd(34)} ${counts.resolved}/${counts.total} resolved${C.reset}`,
    );
  }
  if (result.forwarders.length > 0) {
    console.log(
      `  ${C.dim}· ${result.forwarders.length} transport site(s) name no table (they forward a caller's binding):${C.reset}`,
    );
    for (const f of result.forwarders) console.log(`    ${C.dim}${f.file}:${f.line}${C.reset}`);
  }

  if (LIST_ONLY) {
    console.log("");
    for (const key of [...distinct.keys()].sort()) console.log(`  ${key}`);
    console.log("");
    return 0;
  }

  let failures = 0;

  // A NAMED EXEMPTION THAT MATCHES NOTHING IS HOW A LIST ROTS INTO A BLANKET
  // ONE. If a transport forwarder moved or was deleted, its entry must go too.
  const staleAllowlist = TRANSPORT_FORWARDERS.filter(
    (entry) => !result.forwarders.some((f) => f.file === entry.file && f.shape === entry.shape),
  );
  if (staleAllowlist.length > 0) {
    console.log("");
    console.log(
      `${TAG.fail} ${C.bold}${C.red}${staleAllowlist.length} stale allowlist entry/entries in TRANSPORT_FORWARDERS.${C.reset}`,
    );
    for (const entry of staleAllowlist) {
      console.log(`  ${C.red}✗${C.reset} ${entry.file} (${entry.shape}) ${C.dim}matched nothing this run — delete it or fix the path${C.reset}`);
    }
    failures += staleAllowlist.length;
  }

  if (result.unresolved.length > 0) {
    console.log("");
    console.log(
      `${TAG.fail} ${C.bold}${C.red}${result.unresolved.length} subscription(s) could not be resolved statically.${C.reset}`,
    );
    console.log(
      `  ${C.dim}An unverifiable subscription is a failing one — this is the exact shape (indirect schema/table)${C.reset}`,
    );
    console.log(
      `  ${C.dim}that made a regex scanner useless. Fix the code so the pair is static, or annotate the call site:${C.reset}`,
    );
    console.log(`  ${C.dim}    // realtime-publication: <schema>.<table>${C.reset}`);
    console.log("");
    for (const u of result.unresolved) {
      console.log(`  ${C.red}✗${C.reset} ${u.site.file}:${u.site.line} ${C.dim}(${u.site.shape}) — ${u.why}${C.reset}`);
    }
    failures += result.unresolved.length;
  }

  if (publication === null) {
    console.log("");
    console.log(
      `  ${C.dim}${result.unresolved.length === 0 ? "Every binding resolved statically. " : ""}The publication half could not run.${C.reset}`,
    );
    unmeasured(live.failure ?? "unknown");
  }

  const unpublished = [...distinct.entries()].filter(([key]) => !publication.has(key));

  console.log("");
  console.log(
    `  ${C.dim}Live publication '${PUBLICATION}' holds ${publication.size} table(s).${C.reset}`,
  );

  if (unpublished.length > 0) {
    console.log("");
    console.log(
      `${TAG.fail} ${C.bold}${C.red}${unpublished.length} SUBSCRIBED TABLE(S) ARE NOT IN THE '${PUBLICATION}' PUBLICATION.${C.reset}`,
    );
    console.log(
      `  ${C.dim}These channels join, report SUBSCRIBED, and deliver NOTHING. No error is raised anywhere.${C.reset}`,
    );
    console.log("");
    for (const [key, sites] of unpublished.sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${C.red}✗${C.reset} ${C.bold}${key}${C.reset}`);
      for (const s of sites) {
        console.log(`      ${C.dim}${s.site.file}:${s.site.line} (${s.site.shape}, via ${s.via})${C.reset}`);
      }
    }
    console.log("");
    console.log(
      `  ${C.dim}FIX: an idempotent migration guarded on pg_publication_tables — the precedent files are${C.reset}`,
    );
    console.log(
      `  ${C.dim}migrations/meet_realtime_publication.sql and migrations/realtime_publication_workbench_notes.sql.${C.reset}`,
    );
    failures += unpublished.length;
  }

  console.log("");
  if (failures === 0) {
    console.log(
      `${TAG.ok} ${C.bold}${C.green}All ${distinct.size} subscribed (schema, table) pair(s) are published. Every binding resolved.${C.reset}`,
    );
    console.log("");
    return 0;
  }
  console.log(
    `${TAG.fail} ${C.bold}${C.red}Realtime publication guard: ${failures} finding(s).${C.reset}`,
  );
  console.log("");
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${TAG.fail} check-realtime-publication crashed:`, err);
    process.exit(3);
  },
);
