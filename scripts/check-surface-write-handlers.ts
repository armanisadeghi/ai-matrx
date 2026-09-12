#!/usr/bin/env tsx
/**
 * SURFACE WRITE-HANDLER GUARD — every `writeTargets` entry a surface manifest
 * DECLARES must have a write handler some mount of that surface REGISTERS.
 *
 * THE CLASS THIS EXISTS FOR. `writeTargets` are declared in code
 * (`features/surfaces/manifests/*.manifest.ts`), mirrored to the DB, printed
 * into the agent's `<surface_write_targets>` block, and injected as the
 * `apply_surface_write` tool. The HANDLER that actually applies the value is
 * registered somewhere else entirely — a `<SurfaceRuntimeProvider
 * getWriteHandlers>` prop, a `useSurfaceWriteHandlers(name, {...})` call in a
 * deep child, or a `useSurfaceRuntimeRegistration({ getWriteHandlers })` hook.
 * Nothing links the two halves at build time. A declared target with no
 * registered handler therefore:
 *
 *   - is advertised to the agent as something it can do,
 *   - is spent on: the agent plans a turn around it, calls the tool, and
 *   - fails only at APPLY time, after the user approved the write
 *     (`surface-writeback.ts` → "declares write target X but registered no
 *     handler for it").
 *
 * The 371 targets across 109 manifests were rolled out by an avalanche of
 * agents, one surface each. Each verified its own surface; nobody ever proved
 * coverage globally. This proves it — statically, over the whole repo.
 *
 * WHY AN AST RESOLVER AND NOT A GREP. Handler maps are almost never a literal
 * beside the surface name. They arrive as a named `getSurfaceWriteHandlers`
 * function declared 300 lines up, a `useCallback(() => ({...}))`, a hook call
 * (`useBundlesWriteHandlers()`), an imported builder, a spread of a shared
 * object, or a conditional. A regex would go green over exactly the indirect
 * shapes that hide a gap. So every registration is resolved through the
 * TypeScript AST: object literals, spreads, identifiers (local and imported),
 * function returns, `useCallback`/`useMemo` wrappers, conditionals, `??`/`||`,
 * `Object.assign`, and property chains into imported const objects.
 *
 * 🚨 AN UNRESOLVABLE REGISTRATION IS A FINDING, NOT A PASS. Anything the
 * resolver cannot settle statically is reported as UNRESOLVED and counted —
 * never skipped, never silently treated as covering the surface. The one
 * escape is an explicit annotation on the line above the registration:
 *
 *     // surface-write-handlers: page_draft_content, page_meta_tags
 *
 * which is then credited exactly like a resolved key set (and still checked
 * against the manifest, so a typo shows up as a missing target).
 *
 * A surface whose gap genuinely cannot be wired on any mount is listed in
 * `docs/handoffs/canonical-stream-and-surface-writeback.md` under WP3 with the
 * reason. Declared targets are NEVER deleted to make this green — Arman rules
 * on deletions (the unfinished-work alarm).
 *
 * ADVISORY BY DOCTRINE. It exits 1 on findings so `--strict` triage and the
 * release-gates runner can report them, but nothing blocks a merge or a
 * deploy on it. Scream, never block.
 *
 * Usage:
 *   pnpm check:surface-write-handlers              # the real check
 *   pnpm check:surface-write-handlers --self-test  # prove the guard can FAIL
 *   pnpm check:surface-write-handlers --list       # print the resolved census
 *
 * Exit codes:
 *   0  every declared write target has a resolvable registered handler
 *   1  findings: an unhandled target, or a registration that cannot be resolved
 *   3  the self-test could not make this guard fail, or the script crashed
 */
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
  "public",
]);
const EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];

/** A file is a SEED (a place a handler map may be registered) if it mentions any of these. */
const SEED_MARKERS = [
  "useSurfaceWriteHandlers",
  "getWriteHandlers",
  "surface-write-handlers:",
];

/**
 * The runtime itself declares and consumes these names; its own mentions are
 * definitions, not registrations. Tests plant synthetic surfaces.
 */
function isExcluded(file: string): boolean {
  const p = file.replace(/\\/g, "/");
  if (/(\.test\.|\.spec\.|__tests__|\/__mocks__\/)/.test(p)) return true;
  if (p.includes("/features/surfaces/runtime/")) return true;
  if (p.includes("/scripts/")) return true;
  return false;
}

function walk(dir: string, out: string[]): void {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as never;
  } catch {
    return;
  }
  for (const entry of entries as unknown as Array<{
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }>) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile() && EXTS.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
}

function seedFiles(): string[] {
  const all: string[] = [];
  for (const top of ["app", "components", "features", "hooks", "lib", "utils"]) {
    const dir = join(ROOT, top);
    if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir, all);
  }
  return all.filter((file) => {
    if (isExcluded(file)) return false;
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      return false;
    }
    return SEED_MARKERS.some((marker) => text.includes(marker));
  });
}

function displayPath(file: string): string {
  return relative(ROOT, file) || file;
}

/* ──────────────────────────── source-file cache ──────────────────────────── */

const sourceCache = new Map<string, ts.SourceFile | null>();

function getSource(file: string): ts.SourceFile | null {
  if (sourceCache.has(file)) return sourceCache.get(file) ?? null;
  let sf: ts.SourceFile | null = null;
  try {
    sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") || file.endsWith(".jsx")
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS,
    );
  } catch {
    sf = null;
  }
  sourceCache.set(file, sf);
  return sf;
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/* ───────────────────────── module + symbol resolution ────────────────────── */

function resolveModuleSpecifier(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // package import — out of scope
  const candidates = [
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => join(base, "index" + e)),
    base,
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

type Binding =
  | { kind: "node"; node: ts.Node; file: string }
  | { kind: "property"; objectExpr: ts.Node; property: string; file: string }
  | { kind: "unresolved"; why: string };

/** Find what `name` refers to inside `file`: a local declaration or an import. */
function lookup(file: string, name: string): Binding | null {
  const sf = getSource(file);
  if (!sf) return null;
  let found: Binding | null = null;

  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      if (node.initializer) found = { kind: "node", node: node.initializer, file };
      else found = { kind: "unresolved", why: `\`${name}\` is declared without an initializer` };
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = { kind: "node", node, file };
      return;
    }
    // `const { getWriteHandlers } = useSomethingSurface(...)` — the single most
    // common indirection for a hook-owned seam.
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      for (const element of node.name.elements) {
        if (!ts.isIdentifier(element.name) || element.name.text !== name) continue;
        const sourceKey = element.propertyName
          ? propName(element.propertyName, file)
          : element.name.text;
        if (!sourceKey) {
          found = { kind: "unresolved", why: `\`${name}\` is destructured under a computed key` };
          return;
        }
        found = {
          kind: "property",
          objectExpr: node.initializer,
          property: sourceKey,
          file,
        };
        return;
      }
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (element.name.text !== name) continue;
          const target = resolveModuleSpecifier(file, node.moduleSpecifier.text);
          const exported = (element.propertyName ?? element.name).text;
          if (!target) {
            found = {
              kind: "unresolved",
              why: `\`${name}\` is imported from the package "${(node.moduleSpecifier as ts.StringLiteral).text}" (outside this repo's source)`,
            };
            return;
          }
          const viaExport = lookupExport(target, exported);
          found =
            viaExport ??
            {
              kind: "unresolved",
              why: `\`${exported}\` is not a resolvable export of ${displayPath(target)}`,
            };
          return;
        }
      }
      if (clause?.name && clause.name.text === name) {
        const target = resolveModuleSpecifier(file, node.moduleSpecifier.text);
        if (!target) {
          found = { kind: "unresolved", why: `\`${name}\` is a default import from a package` };
          return;
        }
        found = lookupExport(target, "default") ?? {
          kind: "unresolved",
          why: `no default export found in ${displayPath(target)}`,
        };
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return found;
}

