/**
 * The rich-content inventory engine: parse every source file with the
 * TypeScript compiler API, resolve every import through the repo's tsconfig
 * (aliases such as `@/` included), follow re-export chains, match the legacy
 * registry, and walk importers up to the surfaces that reach each site.
 *
 * Hermetic by design: all file reads go through a `SourceHost`, so the
 * self-test can plant a virtual file over the real tree without touching disk.
 */

import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  CONTENT_FIELD_NAMES,
  LEGACY_PIECES,
  type HeuristicRule,
  type LegacyPiece,
} from "./registry";

// ─── Host ─────────────────────────────────────────────────────────────────────

export interface SourceHost {
  root: string;
  /** Repo-relative, forward-slash paths of every scannable file. */
  files: string[];
  read(rel: string): string;
}

const SCAN_DIRS = [
  "app",
  "components",
  "features",
  "lib",
  "utils",
  "hooks",
  "providers",
  "actions",
  "constants",
  "types",
  "config",
];

const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/;
const NOT_PRODUCT =
  /(\.d\.ts$)|(\.(test|spec|stories)\.[tj]sx?$)|(\/__tests__\/)|(\/__mocks__\/)|(\/__fixtures__\/)|(\/__self_test_planted)/;

export function isScannable(rel: string): boolean {
  return SOURCE_EXT.test(rel) && !NOT_PRODUCT.test(rel) && SCAN_DIRS.includes(rel.split("/")[0]);
}

/** The real tree. `includeUntracked` adds new files not yet committed. */
export function repoHost(root: string, includeUntracked: boolean): SourceHost {
  const args = ["ls-files", "-z", "--cached"];
  if (includeUntracked) args.push("--others", "--exclude-standard");
  args.push("--", ...SCAN_DIRS);
  const listed = execFileSync("git", args, { cwd: root, maxBuffer: 1 << 28 })
    .toString()
    .split("\0")
    .filter(Boolean);
  const files = [...new Set(listed)]
    .filter(isScannable)
    .filter((f) => fs.existsSync(path.join(root, f)))
    .sort();
  return { root, files, read: (rel) => fs.readFileSync(path.join(root, rel), "utf8") };
}

// ─── Per-file facts ───────────────────────────────────────────────────────────

type EdgeKind = "static" | "dynamic" | "require" | "reexport" | "reexport-all";

interface ImportName {
  imported: string; // "default" | "*" | name
  local: string;
}

interface ImportEdge {
  spec: string;
  kind: EdgeKind;
  typeOnly: boolean;
  /** null = whole module (side effect, dynamic, require, namespace). */
  names: ImportName[] | null;
  line: number;
}

interface Finding {
  pieceId: string;
  line: number;
  snippet: string;
}

interface FileFacts {
  imports: ImportEdge[];
  /** Names this file declares and exports itself. */
  exports: Set<string>;
  /** Top-level declared names (exported or not) → line. */
  decls: Map<string, number>;
  /** jsx-attribute + heuristic findings. */
  findings: Finding[];
}

const FIELD_RE = new RegExp(`^(${CONTENT_FIELD_NAMES.join("|")})$`);
const FIELDISH_IDENT_RE = new RegExp(
  `^(${CONTENT_FIELD_NAMES.join("|")}|text|markdown)$|(Content|Text|Body|Markdown|Description|Prompt|Transcript|Reasoning)$`,
);
const TEXT_TAGS = new Set(["p", "pre", "span", "div", "li", "td", "blockquote", "small"]);
const PRE_WRAP_RE = /whitespace-pre-(wrap|line)/;

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function clip(text: string, n = 90): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