/** Find `name` as an EXPORT of `file` (following `export {} from` re-exports). */
function lookupExport(file: string, name: string, depth = 0): Binding | null {
  if (depth > 6) return { kind: "unresolved", why: "export chain too deep" };
  const sf = getSource(file);
  if (!sf) return null;

  for (const stmt of sf.statements) {
    if (
      ts.isVariableStatement(stmt) &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
          return { kind: "node", node: decl.initializer, file };
        }
      }
    }
    if (
      ts.isFunctionDeclaration(stmt) &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      const isDefault = stmt.modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (stmt.name?.text === name || (name === "default" && isDefault)) {
        return { kind: "node", node: stmt, file };
      }
    }
    if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const element of stmt.exportClause.elements) {
        if (element.name.text !== name) continue;
        const local = (element.propertyName ?? element.name).text;
        if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
          const target = resolveModuleSpecifier(file, stmt.moduleSpecifier.text);
          if (!target) return { kind: "unresolved", why: `re-exported from a package` };
          return lookupExport(target, local, depth + 1);
        }
        return lookup(file, local);
      }
    }
    if (ts.isExportDeclaration(stmt) && !stmt.exportClause && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const target = resolveModuleSpecifier(file, stmt.moduleSpecifier.text);
      if (target) {
        const viaStar = lookupExport(target, name, depth + 1);
        if (viaStar && viaStar.kind === "node") return viaStar;
      }
    }
  }
  // A locally-declared symbol that is exported via `export { x }` handled above;
  // otherwise fall back to a plain local lookup (covers `export default fn`).
  return lookup(file, name);
}

/* ─────────────────────────── expression resolution ───────────────────────── */

function unwrap(node: ts.Node): ts.Node {
  let current = node;
  for (;;) {
    if (ts.isParenthesizedExpression(current)) current = current.expression;
    else if (ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression;
    else if (ts.isNonNullExpression(current)) current = current.expression;
    else if (ts.isTypeAssertionExpression?.(current as ts.TypeAssertion)) current = (current as ts.TypeAssertion).expression;
    else return current;
  }
}

type StringResult = { values: string[]; unresolved: string[] };
type Located = { node: ts.Node; file: string };

/** Every `return` expression of a function-ish node (nested functions excluded). */
function functionReturns(fn: ts.Node): ts.Expression[] {
  const body = (fn as ts.ArrowFunction).body;
  if (!body) return [];
  if (!ts.isBlock(body)) return [body];
  return returnExpressions(body);
}

function isFunctionish(node: ts.Node): boolean {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node)
  );
}

/**
 * Expand an expression to the terminal nodes it can evaluate to, following
 * identifiers (local + imported), destructuring, calls (into their returns),
 * conditionals, `??`/`||`, `useCallback`/`useMemo`, and property chains.
 * Everything the avalanche's 161 registrations actually use.
 */
function candidates(node: ts.Node, file: string, depth = 0): { nodes: Located[]; unresolved: string[] } {
  if (depth > 14) return { nodes: [], unresolved: ["expression nesting too deep"] };
  const n = unwrap(node);

  if (ts.isConditionalExpression(n)) {
    const a = candidates(n.whenTrue, file, depth + 1);
    const b = candidates(n.whenFalse, file, depth + 1);
    return { nodes: [...a.nodes, ...b.nodes], unresolved: [...a.unresolved, ...b.unresolved] };
  }
  if (
    ts.isBinaryExpression(n) &&
    (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      n.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
  ) {
    const a = candidates(n.left, file, depth + 1);
    const b = candidates(n.right, file, depth + 1);
    return { nodes: [...a.nodes, ...b.nodes], unresolved: [...a.unresolved, ...b.unresolved] };
  }

  if (ts.isIdentifier(n)) {
    if (n.text === "undefined") return { nodes: [], unresolved: [] };
    const binding = lookup(file, n.text);
    if (!binding)
      return { nodes: [], unresolved: [`\`${n.text}\` is not declared in this file (a prop or parameter?)`] };
    if (binding.kind === "unresolved") return { nodes: [], unresolved: [binding.why] };
    if (binding.kind === "property")
      return propertyCandidates(binding.objectExpr, binding.file, binding.property, depth + 1);
    return candidates(binding.node, binding.file, depth + 1);
  }

  if (ts.isPropertyAccessExpression(n)) {
    return propertyCandidates(n.expression, file, n.name.text, depth + 1);
  }

  if (ts.isCallExpression(n)) {
    const callee = unwrap(n.expression);
    if (ts.isIdentifier(callee) && HOOK_WRAPPERS.has(callee.text) && n.arguments.length > 0) {
      return candidates(n.arguments[0], file, depth + 1);
    }
    const calleeCandidates = candidates(callee, file, depth + 1);
    if (calleeCandidates.nodes.length === 0) {
      return {
        nodes: [],
        unresolved: calleeCandidates.unresolved.length
          ? calleeCandidates.unresolved
          : [`cannot resolve the result of \`${snippet(n)}\``],
      };
    }
    const out: Located[] = [];
    const unresolved: string[] = [...calleeCandidates.unresolved];
    for (const candidate of calleeCandidates.nodes) {
      if (!isFunctionish(candidate.node)) {
        unresolved.push(`\`${snippet(n)}\` does not resolve to a function this check can read`);
        continue;
      }
      const returns = functionReturns(candidate.node);
      if (returns.length === 0) unresolved.push(`\`${snippet(n)}\` returns nothing resolvable`);
      for (const ret of returns) {
        const expanded = candidates(ret, candidate.file, depth + 1);
        out.push(...expanded.nodes);
        unresolved.push(...expanded.unresolved);
      }
    }
    return { nodes: out, unresolved };
  }

  return { nodes: [{ node: n, file }], unresolved: [] };
}

function propertyCandidates(
  objectExpr: ts.Node,
  file: string,
  property: string,
  depth: number,
): { nodes: Located[]; unresolved: string[] } {
  const holders = candidates(objectExpr, file, depth + 1);
  const out: Located[] = [];
  const unresolved: string[] = [...holders.unresolved];
  let sawObject = false;
  for (const holder of holders.nodes) {
    if (!ts.isObjectLiteralExpression(holder.node)) continue;
    sawObject = true;
    for (const prop of holder.node.properties) {
      if (ts.isPropertyAssignment(prop) && propName(prop.name, holder.file) === property) {
        const expanded = candidates(prop.initializer, holder.file, depth + 1);
        out.push(...expanded.nodes);
        unresolved.push(...expanded.unresolved);
      } else if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === property) {
        const expanded = candidates(prop.name, holder.file, depth + 1);
        out.push(...expanded.nodes);
        unresolved.push(...expanded.unresolved);
      } else if (ts.isMethodDeclaration(prop) && propName(prop.name, holder.file) === property) {
        out.push({ node: prop, file: holder.file });
      } else if (ts.isSpreadAssignment(prop)) {
        const expanded = propertyCandidates(prop.expression, holder.file, property, depth + 1);
        out.push(...expanded.nodes);
        unresolved.push(...expanded.unresolved);
      }
    }
  }
  if (out.length === 0 && sawObject) {
    unresolved.push(`property \`${property}\` is not declared on the resolved object`);
  } else if (out.length === 0 && holders.nodes.length > 0) {
    unresolved.push(`\`${snippet(objectExpr)}\` does not resolve to an object literal`);
  }
  return { nodes: out, unresolved };
}

/**
 * The string values a `for (const x of <expr>)` loop variable can take, for the
 * `for (const name of Object.values(TARGETS)) handlers[name] = …` shape
 * (`PdfStudioShell`). Only the two forms that are actually static: an array
 * literal, and `Object.values`/`Object.keys` of a resolvable object literal.
 */
function forOfElementStrings(node: ts.Identifier, file: string, depth: number): StringResult | null {
  // Walk OUT from the reference to the nearest enclosing `for…of` that declares
  // this name — the reference itself is not the declaration.
  let loop: ts.ForOfStatement | null = null;
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (!ts.isForOfStatement(current)) continue;
    const initializer = current.initializer;
    if (!ts.isVariableDeclarationList(initializer)) continue;
    const declares = initializer.declarations.some(
      (decl) => ts.isIdentifier(decl.name) && decl.name.text === node.text,
    );
    if (declares) {
      loop = current;
      break;
    }
  }
  if (!loop) return null;
  const iterable = unwrap(loop.expression);

  if (ts.isArrayLiteralExpression(iterable)) {
    return iterable.elements.reduce<StringResult>(
      (acc, element) => {
        const resolved = resolveStringExpr(element, file, depth + 1);
        return {
          values: [...acc.values, ...resolved.values],
          unresolved: [...acc.unresolved, ...resolved.unresolved],
        };
      },
      { values: [], unresolved: [] },
    );
  }

  if (
    ts.isCallExpression(iterable) &&
    ts.isPropertyAccessExpression(unwrap(iterable.expression)) &&
    ["values", "keys"].includes(
      (unwrap(iterable.expression) as ts.PropertyAccessExpression).name.text,
    ) &&
    iterable.arguments.length === 1
  ) {
    const wantsKeys =
      (unwrap(iterable.expression) as ts.PropertyAccessExpression).name.text === "keys";
    const holders = resolveObjectLiterals(iterable.arguments[0], file, depth + 1);
    const out: StringResult = { values: [], unresolved: [...holders.unresolved] };
    for (const holder of holders.literals) {
      for (const prop of (holder.node as ts.ObjectLiteralExpression).properties) {
        if (!ts.isPropertyAssignment(prop)) {
          out.unresolved.push(`\`${snippet(prop)}\` is not a plain property this check can read`);
          continue;
        }
        if (wantsKeys) {
          const key = propName(prop.name, holder.file);
          if (key) out.values.push(key);
          else out.unresolved.push(`computed key \`${snippet(prop.name)}\` is not resolvable`);
          continue;
        }
        const resolved = resolveStringExpr(prop.initializer, holder.file, depth + 1);
        out.values.push(...resolved.values);
        out.unresolved.push(...resolved.unresolved);
      }
    }
    return out.values.length > 0 || out.unresolved.length > 0 ? out : null;
  }

  return null;
}

function resolveStringExpr(node: ts.Node, file: string, depth = 0): StringResult {
  if (depth > 12) return { values: [], unresolved: ["expression nesting too deep"] };
  const n = unwrap(node);

  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
    return { values: [n.text], unresolved: [] };
  }
  if (n.kind === ts.SyntaxKind.NullKeyword) return { values: [], unresolved: [] };

  if (ts.isIdentifier(n)) {
    const viaForOf = forOfElementStrings(n, file, depth);
    if (viaForOf) return viaForOf;
  }

  const expanded = candidates(n, file, depth);
  const values: string[] = [];
  const unresolved: string[] = [...expanded.unresolved];
  for (const candidate of expanded.nodes) {
    if (ts.isStringLiteral(candidate.node) || ts.isNoSubstitutionTemplateLiteral(candidate.node)) {
      values.push((candidate.node as ts.StringLiteral).text);
      continue;
    }
    if (candidate.node.kind === ts.SyntaxKind.NullKeyword) continue;
    unresolved.push(`cannot statically resolve \`${snippet(candidate.node)}\` to a surface name`);
  }
  if (values.length === 0 && unresolved.length === 0) {
    unresolved.push(`cannot statically resolve \`${snippet(n)}\` to a surface name`);
  }
  return { values, unresolved };
}

function snippet(node: ts.Node): string {
  let text: string;
  try {
    text = node.getText();
  } catch {
    text = ts.SyntaxKind[node.kind];
  }
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 70 ? flat.slice(0, 67) + "…" : flat;
}

function propName(name: ts.PropertyName, file: string): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const resolved = resolveStringExpr(name.expression, file);
    if (resolved.values.length === 1) return resolved.values[0];
  }
  return null;
}

/** The object literal(s) an expression can evaluate to. */
function resolveObjectLiterals(
  node: ts.Node,
  file: string,
  depth = 0,
): { literals: Located[]; unresolved: string[] } {
  const expanded = candidates(node, file, depth);
  return {
    literals: expanded.nodes.filter((c) => ts.isObjectLiteralExpression(c.node)),
    unresolved: expanded.unresolved,
  };
}

/* ───────────────────────── handler key-set resolution ────────────────────── */

type KeyResult = { keys: Set<string>; unresolved: string[] };

function emptyKeys(): KeyResult {
  return { keys: new Set(), unresolved: [] };
}

function mergeKeys(a: KeyResult, b: KeyResult): KeyResult {
  return {
    keys: new Set([...a.keys, ...b.keys]),
    unresolved: [...a.unresolved, ...b.unresolved],
  };
}

/** Every `return` expression in a function body (nested functions excluded). */
function returnExpressions(body: ts.Node): ts.Expression[] {
  const out: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      return; // a nested function's returns are not this function's returns
    }
    if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return out;
}

const HOOK_WRAPPERS = new Set(["useCallback", "useMemo", "useRef"]);

/**
 * HANDLERS ASSEMBLED BY ASSIGNMENT. A map is often built up rather than written
 * out — `const handlers: Record<string, Handler> = { … };` followed by
 * `handlers.scrape_command = …` / `handlers["x"] = …`, often inside an `if`
 * that asks whether THIS mount owns the input. `AgentRunnerPage` and
 * `buildScraperWriteHandlers` both do it, and before 2026-09-11 this guard read
 * only the literal's own members, so it called six live targets on two surfaces
 * unhandled.
 *
 * Conditional assignment still counts as registration: this guard proves a
 * handler EXISTS for a declared target, not that every mount offers it (the
 * runtime decides that per mount, and `check:agent-disclosure` owns the
 * availability half).
 */