function unwrap(e: ts.Expression): ts.Expression {
  let cur = e;
  for (;;) {
    if (ts.isParenthesizedExpression(cur) || ts.isNonNullExpression(cur) || ts.isAsExpression(cur)) {
      cur = cur.expression;
    } else if (
      ts.isBinaryExpression(cur) &&
      (cur.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        cur.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      cur = cur.left;
    } else return cur;
  }
}

/** `x.content`, `x?.body`, `x["prompt"]` → the field name when it is a content field. */
function contentFieldOf(e: ts.Expression): string | null {
  const u = unwrap(e);
  if (ts.isPropertyAccessExpression(u)) return FIELD_RE.test(u.name.text) ? u.name.text : null;
  if (ts.isElementAccessExpression(u) && ts.isStringLiteral(u.argumentExpression)) {
    return FIELD_RE.test(u.argumentExpression.text) ? u.argumentExpression.text : null;
  }
  return null;
}

function fieldishOf(e: ts.Expression): string | null {
  const f = contentFieldOf(e);
  if (f) return f;
  const u = unwrap(e);
  if (ts.isIdentifier(u) && FIELDISH_IDENT_RE.test(u.text)) return u.text;
  return null;
}

function tagNameOf(el: ts.JsxElement): string | null {
  const t = el.openingElement.tagName;
  return ts.isIdentifier(t) ? t.text : null;
}

function containsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function isNewlineSplitArg(arg: ts.Expression | undefined): boolean {
  if (!arg) return false;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text.includes("\n");
  if (ts.isRegularExpressionLiteral(arg)) return arg.text.includes("\\n");
  return false;
}

/** `.split("\n")[.filter(..)|.slice(..)]*.map(cb → JSX)` */
function isSplitNewlineMap(call: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== "map") return false;
  const cb = call.arguments[0];
  if (!cb || !containsJsx(cb)) return false;
  let obj: ts.Expression = call.expression.expression;
  for (let hops = 0; hops < 4; hops++) {
    obj = unwrap(obj);
    if (!ts.isCallExpression(obj) || !ts.isPropertyAccessExpression(obj.expression)) return false;
    const m = obj.expression.name.text;
    if (m === "split") return isNewlineSplitArg(obj.arguments[0]);
    if (m !== "filter" && m !== "slice" && m !== "map" && m !== "trim") return false;
    obj = obj.expression.expression;
  }
  return false;
}

const HEURISTIC_PIECE: Record<HeuristicRule, string | undefined> = {
  "raw-field-render": LEGACY_PIECES.find(
    (p) => p.matcher.kind === "heuristic" && p.matcher.rule === "raw-field-render",
  )?.id,
  "split-newline-paragraphs": LEGACY_PIECES.find(
    (p) => p.matcher.kind === "heuristic" && p.matcher.rule === "split-newline-paragraphs",
  )?.id,
  "pre-wrap-field": LEGACY_PIECES.find(
    (p) => p.matcher.kind === "heuristic" && p.matcher.rule === "pre-wrap-field",
  )?.id,
};
const JSX_ATTR_PIECES = LEGACY_PIECES.filter((p) => p.matcher.kind === "jsx-attribute");