function assignedKeys(literal: ts.ObjectLiteralExpression, file: string): KeyResult {
  // The literal must be the initializer of `const <name> = { … }`.
  const declaration = literal.parent;
  if (
    !declaration ||
    !ts.isVariableDeclaration(declaration) ||
    declaration.initializer !== literal ||
    !ts.isIdentifier(declaration.name)
  ) {
    return emptyKeys();
  }
  const name = declaration.name.text;

  // Scope: the nearest enclosing function or source file.
  let scope: ts.Node = declaration;
  while (scope.parent && !isFunctionish(scope.parent) && !ts.isSourceFile(scope.parent)) {
    scope = scope.parent;
  }
  const root = scope.parent ?? scope;

  const result = emptyKeys();
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const left = unwrap(node.left);
      if (
        ts.isPropertyAccessExpression(left) &&
        ts.isIdentifier(unwrap(left.expression)) &&
        (unwrap(left.expression) as ts.Identifier).text === name
      ) {
        result.keys.add(left.name.text);
      } else if (
        ts.isElementAccessExpression(left) &&
        ts.isIdentifier(unwrap(left.expression)) &&
        (unwrap(left.expression) as ts.Identifier).text === name
      ) {
        const key = resolveStringExpr(left.argumentExpression, file);
        for (const value of key.values) result.keys.add(value);
        result.unresolved.push(...key.unresolved);
      }
    }
    // `Object.assign(handlers, …)` — the spread-by-call form of the same thing.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(unwrap(node.expression)) &&
      (unwrap(node.expression) as ts.PropertyAccessExpression).name.text === "assign" &&
      node.arguments.length > 1 &&
      ts.isIdentifier(unwrap(node.arguments[0])) &&
      (unwrap(node.arguments[0]) as ts.Identifier).text === name
    ) {
      for (const arg of node.arguments.slice(1)) {
        const merged = resolveHandlerKeys(arg, file, 1);
        for (const key of merged.keys) result.keys.add(key);
        result.unresolved.push(...merged.unresolved);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return result;
}

function resolveHandlerKeys(node: ts.Node, file: string, depth = 0): KeyResult {
  if (depth > 14) return { keys: new Set(), unresolved: ["expression nesting too deep"] };
  const n = unwrap(node);

  if (n.kind === ts.SyntaxKind.NullKeyword) return emptyKeys();
  if (ts.isIdentifier(n) && n.text === "undefined") return emptyKeys();

  if (ts.isObjectLiteralExpression(n)) {
    let result = emptyKeys();
    for (const prop of n.properties) {
      if (ts.isSpreadAssignment(prop)) {
        result = mergeKeys(result, resolveHandlerKeys(prop.expression, file, depth + 1));
        continue;
      }
      if (
        ts.isPropertyAssignment(prop) ||
        ts.isShorthandPropertyAssignment(prop) ||
        ts.isMethodDeclaration(prop)
      ) {
        const name = ts.isShorthandPropertyAssignment(prop)
          ? prop.name.text
          : propName(prop.name, file);
        if (name) result.keys.add(name);
        else
          result.unresolved.push(
            `computed handler key \`${snippet(prop.name ?? prop)}\` cannot be resolved to a target name`,
          );
        continue;
      }
      result.unresolved.push(`unsupported handler-map member \`${snippet(prop)}\``);
    }
    return mergeKeys(result, assignedKeys(n, file));
  }

  if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) {
    const body = (n as ts.ArrowFunction).body;
    if (!body) return { keys: new Set(), unresolved: ["function has no body"] };
    if (!ts.isBlock(body)) return resolveHandlerKeys(body, file, depth + 1);
    const returns = returnExpressions(body);
    if (returns.length === 0)
      return { keys: new Set(), unresolved: [`\`${snippet(n)}\` returns nothing resolvable`] };
    return returns.reduce<KeyResult>(
      (acc, expr) => mergeKeys(acc, resolveHandlerKeys(expr, file, depth + 1)),
      emptyKeys(),
    );
  }

  if (ts.isConditionalExpression(n)) {
    return mergeKeys(
      resolveHandlerKeys(n.whenTrue, file, depth + 1),
      resolveHandlerKeys(n.whenFalse, file, depth + 1),
    );
  }
  if (
    ts.isBinaryExpression(n) &&
    (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      n.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
  ) {
    return mergeKeys(
      resolveHandlerKeys(n.left, file, depth + 1),
      resolveHandlerKeys(n.right, file, depth + 1),
    );
  }

  // Object.assign(a, b, ...) — union of every argument.
  if (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(unwrap(n.expression)) &&
    (unwrap(n.expression) as ts.PropertyAccessExpression).name.text === "assign"
  ) {
    return n.arguments.reduce<KeyResult>(
      (acc, arg) => mergeKeys(acc, resolveHandlerKeys(arg, file, depth + 1)),
      emptyKeys(),
    );
  }

  // Everything else — identifiers, calls, hook results, property chains,
  // destructured seams — goes through the shared candidate expander, and each
  // terminal is then read as a handler map (or the function returning one).
  if (
    ts.isIdentifier(n) ||
    ts.isCallExpression(n) ||
    ts.isPropertyAccessExpression(n) ||
    ts.isElementAccessExpression(n)
  ) {
    const expanded = candidates(n, file, depth);
    if (expanded.nodes.length === 0) {
      return {
        keys: new Set(),
        unresolved: expanded.unresolved.length
          ? expanded.unresolved
          : [`cannot statically resolve \`${snippet(n)}\``],
      };
    }
    let result: KeyResult = { keys: new Set(), unresolved: [...expanded.unresolved] };
    for (const candidate of expanded.nodes) {
      if (candidate.node === n && candidate.file === file) {
        result.unresolved.push(`cannot statically resolve \`${snippet(n)}\``);
        continue;
      }
      result = mergeKeys(result, resolveHandlerKeys(candidate.node, candidate.file, depth + 1));
    }
    return result;
  }

  return { keys: new Set(), unresolved: [`cannot statically resolve \`${snippet(n)}\``] };
}

/* ─────────────────────────── registration discovery ──────────────────────── */

/**
 * THE ANNOTATIONS — the only escape from "unresolvable", and each one is still
 * checked against the manifest, so it buys the right to be verified, nothing
 * more.
 *
 *   // surface-write-handlers-surface: matrx-user/crm, matrx-user/crm-manager
 *       the surface name arrives as a PROP (one component, several mounts), so
 *       name the mounts. Each must be a real declared surface.
 *
 *   // surface-write-handlers: note_draft, rating_*
 *       part of the handler map is built dynamically. Name the targets that
 *       part covers; a trailing `*` credits a generated family (both halves
 *       derive from one source). Every name/pattern must match a declared
 *       target of the surface, or it is a finding. ADDITIVE: whatever the
 *       resolver CAN read is still credited, so a map that is only partly
 *       opaque never has to re-type its static keys into the comment.
 *
 *   // surface-write-handlers: pass-through
 *       this element only re-registers a map its CALLER owns (a generic list
 *       shell). It is credited with nothing; the caller's own registration is
 *       the site that gets checked.
 */
const ANNOTATION_RE = /surface-write-handlers:[ \t]*([a-z0-9_*,\- \t]+)/i;
const SURFACE_ANNOTATION_RE = /surface-write-handlers-surface:[ \t]*([a-z0-9_/,\- \t]+)/i;
const PASS_THROUGH = "pass-through";

export type Registration = {
  file: string;
  line: number;
  seam: "provider" | "hook" | "registration-object";
  surfaces: string[];
  surfaceUnresolved: string[];
  keys: Set<string>;
  keyUnresolved: string[];
  viaAnnotation: boolean;
  passThrough: boolean;
};

/** Comment text attached to (or on the line above) a registration site. */
function annotationText(sf: ts.SourceFile, node: ts.Node): string {
  const full = sf.getFullText();
  const leading = full.slice(node.getFullStart(), node.getStart(sf));
  const start = node.getStart(sf);
  const lineStart = full.lastIndexOf("\n", start - 1);
  const prevLineStart = full.lastIndexOf("\n", lineStart - 1);
  const prevLine = prevLineStart >= 0 ? full.slice(prevLineStart, lineStart) : "";
  // JSX attributes carry their comments inside the element, so also look at the
  // whole opening element when the node is one of its attributes.
  const owner = node.parent?.parent;
  const ownerText =
    owner && (ts.isJsxSelfClosingElement(owner) || ts.isJsxOpeningElement(owner))
      ? full.slice(owner.getFullStart(), owner.getEnd())
      : "";
  return [leading, prevLine, ownerText].join("\n");
}

function parseKeyAnnotation(text: string): { keys: string[]; passThrough: boolean } | null {
  const match = ANNOTATION_RE.exec(text);
  if (!match) return null;
  const parts = match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === PASS_THROUGH)) {
    return { keys: [], passThrough: true };
  }
  return parts.length > 0 ? { keys: parts, passThrough: false } : null;
}

function parseSurfaceAnnotation(text: string): string[] | null {
  const match = SURFACE_ANNOTATION_RE.exec(text);
  if (!match) return null;
  const names = match[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("/"));
  return names.length > 0 ? names : null;
}

/** Find the `surfaceName` attribute on the JSX element that owns this attribute. */
function surfaceFromJsxAttributes(
  attributes: ts.JsxAttributes,
  file: string,
): StringResult {
  for (const attr of attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText() === "surfaceName") {
      const init = attr.initializer;
      if (!init) return { values: [], unresolved: ["`surfaceName` has no value"] };
      if (ts.isStringLiteral(init)) return { values: [init.text], unresolved: [] };
      if (ts.isJsxExpression(init) && init.expression) {
        return resolveStringExpr(init.expression, file);
      }
      return { values: [], unresolved: ["`surfaceName` value is not resolvable"] };
    }
    if (ts.isJsxSpreadAttribute(attr)) {
      const obj = resolveObjectLiterals(attr.expression, file);
      for (const holder of obj.literals) {
        const literal = holder.node as ts.ObjectLiteralExpression;
        for (const prop of literal.properties) {
          if (ts.isPropertyAssignment(prop) && propName(prop.name, holder.file) === "surfaceName") {
            return resolveStringExpr(prop.initializer, holder.file);
          }
        }
      }
    }
  }
  return {
    values: [],
    unresolved: ["the element carrying `getWriteHandlers` declares no resolvable `surfaceName`"],
  };
}

export function scanFiles(files: string[]): Registration[] {
  const out: Registration[] = [];

  for (const file of files) {
    const sf = getSource(file);
    if (!sf) continue;

    /** Shared tail: annotations override, then the site is recorded. */
    const record = (
      node: ts.Node,
      seam: Registration["seam"],
      resolvedSurface: StringResult,
      resolveKeys: () => KeyResult,
    ): void => {
      const text = annotationText(sf, node);
      const keyAnnotation = parseKeyAnnotation(text);
      const surfaceAnnotation = parseSurfaceAnnotation(text);
      const surface: StringResult = surfaceAnnotation
        ? { values: surfaceAnnotation, unresolved: [] }
        : resolvedSurface;
      // A key annotation is ADDITIVE, never a replacement. A map is usually
      // only PARTLY opaque — `PerformanceReviewApp` writes sixteen keys out
      // literally and generates twenty-three more from `RATING_SCHEMA` — and a
      // replacing annotation would force whoever adds the one dynamic family to
      // re-type every static key beside it, which is exactly how an annotation
      // drifts from the code and starts lying. Resolution still contributes
      // everything it can read; the annotation only covers what it cannot.
      const resolvedKeys = keyAnnotation?.passThrough
        ? emptyKeys()
        : resolveKeys();
      const keys: KeyResult = keyAnnotation
        ? {
            keys: new Set([...resolvedKeys.keys, ...keyAnnotation.keys]),
            unresolved: [],
          }
        : resolvedKeys;
      out.push({
        file,
        line: lineOf(sf, node),
        seam,
        surfaces: surface.values,
        surfaceUnresolved: keyAnnotation?.passThrough ? [] : surface.unresolved,
        keys: keys.keys,
        keyUnresolved: keyAnnotation?.passThrough ? [] : keys.unresolved,
        viaAnnotation: Boolean(keyAnnotation || surfaceAnnotation),
        passThrough: Boolean(keyAnnotation?.passThrough),
      });
    };

    const visit = (node: ts.Node): void => {
      // Seam 1 — useSurfaceWriteHandlers(surfaceName, handlers)
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(unwrap(node.expression)) &&
        (unwrap(node.expression) as ts.Identifier).text === "useSurfaceWriteHandlers" &&
        node.arguments.length >= 2
      ) {
        record(node, "hook", resolveStringExpr(node.arguments[0], file), () =>
          resolveHandlerKeys(node.arguments[1], file),
        );
      }

      // Seam 2 — <SurfaceRuntimeProvider surfaceName={...} getWriteHandlers={...}>
      if (ts.isJsxAttribute(node) && node.name.getText() === "getWriteHandlers") {
        const attributes = node.parent as ts.JsxAttributes;
        const init = node.initializer;
        const expr =
          init && ts.isJsxExpression(init) && init.expression ? init.expression : null;
        record(node, "provider", surfaceFromJsxAttributes(attributes, file), () =>
          expr
            ? resolveHandlerKeys(expr, file)
            : { keys: new Set<string>(), unresolved: ["`getWriteHandlers` has no value"] },
        );
      }

      // Seam 3 — a DESCRIPTOR object that carries both halves:
      // `{ surfaceName, getScope, getWriteHandlers }`, either handed straight to
      // useSurfaceRuntimeRegistration / registerSurfaceRuntime, or handed to a
      // shell that mounts it (the `surface` of an `EntityListPage` config — the
      // canonical list shell; `features/agents/browse/surface.ts` and
      // `SitesPortfolio.tsx` both wire real targets this way, and before
      // 2026-09-11 this guard called both of them UNHANDLED).
      //
      // THE `surfaceName` MEMBER IS WHAT MAKES IT A SITE. A hook that RETURNS
      // `{ getScope, getWriteHandlers }` for its caller to mount (e.g.
      // `useAgentAdvancedEditorSurface`) names no surface, so it is still not a
      // registration — counting that would invent a site with no surface and
      // bury a real finding under noise. The caller's provider is the site, and
      // it resolves through the hook anyway.
      if (
        (ts.isPropertyAssignment(node) ||
          ts.isShorthandPropertyAssignment(node) ||
          ts.isMethodDeclaration(node)) &&
        node.name &&
        propName(node.name as ts.PropertyName, file) === "getWriteHandlers" &&
        ts.isObjectLiteralExpression(node.parent) &&
        (isSurfaceRegistrationArgument(node.parent) ||
          declaresSurfaceName(node.parent, file))
      ) {
        const objectLiteral = node.parent;
        let surface: StringResult = {
          values: [],
          unresolved: ["the object carrying `getWriteHandlers` declares no resolvable `surfaceName`"],
        };
        for (const prop of objectLiteral.properties) {
          if (ts.isPropertyAssignment(prop) && propName(prop.name, file) === "surfaceName") {
            surface = resolveStringExpr(prop.initializer, file);
          } else if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === "surfaceName") {
            surface = resolveStringExpr(prop.name, file);
          }
        }
        const valueNode = ts.isPropertyAssignment(node)
          ? node.initializer
          : ts.isShorthandPropertyAssignment(node)
            ? node.name
            : node;
        record(node, "registration-object", surface, () => resolveHandlerKeys(valueNode, file));
      }

      ts.forEachChild(node, visit);
    };

    visit(sf);
  }

  return out;
}