function scriptKind(rel: string): ts.ScriptKind {
  if (rel.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (rel.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (rel.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

export function parseFacts(rel: string, text: string): FileFacts {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, false, scriptKind(rel));
  const facts: FileFacts = { imports: [], exports: new Set(), decls: new Map(), findings: [] };
  const importLocals = new Map<string, { spec: string; imported: string; typeOnly: boolean }>();
  const isJsxFile = rel.endsWith(".tsx") || rel.endsWith(".jsx");
  const hasExport = (n: ts.Node): boolean =>
    ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const hasDefault = (n: ts.Node): boolean =>
    ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

  // Top-level statements: imports, exports, declarations.
  for (const st of sf.statements) {
    const line = lineOf(sf, st.getStart(sf));
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      const clause = st.importClause;
      const typeOnly = !!clause?.isTypeOnly;
      let names: ImportName[] | null = null;
      if (clause) {
        names = [];
        if (clause.name) names.push({ imported: "default", local: clause.name.text });
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) names = null;
        else if (nb && ts.isNamedImports(nb)) {
          for (const el of nb.elements) {
            names.push({ imported: (el.propertyName ?? el.name).text, local: el.name.text });
          }
        }
        for (const n of names ?? []) importLocals.set(n.local, { spec, imported: n.imported, typeOnly });
      }
      facts.imports.push({ spec, kind: "static", typeOnly, names, line });
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      const spec =
        st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      if (spec) {
        if (!st.exportClause) {
          facts.imports.push({ spec, kind: "reexport-all", typeOnly: st.isTypeOnly, names: null, line });
        } else if (ts.isNamespaceExport(st.exportClause)) {
          facts.imports.push({
            spec,
            kind: "reexport",
            typeOnly: st.isTypeOnly,
            names: [{ imported: "*", local: st.exportClause.name.text }],
            line,
          });
        } else {
          facts.imports.push({
            spec,
            kind: "reexport",
            typeOnly: st.isTypeOnly,
            names: st.exportClause.elements.map((el) => ({
              imported: (el.propertyName ?? el.name).text,
              local: el.name.text,
            })),
            line,
          });
        }
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          const localName = (el.propertyName ?? el.name).text;
          const via = importLocals.get(localName);
          if (via) {
            facts.imports.push({
              spec: via.spec,
              kind: "reexport",
              typeOnly: via.typeOnly || st.isTypeOnly,
              names: [{ imported: via.imported, local: el.name.text }],
              line,
            });
          } else facts.exports.add(el.name.text);
        }
      }
      continue;
    }
    if (ts.isExportAssignment(st)) {
      facts.exports.add("default");
      continue;
    }
    const declare = (name: string): void => {
      if (!facts.decls.has(name)) facts.decls.set(name, line);
      if (hasExport(st)) facts.exports.add(hasDefault(st) ? "default" : name);
    };
    if (
      (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) &&
      st.name
    ) {
      declare(st.name.text);
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && hasDefault(st)) {
      facts.exports.add("default");
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) declare(d.name.text);
    } else if (
      ts.isInterfaceDeclaration(st) ||
      ts.isTypeAliasDeclaration(st) ||
      ts.isEnumDeclaration(st)
    ) {
      if (hasExport(st)) facts.exports.add(st.name.text);
    }
  }

  // Deep walk: dynamic imports, require, JSX findings.
  const seenFinding = new Set<string>();
  const addFinding = (pieceId: string | undefined, node: ts.Node, snippet: string): void => {
    if (!pieceId) return;
    const line = lineOf(sf, node.getStart(sf));
    const key = `${line}`;
    // One finding per line across the three raw-render heuristics.
    if (pieceId.startsWith("raw:")) {
      if (seenFinding.has(key)) return;
      seenFinding.add(key);
    }
    facts.findings.push({ pieceId, line, snippet: clip(snippet) });
  };

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const a0 = n.arguments[0];
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword && a0 && ts.isStringLiteralLike(a0)) {
        facts.imports.push({ spec: a0.text, kind: "dynamic", typeOnly: false, names: null, line: lineOf(sf, n.getStart(sf)) });
      } else if (
        ts.isIdentifier(n.expression) &&
        n.expression.text === "require" &&
        a0 &&
        ts.isStringLiteralLike(a0)
      ) {
        facts.imports.push({ spec: a0.text, kind: "require", typeOnly: false, names: null, line: lineOf(sf, n.getStart(sf)) });
      } else if (isJsxFile && isSplitNewlineMap(n)) {
        addFinding(HEURISTIC_PIECE["split-newline-paragraphs"], n, n.getText(sf));
      }
    }
    if (isJsxFile) {
      if (ts.isJsxAttribute(n) && ts.isIdentifier(n.name)) {
        for (const p of JSX_ATTR_PIECES) {
          if (p.matcher.kind === "jsx-attribute" && n.name.text === p.matcher.name) {
            addFinding(p.id, n, n.getText(sf));
          }
        }
      }
      if (ts.isJsxElement(n)) {
        const tag = tagNameOf(n);
        const classAttr = n.openingElement.attributes.properties.find(
          (a) => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === "className",
        );
        const preWrap = !!classAttr && PRE_WRAP_RE.test(classAttr.getText(sf));
        for (const child of n.children) {
          if (!ts.isJsxExpression(child) || !child.expression) continue;
          if (preWrap && fieldishOf(child.expression)) {
            addFinding(HEURISTIC_PIECE["pre-wrap-field"], child, `<${tag ?? "…"} pre-wrap>${child.getText(sf)}`);
          } else if (tag && TEXT_TAGS.has(tag) && contentFieldOf(child.expression)) {
            addFinding(HEURISTIC_PIECE["raw-field-render"], child, `<${tag}>${child.getText(sf)}`);
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return facts;
}

// ─── Resolution ───────────────────────────────────────────────────────────────

function loadCompilerOptions(root: string): ts.CompilerOptions {
  const cfgPath = path.join(root, "tsconfig.json");
  const read = ts.readConfigFile(cfgPath, ts.sys.readFile);
  if (read.error) throw new Error(`cannot read tsconfig.json: ${ts.flattenDiagnosticMessageText(read.error.messageText, "\n")}`);
  const parsed = ts.parseJsonConfigFileContent(
    { compilerOptions: read.config.compilerOptions ?? {} },
    ts.sys,
    root,
  );
  return { ...parsed.options, allowJs: true, resolveJsonModule: true };
}

function isLocalSpec(spec: string, options: ts.CompilerOptions): boolean {
  if (spec.startsWith(".") || spec.startsWith("/")) return true;
  const paths = options.paths ?? {};
  return Object.keys(paths).some((k) => {
    const prefix = k.endsWith("*") ? k.slice(0, -1) : k;
    return prefix.length > 1 && spec.startsWith(prefix);
  });
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export interface Site {
  pieceId: string;
  file: string;
  line: number;
  /** How it matched: import spec, "definition", or heuristic snippet. */
  detail: string;
  typeOnly?: boolean;
  /** Barrel the import travelled through, when not the origin file. */
  via?: string;
}

export interface Analysis {
  host: SourceHost;
  facts: Map<string, FileFacts>;
  /** file → resolved local imports (runtime edges only), with kind. */
  edges: Map<string, { target: string; kind: EdgeKind }[]>;
  sites: Site[];
  unresolved: { file: string; spec: string }[];
}

const factsCache = new Map<string, { text: string; facts: FileFacts }>();

export function analyze(host: SourceHost): Analysis {
  const options = loadCompilerOptions(host.root);
  const fileSet = new Set(host.files);
  const abs = (rel: string): string => path.join(host.root, rel);
  const relOf = (a: string): string => path.relative(host.root, a).split(path.sep).join("/");
  const dirSet = new Set<string>();
  for (const f of host.files) {
    let d = path.dirname(f);
    while (d && d !== "." && !dirSet.has(d)) {
      dirSet.add(d);
      d = path.dirname(d);
    }
  }
  const resolutionHost: ts.ModuleResolutionHost = {
    fileExists: (a) => fileSet.has(relOf(a)) || ts.sys.fileExists(a),
    readFile: (a) => (fileSet.has(relOf(a)) ? host.read(relOf(a)) : ts.sys.readFile(a)),
    directoryExists: (a) => dirSet.has(relOf(a)) || ts.sys.directoryExists!(a),
    realpath: (a) => a,
    getCurrentDirectory: () => host.root,
  };
  const cache = ts.createModuleResolutionCache(host.root, (s) => s, options);
  const resolveMemo = new Map<string, string | null>();
  const resolve = (spec: string, from: string): string | null => {
    const key = spec.startsWith(".") ? `${path.dirname(from)}|${spec}` : spec;
    const hit = resolveMemo.get(key);
    if (hit !== undefined) return hit;
    const r = ts.resolveModuleName(spec, abs(from), options, resolutionHost, cache).resolvedModule;
    const rel = r ? relOf(r.resolvedFileName) : null;
    const out = rel && fileSet.has(rel) ? rel : rel && !rel.startsWith("..") ? rel : null;
    resolveMemo.set(key, out);
    return out;
  };

  const facts = new Map<string, FileFacts>();
  for (const f of host.files) {
    const text = host.read(f);
    const c = factsCache.get(f);
    if (c && c.text === text) facts.set(f, c.facts);
    else {
      const ff = parseFacts(f, text);
      factsCache.set(f, { text, facts: ff });
      facts.set(f, ff);
    }
  }

  // Resolve every local edge once.
  const resolved = new Map<string, (string | null)[]>();
  const edges = new Map<string, { target: string; kind: EdgeKind }[]>();
  const unresolved: { file: string; spec: string }[] = [];
  for (const [f, ff] of facts) {
    const r = ff.imports.map((e) => {
      if (!isLocalSpec(e.spec, options)) return null;
      const t = resolve(e.spec, f);
      if (!t) unresolved.push({ file: f, spec: e.spec });
      return t;
    });
    resolved.set(f, r);
    edges.set(
      f,
      ff.imports.flatMap((e, i) => {
        const t = r[i];
        return t && facts.has(t) && !e.typeOnly ? [{ target: t, kind: e.kind }] : [];
      }),
    );
  }

  // Follow a name through re-export chains to its declaring file.
  const originMemo = new Map<string, string | null>();
  const originOf = (file: string, name: string, seen = new Set<string>()): string | null => {
    const key = `${file}#${name}`;
    const m = originMemo.get(key);
    if (m !== undefined) return m;
    if (seen.has(key)) return null;
    seen.add(key);
    const ff = facts.get(file);
    let out: string | null = null;
    if (!ff) out = null;
    else if (name === "*" || ff.exports.has(name)) out = file;
    else {
      const r = resolved.get(file)!;
      for (let i = 0; i < ff.imports.length && !out; i++) {
        const e = ff.imports[i];
        const t = r[i];
        if (!t) continue;
        if (e.kind === "reexport" && e.names) {
          const hit = e.names.find((n) => n.local === name);
          if (hit) out = hit.imported === "*" ? t : originOf(t, hit.imported, seen);
        } else if (e.kind === "reexport-all" && name !== "default") {
          out = originOf(t, name, seen);
        }
      }
    }
    originMemo.set(key, out);
    return out;
  };

  // Symbol pieces: declaring files per name.
  const symbolDefiners = new Map<string, Set<string>>();
  for (const p of LEGACY_PIECES) {
    if (p.matcher.kind !== "symbol") continue;
    for (const name of p.matcher.names) {
      const s = new Set<string>();
      for (const [f, ff] of facts) if (ff.decls.has(name)) s.add(f);
      symbolDefiners.set(name, s);
    }
  }

  const sites: Site[] = [];
  const pkgPieces = LEGACY_PIECES.filter((p) => p.matcher.kind === "package").map((p) => ({
    p,
    re: new RegExp((p.matcher as { pattern: string }).pattern),
  }));
  const modulePieces = LEGACY_PIECES.filter((p) => p.matcher.kind === "module").map((p) => ({
    p,
    files: new Set((p.matcher as { files: string[] }).files),
  }));
  const symbolPieces = LEGACY_PIECES.filter((p) => p.matcher.kind === "symbol");
  const allowed = (p: LegacyPiece, f: string): boolean => !!p.allowedFiles?.includes(f);

  for (const [f, ff] of facts) {
    const r = resolved.get(f)!;
    const seenHere = new Set<string>();
    const push = (s: Site): void => {
      const k = `${s.pieceId}|${s.line}|${s.detail}`;
      if (seenHere.has(k)) return;
      seenHere.add(k);
      sites.push(s);
    };
    ff.imports.forEach((e, i) => {
      const t = r[i];
      if (!t) {
        for (const { p, re } of pkgPieces) {
          if (!isLocalSpec(e.spec, options) && re.test(e.spec) && !allowed(p, f)) {
            push({ pieceId: p.id, file: f, line: e.line, detail: e.spec, typeOnly: e.typeOnly || undefined });
          }
        }
        return;
      }
      // Which origin files does this edge bring in?
      const origins = new Map<string, string | undefined>(); // origin → via
      if (e.names === null || e.kind === "reexport-all") origins.set(t, undefined);
      else {
        for (const n of e.names) {
          const o = originOf(t, n.imported);
          if (o) origins.set(o, o === t ? undefined : t);
          else origins.set(t, undefined);
        }
      }
      for (const { p, files } of modulePieces) {
        if (allowed(p, f) || files.has(f)) continue;
        for (const [o, via] of origins) {
          if (files.has(o)) push({ pieceId: p.id, file: f, line: e.line, detail: e.spec, typeOnly: e.typeOnly || undefined, via });
        }
      }
      for (const p of symbolPieces) {
        if (p.matcher.kind !== "symbol" || allowed(p, f) || !e.names) continue;
        for (const n of e.names) {
          if (!p.matcher.names.includes(n.imported)) continue;
          const o = originOf(t, n.imported);
          if (o && symbolDefiners.get(n.imported)?.has(o)) {
            push({ pieceId: p.id, file: f, line: e.line, detail: `${n.imported} ← ${e.spec}`, typeOnly: e.typeOnly || undefined, via: o === t ? undefined : t });
          }
        }
      }
    });
    for (const p of symbolPieces) {
      if (p.matcher.kind !== "symbol" || allowed(p, f)) continue;
      for (const name of p.matcher.names) {
        const line = ff.decls.get(name);
        if (line !== undefined) push({ pieceId: p.id, file: f, line, detail: `definition of ${name}` });
      }
    }
    for (const fd of ff.findings) push({ pieceId: fd.pieceId, file: f, line: fd.line, detail: fd.snippet });
  }

  sites.sort((a, b) => a.pieceId.localeCompare(b.pieceId) || a.file.localeCompare(b.file) || a.line - b.line);
  return { host, facts, edges, sites, unresolved };
}

// ─── Surfaces ─────────────────────────────────────────────────────────────────

export const OVERLAY_CONTROLLER = "features/overlays/OverlayController.tsx";
const WINDOW_REGISTRY = "features/window-panels/registry/windowRegistryMetadata.ts";
const ROUTE_FILE = /^app\/(.*\/)?(page|layout|template|default|not-found|error|global-error|loading)\.(tsx|ts|jsx|js)$/;
const API_FILE = /^app\/(.*\/)?route\.(ts|js)$/;
const OPENER_FILE = /^features\/overlays\/openers\/[^/]+\.tsx?$/;

function routeUrl(rel: string): string {
  const segs = rel.split("/").slice(1, -1).filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return `/${segs.join("/")}`;
}

export function rootSurfaceOf(rel: string): string | null {
  const m = ROUTE_FILE.exec(rel);
  if (m) {
    const kind = m[2];
    const url = routeUrl(rel);
    return kind === "page" ? `route ${url}` : `${kind} ${url}`;
  }
  if (API_FILE.test(rel)) return `api ${routeUrl(rel)}`;
  if (OPENER_FILE.test(rel)) return `opener ${path.basename(rel).replace(/\.tsx?$/, "")}`;
  return null;
}

/** OverlayController lazy imports: target file → "overlay <overlayId> (label)". */
function overlaySurfaceMap(a: Analysis): Map<string, string> {
  const out = new Map<string, string>();
  if (!a.facts.has(OVERLAY_CONTROLLER)) return out;
  const text = a.host.read(OVERLAY_CONTROLLER);
  const lines = text.split("\n");
  const labels = new Map<string, string>();
  if (a.facts.has(WINDOW_REGISTRY)) {
    const reg = a.host.read(WINDOW_REGISTRY);
    const re = /overlayId:\s*"([^"]+)"[\s\S]{0,200}?label:\s*"([^"]+)"/g;
    for (let m = re.exec(reg); m; m = re.exec(reg)) labels.set(m[1], m[2]);
  }
  const sf = ts.createSourceFile(OVERLAY_CONTROLLER, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const findImport = (n: ts.Node): string | null => {
    let spec: string | null = null;
    const v = (x: ts.Node): void => {
      if (spec) return;
      if (ts.isCallExpression(x) && x.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const a0 = x.arguments[0];
        if (a0 && ts.isStringLiteralLike(a0)) spec = a0.text;
      }
      ts.forEachChild(x, v);
    };
    v(n);
    return spec;
  };
  const options = loadCompilerOptions(a.host.root);
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const spec = findImport(d.initializer);
      if (!spec) continue;
      const r = ts.resolveModuleName(spec, path.join(a.host.root, OVERLAY_CONTROLLER), options, ts.sys).resolvedModule;
      if (!r) continue;
      const target = path.relative(a.host.root, r.resolvedFileName).split(path.sep).join("/");
      const name = d.name.text;
      // overlayId: the nearest `isOpenById.<id>` above the component's first JSX use.
      let overlayId: string | null = null;
      const useIdx = lines.findIndex((l) => l.includes(`<${name}`) && !l.includes(`<${name}.`));
      if (useIdx >= 0) {
        for (let i = useIdx; i >= Math.max(0, useIdx - 25) && !overlayId; i--) {
          const m = /isOpenById\.(\w+)|isOpenById\[\s*"([^"]+)"\s*\]|\{\/\*\s*(\w+)\s*\*\/\}/.exec(lines[i]);
          if (m) overlayId = m[1] ?? m[2] ?? m[3] ?? null;
        }
      }
      const id = overlayId ?? name.charAt(0).toLowerCase() + name.slice(1);
      const label = labels.get(id);
      const surface = `overlay ${id}${label ? ` (${label})` : ""}`;
      const prev = out.get(target);
      out.set(target, prev && prev !== surface ? `${prev} · ${surface}` : surface);
    }
  }
  return out;
}

/** For each requested file, the surfaces (routes, overlays, openers) that reach it. */
export function surfacesFor(a: Analysis, files: Iterable<string>): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();
  for (const [f, es] of a.edges) {
    for (const e of es) {
      if (!reverse.has(e.target)) reverse.set(e.target, new Set());
      reverse.get(e.target)!.add(f);
    }
  }
  const overlays = overlaySurfaceMap(a);
  const memo = new Map<string, Set<string>>();
  const out = new Map<string, Set<string>>();
  for (const start of files) {
    if (memo.has(start)) {
      out.set(start, memo.get(start)!);
      continue;
    }
    const found = new Set<string>();
    const seen = new Set<string>([start]);
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      const root = rootSurfaceOf(cur);
      if (root) {
        found.add(root);
        continue;
      }
      if (cur === OVERLAY_CONTROLLER) continue;
      for (const imp of reverse.get(cur) ?? []) {
        if (imp === OVERLAY_CONTROLLER) {
          found.add(overlays.get(cur) ?? "overlay (OverlayController, static)");
          continue;
        }
        if (!seen.has(imp)) {
          seen.add(imp);
          queue.push(imp);
        }
      }
    }
    memo.set(start, found);
    out.set(start, found);
  }
  return out;
}