const REGISTRATION_CALLS = new Set([
  "useSurfaceRuntimeRegistration",
  "registerSurfaceRuntime",
]);

/**
 * Does this object literal declare a `surfaceName` member? That is what turns
 * `{ …, getWriteHandlers }` from an anonymous callback bag into a descriptor
 * that names the surface it mounts on.
 */
function declaresSurfaceName(literal: ts.ObjectLiteralExpression, file: string): boolean {
  return literal.properties.some(
    (prop) =>
      (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) &&
      propName(prop.name as ts.PropertyName, file) === "surfaceName",
  );
}

/** Is this object literal an argument to a surface-registration call? */
function isSurfaceRegistrationArgument(literal: ts.ObjectLiteralExpression): boolean {
  let current: ts.Node | undefined = literal.parent;
  for (let i = 0; current && i < 4; i += 1) {
    if (ts.isCallExpression(current)) {
      const callee = unwrap(current.expression);
      if (ts.isIdentifier(callee) && REGISTRATION_CALLS.has(callee.text)) return true;
      return false;
    }
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isConditionalExpression(current) ||
      ts.isSatisfiesExpression(current)
    ) {
      current = current.parent;
      continue;
    }
    return false;
  }
  return false;
}

/* ────────────────────────────────── report ───────────────────────────────── */

type DeclaredSurface = {
  surfaceName: string;
  targets: string[];
};

export type Findings = {
  unhandled: Array<{ surfaceName: string; targets: string[] }>;
  unresolvedRegistrations: Registration[];
  lyingAnnotations: Array<{ registration: Registration; why: string }>;
  handledCount: number;
  declaredCount: number;
};

/** Exact name, or a trailing-`*` family pattern. */
function matches(pattern: string, target: string): boolean {
  if (pattern.endsWith("*")) return target.startsWith(pattern.slice(0, -1));
  return pattern === target;
}

export function diff(declared: DeclaredSurface[], registrations: Registration[]): Findings {
  const declaredBySurface = new Map(declared.map((s) => [s.surfaceName, s.targets]));
  const handledBySurface = new Map<string, Set<string>>();
  const lyingAnnotations: Findings["lyingAnnotations"] = [];

  for (const reg of registrations) {
    if (reg.passThrough) continue;
    // An annotation that names a surface nobody declares, or a target the
    // surface does not have, is a finding — never a silent credit.
    if (reg.viaAnnotation) {
      for (const surfaceName of reg.surfaces) {
        if (!declaredBySurface.has(surfaceName)) {
          lyingAnnotations.push({
            registration: reg,
            why: `annotation names "${surfaceName}", which declares no write targets`,
          });
        }
      }
    }
    for (const surfaceName of reg.surfaces) {
      const targets = declaredBySurface.get(surfaceName) ?? [];
      const set = handledBySurface.get(surfaceName) ?? new Set<string>();
      for (const key of reg.keys) {
        const hits = targets.filter((t) => matches(key, t));
        for (const hit of hits) set.add(hit);
        if (hits.length === 0 && reg.viaAnnotation && declaredBySurface.has(surfaceName)) {
          lyingAnnotations.push({
            registration: reg,
            why: `annotation names "${key}", which is not a declared target of ${surfaceName}`,
          });
        }
      }
      handledBySurface.set(surfaceName, set);
    }
  }

  const unhandled: Findings["unhandled"] = [];
  let handledCount = 0;
  let declaredCount = 0;
  for (const surface of declared) {
    const handled = handledBySurface.get(surface.surfaceName) ?? new Set<string>();
    const missing = surface.targets.filter((t) => !handled.has(t));
    declaredCount += surface.targets.length;
    handledCount += surface.targets.length - missing.length;
    if (missing.length > 0) unhandled.push({ surfaceName: surface.surfaceName, targets: missing });
  }

  const unresolvedRegistrations = registrations.filter(
    (reg) => reg.surfaceUnresolved.length > 0 || reg.keyUnresolved.length > 0,
  );

  return { unhandled, unresolvedRegistrations, lyingAnnotations, handledCount, declaredCount };
}

async function loadDeclaredSurfaces(): Promise<DeclaredSurface[]> {
  const mod = await import(resolve(ROOT, "features/surfaces/manifests/registry"));
  const manifests = (mod.ALL_MANIFESTS ?? []) as ReadonlyArray<{
    surfaceName: string;
    writeTargets?: ReadonlyArray<{ name: string }>;
  }>;
  return manifests
    .filter((m) => (m.writeTargets?.length ?? 0) > 0)
    .map((m) => ({
      surfaceName: m.surfaceName,
      targets: (m.writeTargets ?? []).map((t) => t.name),
    }));
}

/* ───────────────────────────────── self-test ─────────────────────────────── */

function runSelfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "surface-write-handlers-selftest-"));
  let bad = 0;
  console.log("");
  console.log(`${C.bold}SELF-TEST — can this guard actually fail?${C.reset}`);
  try {
    // A fixture surface whose manifest declares three targets…
    const declared: DeclaredSurface[] = [
      {
        surfaceName: "matrx-selftest/fixture",
        targets: ["planted_handled", "planted_handled_indirect", "planted_unhandled"],
      },
    ];

    // …a page that wires two of them through the two realistic indirect shapes
    // (a named builder function + a shared spread), and forgets the third.
    const sharedFile = join(dir, "shared-handlers.ts");
    writeFileSync(
      sharedFile,
      [
        "export const sharedHandlers = {",
        "  planted_handled_indirect: (value: unknown) => void value,",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );

    const pageFile = join(dir, "planted-gap.tsx");
    writeFileSync(
      pageFile,
      [
        'import { sharedHandlers } from "./shared-handlers";',
        'const SURFACE = "matrx-selftest/fixture";',
        "function buildWriteHandlers() {",
        "  return { planted_handled: (value: unknown) => void value, ...sharedHandlers };",
        "}",
        "export function Page() {",
        "  return (",
        "    <SurfaceRuntimeProvider surfaceName={SURFACE} getWriteHandlers={buildWriteHandlers}>",
        "      <div />",
        "    </SurfaceRuntimeProvider>",
        "  );",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    // …and a page whose handler map cannot be resolved statically at all.
    const opaqueFile = join(dir, "planted-unresolvable.tsx");
    writeFileSync(
      opaqueFile,
      [
        "export function Opaque({ build }: { build: () => Record<string, () => void> }) {",
        "  return (",
        '    <SurfaceRuntimeProvider surfaceName="matrx-selftest/fixture" getWriteHandlers={build}>',
        "      <div />",
        "    </SurfaceRuntimeProvider>",
        "  );",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const registrations = scanFiles([pageFile, opaqueFile]);
    const findings = diff(declared, registrations);

    const gap = findings.unhandled.find((u) => u.surfaceName === "matrx-selftest/fixture");
    if (!gap || !gap.targets.includes("planted_unhandled")) {
      console.log(`  ${TAG.fail} the planted UNHANDLED target was not reported — the guard would go green over a real gap`);
      bad += 1;
    } else {
      console.log(`  ${TAG.ok} planted UNHANDLED target is caught: matrx-selftest/fixture → planted_unhandled`);
    }

    if (gap?.targets.includes("planted_handled")) {
      console.log(`  ${TAG.fail} a target wired through a named builder function was reported missing — the resolver is too weak to be trusted`);
      bad += 1;
    } else {
      console.log(`  ${TAG.ok} a target wired through a named builder function resolves (no false positive)`);
    }
    if (gap?.targets.includes("planted_handled_indirect")) {
      console.log(`  ${TAG.fail} a target wired through an imported spread was reported missing — cross-file resolution is broken`);
      bad += 1;
    } else {
      console.log(`  ${TAG.ok} a target wired through an imported spread resolves across files`);
    }

    const missed = findings.unresolvedRegistrations.find((r) => r.file.includes("planted-unresolvable"));
    if (!missed) {
      console.log(`  ${TAG.fail} the planted UNRESOLVABLE registration was NOT reported — the guard would credit a map it cannot read`);
      bad += 1;
    } else {
      console.log(`  ${TAG.ok} planted UNRESOLVABLE registration is caught: ${missed.keyUnresolved[0] ?? missed.surfaceUnresolved[0]}`);
    }

    // SEAM 3 — a DESCRIPTOR object (`{ surfaceName, getScope, getWriteHandlers }`)
    // handed to a list shell that mounts it, which is how the canonical
    // `EntityListPage` surfaces wire their write half. Before 2026-09-11 this
    // guard read only the provider prop and the hook, so it called two real,
    // correctly-wired surfaces (`matrx-user/agents`, `matrx-user/marketing`)
    // UNHANDLED — a false positive that would have been "fixed" by wiring a
    // second handler on top of a working one.
    const descriptorFile = join(dir, "planted-descriptor.ts");
    writeFileSync(
      descriptorFile,
      [
        'const DESCRIPTOR_TARGET = "planted_descriptor_target";',
        "export const listSurface = {",
        '  surfaceName: "matrx-selftest/fixture",',
        "  getScope: (list: unknown) => list,",
        "  getWriteHandlers: (list: unknown) => ({",
        "    [DESCRIPTOR_TARGET]: (value: unknown) => void [list, value],",
        "  }),",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );
    const descriptorFindings = diff(
      [{ surfaceName: "matrx-selftest/fixture", targets: ["planted_descriptor_target"] }],
      scanFiles([descriptorFile]),
    );
    if (
      descriptorFindings.unhandled.length > 0 ||
      descriptorFindings.unresolvedRegistrations.length > 0
    ) {
      console.log(
        `  ${TAG.fail} a surface wired through a { surfaceName, getWriteHandlers } DESCRIPTOR was reported unhandled — the guard is blind to the EntityListPage seam and would send agents to double-wire a working surface`,
      );
      bad += 1;
    } else {
      console.log(
        `  ${TAG.ok} a { surfaceName, getWriteHandlers } descriptor object counts as a registration (the EntityListPage seam)`,
      );
    }

    // …but a callback bag that names NO surface must still NOT be credited as a
    // registration — that is a hook's return value, and its caller is the site.
    const bagFile = join(dir, "planted-callback-bag.ts");
    writeFileSync(
      bagFile,
      [
        "export function useSomeSurface() {",
        "  return {",
        "    getScope: () => ({}),",
        "    getWriteHandlers: () => ({ planted_descriptor_target: () => {} }),",
        "  };",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    if (scanFiles([bagFile]).length > 0) {
      console.log(
        `  ${TAG.fail} a surfaceName-less callback bag was counted as a registration — every hook return would invent a site with no surface`,
      );
      bad += 1;
    } else {
      console.log(
        `  ${TAG.ok} a surfaceName-less callback bag is not counted as a registration (the caller's mount is the site)`,
      );
    }

    // A map ASSEMBLED BY ASSIGNMENT (`handlers.x = …`, often behind an `if`)
    // is how AgentRunnerPage and buildScraperWriteHandlers wire six live
    // targets. Reading only the literal's own members called all six unhandled.
    const assembledFile = join(dir, "planted-assembled.ts");
    writeFileSync(
      assembledFile,
      [
        "type H = (value: unknown) => void;",
        "const PLANTED_TARGETS = { a: \"planted_looped\" };",
        "export function buildHandlers(owns: boolean) {",
        "  const handlers: Record<string, H> = {",
        "    planted_literal: () => {},",
        "  };",
        "  if (owns) {",
        "    handlers.planted_assigned = () => {};",
        '    handlers["planted_indexed"] = () => {};',
        "  }",
        "  for (const name of Object.values(PLANTED_TARGETS)) {",
        "    handlers[name] = () => {};",
        "  }",
        "  return handlers;",
        "}",
        "export const registration = {",
        '  surfaceName: "matrx-selftest/fixture",',
        "  getWriteHandlers: () => buildHandlers(true),",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );
    const assembledFindings = diff(
      [
        {
          surfaceName: "matrx-selftest/fixture",
          targets: ["planted_literal", "planted_assigned", "planted_indexed", "planted_looped"],
        },
      ],
      scanFiles([assembledFile]),
    );
    if (assembledFindings.unhandled.length > 0) {
      console.log(
        `  ${TAG.fail} a handler map ASSEMBLED BY ASSIGNMENT lost its assigned keys (${assembledFindings.unhandled[0].targets.join(", ")}) — the resolver reads only the literal and would call live targets unhandled`,
      );
      bad += 1;
    } else {
      console.log(
        `  ${TAG.ok} a handler map assembled by \`handlers.x = …\` / \`handlers["x"] = …\` keeps its assigned keys`,
      );
    }

    // The annotation escape hatch must work AND still be checked.
    const annotatedFile = join(dir, "planted-annotated.tsx");
    writeFileSync(
      annotatedFile,
      [
        "export function Annotated({ build }: { build: () => Record<string, () => void> }) {",
        "  return (",
        '    <SurfaceRuntimeProvider surfaceName="matrx-selftest/fixture"',
        "      // surface-write-handlers: planted_unhandled",
        "      getWriteHandlers={build}>",
        "      <div />",
        "    </SurfaceRuntimeProvider>",
        "  );",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    const annotatedRegs = scanFiles([annotatedFile]);
    const annotatedFindings = diff(
      [{ surfaceName: "matrx-selftest/fixture", targets: ["planted_unhandled"] }],
      annotatedRegs,
    );
    if (annotatedFindings.unhandled.length > 0 || annotatedFindings.unresolvedRegistrations.length > 0) {
      console.log(`  ${TAG.fail} the annotation escape hatch did not credit an opaque registration — the only remedy left is deleting the guard`);
      bad += 1;
    } else {
      console.log(`  ${TAG.ok} the annotation escape hatch credits exactly the names it declares, and they are still diffed`);
    }

    // …and an annotation that lies (names a target the manifest does not have)
    // must NOT silence the real gap.
    const lyingFindings = diff(
      [{ surfaceName: "matrx-selftest/fixture", targets: ["some_other_target"] }],
      annotatedRegs,
    );
    if (lyingFindings.unhandled.length === 0) {
      console.log(`  ${TAG.fail} an annotation naming the WRONG target silenced a real gap`);
      bad += 1;
    } else {
      console.log(`  ${TAG.ok} an annotation naming the wrong target does not silence the real gap`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("");
  if (bad === 0) {
    console.log(
      `${TAG.ok} ${C.bold}${C.green}SELF-TEST PASSED — the guard catches a planted unhandled target AND a planted unresolvable registration, without false-positiving the indirect shapes it must follow.${C.reset}`,
    );
    console.log("");
    return 0;
  }
  console.log(`${TAG.fail} ${C.bold}${C.red}SELF-TEST FAILED — ${bad} proof(s) did not hold. This guard cannot be trusted.${C.reset}`);
  console.log("");
  return 3;
}

/* ─────────────────────────────────── main ────────────────────────────────── */

async function main(): Promise<number> {
  if (SELF_TEST) return runSelfTest();

  const declared = await loadDeclaredSurfaces();
  const files = seedFiles();
  const registrations = scanFiles(files);
  const findings = diff(declared, registrations);

  const surfacesWithRegistrations = new Set(registrations.flatMap((r) => r.surfaces));

  console.log("");
  console.log(`${C.bold}SURFACE WRITE-HANDLER GUARD${C.reset}`);
  console.log(
    `  ${TAG.info} ${findings.declaredCount} declared write targets across ${declared.length} manifests; ` +
      `${registrations.length} registrations resolved in ${files.length} scanned files ` +
      `(${surfacesWithRegistrations.size} distinct surfaces).`,
  );

  if (LIST_ONLY) {
    for (const reg of registrations.slice().sort((a, b) => a.file.localeCompare(b.file))) {
      console.log(
        `  ${displayPath(reg.file)}:${reg.line} [${reg.seam}] ${reg.surfaces.join(", ") || "<unresolved surface>"} → ` +
          `${[...reg.keys].sort().join(", ") || "<none>"}${reg.viaAnnotation ? " (annotation)" : ""}`,
      );
    }
    console.log("");
    return 0;
  }

  if (findings.unresolvedRegistrations.length > 0) {
    console.log("");
    console.log(
      `${C.bold}UNRESOLVED REGISTRATIONS — ${findings.unresolvedRegistrations.length}${C.reset} ` +
        `${C.dim}(a map this check cannot read is never credited as coverage)${C.reset}`,
    );
    for (const reg of findings.unresolvedRegistrations) {
      console.log(`  ${TAG.warn} ${displayPath(reg.file)}:${reg.line} [${reg.seam}]`);
      for (const why of [...reg.surfaceUnresolved, ...reg.keyUnresolved]) {
        console.log(`         ${C.dim}${why}${C.reset}`);
      }
    }
    console.log(
      `  ${C.dim}Remedy: resolve it statically, or annotate the registration with${C.reset}`,
    );
    console.log(`  ${C.dim}  // surface-write-handlers-surface: <client>/<surface>   (the name arrives as a prop)${C.reset}`);
    console.log(`  ${C.dim}  // surface-write-handlers: target_a, family_*          (the map is built dynamically)${C.reset}`);
    console.log(`  ${C.dim}  // surface-write-handlers: pass-through                (the caller owns the map)${C.reset}`);
  }

  if (findings.lyingAnnotations.length > 0) {
    console.log("");
    console.log(
      `${C.bold}${C.red}ANNOTATIONS THAT DO NOT MATCH THE MANIFEST — ${findings.lyingAnnotations.length}${C.reset}`,
    );
    for (const lie of findings.lyingAnnotations) {
      console.log(
        `  ${TAG.fail} ${displayPath(lie.registration.file)}:${lie.registration.line} — ${lie.why}`,
      );
    }
  }

  if (findings.unhandled.length > 0) {
    const total = findings.unhandled.reduce((n, u) => n + u.targets.length, 0);
    console.log("");
    console.log(
      `${C.bold}${C.red}DECLARED BUT UNHANDLED — ${total} target(s) on ${findings.unhandled.length} surface(s)${C.reset}`,
    );
    for (const gap of findings.unhandled.slice().sort((a, b) => a.surfaceName.localeCompare(b.surfaceName))) {
      console.log(`  ${TAG.fail} ${gap.surfaceName}`);
      console.log(`         ${gap.targets.join(", ")}`);
    }
    console.log(
      `  ${C.dim}Remedy: register the handler on the page's CANONICAL write path (the same${C.reset}`,
    );
    console.log(
      `  ${C.dim}action the user's own typing uses) — see .claude/skills/surface-write-targets/.${C.reset}`,
    );
    console.log(
      `  ${C.dim}A target that genuinely cannot be wired is listed in docs/handoffs/${C.reset}`,
    );
    console.log(
      `  ${C.dim}canonical-stream-and-surface-writeback.md under WP3. Never delete a declared target.${C.reset}`,
    );
  }

  console.log("");
  if (
    findings.unhandled.length === 0 &&
    findings.unresolvedRegistrations.length === 0 &&
    findings.lyingAnnotations.length === 0
  ) {
    console.log(
      `${TAG.ok} ${C.bold}${C.green}Every declared write target has a resolvable registered handler (${findings.handledCount}/${findings.declaredCount}).${C.reset}`,
    );
    console.log("");
    return 0;
  }
  console.log(
    `${TAG.warn} ${C.bold}${C.yellow}ADVISORY — ${findings.handledCount}/${findings.declaredCount} declared targets handled. Findings above are WORK ITEMS, not a brake.${C.reset}`,
  );
  console.log("");
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${TAG.fail} check-surface-write-handlers crashed:`, err);
    process.exit(3);
  });
