/**
 * check:no-active-org-in-reads — THE ACTIVE ORGANIZATION IS NEVER A LIST FILTER.
 * Law (Arman, 2026-09-30): common-docs/policies/access-ladder.md.
 *
 * THE DEFECT THAT OPENED THE CLASS (lane ORG-FILTER-CLASS). The agent builder's "Fill
 * automatically → From my data" table picker listed the tables of a records provider bound to the
 * ACTIVE organization — one organization's tables, silently — while the data home lists every table
 * the person can see across all her organizations.
 *
 * THE RULE. Reads ignore the active organization: no list, search, count, picker, sidebar,
 * dashboard or record page narrows by it — not by default, not "for now", not with a label. A page
 * that offers an organization filter uses the shell's control (`EntityOrgFilter`, URL
 * `?org_filter=`, default All organizations, passed as `p_org_id`). The active organization is only
 * for writes and server calls, and each such read says so on its line:
 *   - `write-target`    the organization a create / save / upload / run writes into;
 *   - `server-call`     the organization an API or server call runs in;
 *   - `default-for-new` pre-selecting where a "Create" puts the new thing.
 *
 * WHAT IS SCANNED. Every tracked .ts/.tsx under app/ features/ components/ lib/ hooks/ providers/
 * utils/ packages/ (tests excluded). TypeScript AST, two rules:
 *
 * ACTIVE-ORGANIZATION SOURCES (every way to read it): useOrganizationRequired, useActiveOrganizationId,
 * useServerOrganizationId, getActiveOrgId / getSelectedOrgId / requireSelectedOrgId,
 * readActiveOrganizationId / readActiveOrganizationForIdentity, awaitEffectiveOrganizationId,
 * `ensureOrgId()` called with undefined / null / nothing (an explicit record org is NOT a source), the selectors selectOrganizationId /
 * selectActiveOrganizationId / selectEffectiveOrganizationId, a hand-read `state.appContext` /
 * `appContext.organization_id`, the shared cookie (`activeOrgCookie.read(...)`), and — across files —
 * any wrapper hook/selector named with the use, get, select, read, resolve, current, active, or
 * require prefixes whose body reads one of those, wherever it is defined (a hook reading it in one
 * file and a page listing in another is the same read).
 *
 *  RULE 1 (file level, legacy). A file that reads a source AND lists (useTables / list*() / use*List() /
 *  fetch*s() / rpc('list_…') / .from().select( / <RecordsProvider / RecordsMount): every source line must
 *  carry the annotation below.
 *  RULE 2 (call site, 2026-09-30). Inside one function, a value derived from a source (the variable it
 *  was assigned to, and anything assigned from that) that reaches a READ CALL — .select() / .rpc() (any
 *  name) / .eq .in .match .or .filter (unless the chain writes) / useQuery / a `queryKey` / fetch or
 *  callApi (unless POST/PUT/PATCH/DELETE) / list* fetch* load* search* query* count* / use*List /
 *  <RecordsProvider> — is a read of the active organization UNLESS THAT EXACT CALL is annotated. The
 *  annotation is per call site, never per variable: a note where the organization is first read
 *  covers nothing after it. (An rpc whose name starts with a write verb — create_ update_ … — and a
 *  write chain — .insert/.update/.upsert/.delete(…).eq(…) — are writes, not reads.)
 *
 * WHAT PASSES. Every flagged line carries, on its line or in the comment block directly above,
 *     // org-filter: <write-target|server-call|default-for-new> <reason of 12+ characters>
 * A reasonless or unknown-class annotation fails (there is no "visible" class: a label does not
 * make an active-organization read of a list legal).
 *
 * THE BASELINE (`scripts/no-active-org-in-reads-baseline.json`, `sites`) holds what is not fixed yet,
 * ONE ROW PER CALL SITE — key `<file>::<enclosing function>::<the call expression>#<n>` — each with
 * its census class and owner. It only SHRINKS: a row whose call site no longer trips the guard fails
 * until removed, and a NEW read anywhere (including inside an already-baselined file) fails. Line
 * numbers are not part of the key. (2026-09-30: it used to forgive whole files.)
 *
 * `--self-test` proves both directions on planted fixtures. `--list` prints every offender.
 */

import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ts from "typescript";

import { REPO_ROOT, repoFiles } from "./lib/repo-files";

const BASELINE = "scripts/no-active-org-in-reads-baseline.json";

/**
 * Every directory of application code. (2026-09-30: providers/ utils/ packages/ joined — a hook or provider there reads the active organization exactly like a feature does.)
 * (2026-10-07, lane I: the Applet data path joined — @ai-matrx/applets, entity-data and records are where
 * an Applet's reads are built, so an active-organization read there narrows every Applet at once. The
 * `../aidream/…` directories are a SIBLING checkout: listed through that checkout's own git, and when it
 * is absent (CI without the aidream checkout) the run says UNMEASURED for them by name — never green.)
 */
export const SCAN_DIRS = [
  "app",
  "features",
  "../aidream/apps/shared/chat/src",
  "../aidream/apps/shared/applets/src",
  "../aidream/apps/shared/entity-data/src",
  "../aidream/apps/shared/records/src",
  "components",
  "lib",
  "hooks",
  "providers",
  "utils",
  "packages",
] as const;

/** The scanned directories that live in a sibling checkout (`../<repo>/…`). */
export const SIBLING_DIRS = SCAN_DIRS.filter((d) => d.startsWith("../"));

/** Calls that RETURN the active organization (or the whole gate that carries it). */
const SOURCE_CALLS = new Set([
  "useOrganizationRequired",
  "useActiveOrganizationId",
  "useServerOrganizationId",
  "getActiveOrgId",
  "getSelectedOrgId",
  "requireSelectedOrgId",
  "readActiveOrganizationId",
  "readActiveOrganizationForIdentity",
  "readActiveOrgCookie",
  // 2026-09-30: resolves to the active organization once boot answers (features/organizations/awaitWorkspace.ts).
  "awaitEffectiveOrganizationId",
]);
/**
 * `ensureOrgId(undefined | null | nothing)` is the funnel's way of saying "the ACTIVE organization, or ask
 * the person": it RETURNS the active org. `ensureOrgId(<a record's own organization>)` returns that record's
 * org — not a source. (2026-09-30: was invisible to the guard.)
 */
function isActiveEnsureOrgId(call: ts.CallExpression): boolean {
  if (calleeName(call) !== "ensureOrgId") return false;
  const a = call.arguments[0];
  if (!a) return true;
  return a.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(a) && a.text === "undefined");
}
/** Selectors that return it. */
const SOURCE_IDENTS = new Set(["selectOrganizationId", "selectActiveOrganizationId", "selectEffectiveOrganizationId"]);
/** `activeOrgCookie.read(userId)` and friends: the shared cookie IS the remembered active organization. */
const COOKIE_OBJECT = /^(activeOrg\w*Cookie|\w*ActiveOrgCookie)$/;
/**
 * THE PACKAGE SHAPE (2026-10-07). A shared package has no Redux and no cookie: the host hands it the
 * active organization as an option or a getter named for it — `opts.activeOrganizationId`,
 * `viewer.activeOrganizationId`, `options.activeOrganizationId()`, a destructured `activeOrganizationId`
 * prop, or entity-data's `activeOrganization()` helper. Each IS the active organization.
 */
const ACTIVE_ORG_NAME = "activeOrganizationId";
const ACTIVE_ORG_CALLS = new Set(["activeOrganization"]);
/** Where the package shape is read: the shared packages' source (a sibling checkout), and the self-test's planted copy of it. */
const PACKAGE_SOURCE = /^(\.\.\/aidream\/apps\/shared|packages-shared)\//;
/** Redux `appContext.organization_id` read by hand. */
const APP_CONTEXT = "appContext";
const ORG_PROP = /^(organization_id|organizationId)$/;

/** File-level rule (legacy, kept): a file that reads the active org AND lists things anywhere. */
const LIST_READS: readonly RegExp[] = [
  /\buseTables\s*\(/,
  /\.tableList\s*\(/,
  /\blist[A-Z]\w*\s*\(/,
  /\buse\w+List\s*\(/,
  /\bfetch\w+s\s*\(/,
  /\.rpc\(\s*["'`]list_/,
  /\.from\([^)]*\)\s*\.select\(/,
  /<RecordsProvider\b/,
  /\bRecordsMount\b/,
];

/** Call-site rule: callee names that READ. */
const READ_CALLEES = new Set(["useQuery", "useInfiniteQuery", "useSuspenseQuery", "useQueries", "fetchQuery", "fetch", "callApi"]);
/** Method calls (`x.select(…)`) that read — bare `select(…)` is somebody's local function, never a query. */
const READ_METHODS = new Set(["select", "rpc", "eq", "in", "match", "or", "neq", "filter"]);
const READ_CALLEE_SHAPE = /^(list|fetch|load|search|count)[A-Z_]\w*$|^query(?!Selector)[A-Z_]\w*$|^use\w*(List|Query|Tables|Records|Search)$/;
/** The store doors' read verbs as package clients name them (`client.list`, `port.columns`, `client.tableRead`, `client.readRecords`). Method calls only, in package source only. */
const READ_METHOD_SHAPE = /^(list|search|count|columns|get)$|^\w+Read$|^read[A-Z]\w*$/;
/** Filter methods that also appear on writes (`.update(x).eq("organization_id", org)`): read only when no write verb is in the chain. */
const FILTER_CALLEES = new Set(["eq", "in", "match", "or", "filter", "neq", "select"]);
const WRITE_VERBS = new Set(["insert", "update", "upsert", "delete"]);
/** An rpc whose name starts with a write verb carries the active org as a write/server-call target. */
const WRITE_RPC = /^(create|update|delete|insert|upsert|set|save|archive|restore|add|remove|grant|revoke|invite|accept|transfer|submit|start|run|send|enqueue|record|log|register|mark|apply|rename|move|copy|duplicate|publish|unpublish|claim|release)_/;
/** …and one whose name ENDS in one (library_subscribe, library_unsubscribe). */
const WRITE_RPC_SUFFIX = /_(subscribe|unsubscribe|create|update|delete|archive|restore|grant|revoke|set|save|add|remove)$/;
const WRITE_METHOD = /method\s*:\s*["'`](POST|PUT|PATCH|DELETE)/;
const READ_TAGS = new Set(["RecordsProvider", "RecordsMount"]);

const ANNOTATION = /\/\/\s*org-filter:\s*(\S+)\s*(.*)$/;
const CLASSES = new Set(["write-target", "server-call", "default-for-new"]);

export interface Finding {
  file: string;
  line: number;
  text: string;
  why: string;
  /**
   * The baseline key of THIS call site: `<file>::<enclosing function>::<the call expression>#<n>` (n = its
   * order among identical ones in the file). Line numbers are never part of it, so moving code does not
   * re-open a row; a NEW read in an already-baselined file has a key no row carries and fails.
   */
  key: string;
}

export interface BaselineEntry {
  /** Census class: silent-filter (defect) · write-target · visible · default-for-new. */
  class: string;
  owner: string;
  note: string;
}

/** Comments blanked (offsets kept), so prose naming a selector is never a read. */
function codeOf(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function calleeName(call: ts.CallExpression): string {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return "";
}

function isDeclarationName(node: ts.Identifier): boolean {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return true;
  if ((ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isBindingElement(p) || ts.isParameter(p)) && p.name === node) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  return false;
}

/** Does this node itself READ the active organization? `derived` = names of wrapper hooks/selectors found in other files. */
function isSource(node: ts.Node, derived: ReadonlySet<string>, pkg = false): boolean {
  if (ts.isCallExpression(node)) {
    const n = calleeName(node);
    if (SOURCE_CALLS.has(n) || derived.has(n) || isActiveEnsureOrgId(node)) return true;
    // `activeOrganization()` / `options.activeOrganizationId()` — the getter forms of the package shape.
    if (pkg && (ACTIVE_ORG_CALLS.has(n) || n === ACTIVE_ORG_NAME)) return true;
    const e = node.expression;
    if (ts.isPropertyAccessExpression(e) && /^(read|get)$/.test(e.name.text) && ts.isIdentifier(e.expression) && COOKIE_OBJECT.test(e.expression.text)) {
      return true;
    }
    return false;
  }
  if (ts.isIdentifier(node)) {
    if (isDeclarationName(node)) return false;
    // A destructured `activeOrganizationId` prop/option read as a value (never the key of an object literal or a property name).
    if (pkg && node.text === ACTIVE_ORG_NAME) {
      const p = node.parent;
      if (ts.isPropertyAccessExpression(p) && p.name === node) return false; // matched at the PropertyAccessExpression
      if (ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodSignature(p)) return false;
      if (ts.isCallExpression(p) && p.expression === node) return false; // matched at the CallExpression
      return true;
    }
    if (SOURCE_IDENTS.has(node.text) || derived.has(node.text)) {
      // a call `derived()` is matched at the CallExpression; a bare reference is a selector passed along
      return !(ts.isCallExpression(node.parent) && node.parent.expression === node) || SOURCE_IDENTS.has(node.text);
    }
    return false;
  }
  if (ts.isPropertyAccessExpression(node)) {
    // state.appContext / s.appContext?.organization_id / appContext.organization_id
    if (node.name.text === APP_CONTEXT) {
      const p = node.parent;
      if (ts.isPropertyAccessExpression(p) && p.expression === node) return ORG_PROP.test(p.name.text);
      return true;
    }
    if (ORG_PROP.test(node.name.text) && ts.isIdentifier(node.expression) && node.expression.text === APP_CONTEXT) return true;
    // `opts.activeOrganizationId` / `viewer.activeOrganizationId` (a call of it is matched at the CallExpression).
    if (pkg && node.name.text === ACTIVE_ORG_NAME) return !(ts.isCallExpression(node.parent) && node.parent.expression === node);
  }
  return false;
}

/** The nearest NAMED function around `node` (declaration, `const x = () =>`, method), else `<module>`. */
function enclosingFunctionName(node: ts.Node): string {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
    if ((ts.isMethodDeclaration(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p)) && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) {
      let q: ts.Node | undefined = p.parent;
      while (q && (ts.isCallExpression(q) || ts.isParenthesizedExpression(q) || ts.isAsExpression(q))) q = q.parent;
      if (q && ts.isVariableDeclaration(q) && ts.isIdentifier(q.name)) return q.name.text;
    }
  }
  return "<module>";
}

/** The expression a finding is about, whitespace-collapsed and capped, so a row names the exact call. */
function expressionText(node: ts.Node, sf: ts.SourceFile): string {
  return node.getText(sf).replace(/\s+/g, " ").slice(0, 220);
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
}

/** `// org-filter: <class> <reason>` on this line or in the contiguous comment block right above it. */
function annotationFor(raw: string[], line: number): { ok: boolean; found: boolean; cls: string } {
  const check = (t: string | undefined) => {
    const m = t ? ANNOTATION.exec(t) : null;
    if (!m) return null;
    const cls = m[1] ?? "";
    return { ok: CLASSES.has(cls) && (m[2] ?? "").trim().length >= 12, found: true, cls };
  };
  const own = check(raw[line]);
  if (own) return own;
  for (let i = line - 1; i >= 0; i -= 1) {
    const t = (raw[i] ?? "").trim();
    if (!(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.endsWith("*/"))) break;
    const hit = check(raw[i]);
    if (hit) return hit;
  }
  return { ok: false, found: false, cls: "" };
}

function isExemptWrite(call: ts.CallExpression, name: string): boolean {
  if (FILTER_CALLEES.has(name)) {
    let e: ts.Expression = call.expression;
    while (ts.isPropertyAccessExpression(e) || ts.isCallExpression(e) || ts.isNonNullExpression(e)) {
      if (ts.isCallExpression(e)) {
        if (WRITE_VERBS.has(calleeName(e))) return true;
        e = e.expression;
      } else if (ts.isPropertyAccessExpression(e)) {
        e = e.expression;
      } else {
        e = e.expression;
      }
    }
  }
  if (name === "rpc") {
    const first = call.arguments[0];
    if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) && (WRITE_RPC.test(first.text) || WRITE_RPC_SUFFIX.test(first.text))) return true;
  }
  if (name === "fetch" || name === "callApi" || /^fetch[A-Z]/.test(name)) {
    if (call.arguments.some((a) => WRITE_METHOD.test(a.getText()))) return true;
  }
  return false;
}

function isReadCall(call: ts.CallExpression, pkg = false): boolean {
  const name = calleeName(call);
  if (ts.isPropertyAccessExpression(call.expression) && READ_METHODS.has(name)) {
    // Array.prototype.filter is client-side narrowing: a read only when its callback names an organization.
    return name !== "filter" || call.arguments.some((a) => /org(anization)?_?id/i.test(a.getText()));
  }
  if (pkg && READ_METHOD_SHAPE.test(name) && ts.isPropertyAccessExpression(call.expression)) return true;
  return READ_CALLEES.has(name) || READ_CALLEE_SHAPE.test(name);
}

/** Names of wrapper hooks/selectors defined in `sf` whose BODY reads the active organization. */
function carriersIn(sf: ts.SourceFile, derived: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const shape = /^(use|get|select|read|resolve|current|active|require)[A-Z]/;
  const containsSource = (n: ts.Node): boolean => {
    let hit = false;
    const walk = (x: ts.Node) => {
      if (hit) return;
      if (isSource(x, derived)) {
        hit = true;
        return;
      }
      ts.forEachChild(x, walk);
    };
    walk(n);
    return hit;
  };
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body && shape.test(st.name.text) && containsSource(st.body)) out.push(st.name.text);
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          shape.test(d.name.text) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) &&
          containsSource(d.initializer)
        ) {
          out.push(d.name.text);
        }
      }
    }
  }
  return out.filter((n) => !SOURCE_CALLS.has(n) && !SOURCE_IDENTS.has(n));
}

const PACKAGE_HINT = /activeOrganizationId|activeOrganization\(/;
const TOKEN_HINT = /ensureOrgId|awaitEffectiveOrganizationId|useOrganizationRequired|useActiveOrganizationId|useServerOrganizationId|ActiveOrgId|SelectedOrgId|readActiveOrg|selectOrganizationId|selectActiveOrganizationId|selectEffectiveOrganizationId|appContext|ActiveOrgCookie|activeOrg\w*Cookie/;

export function findDerivedSources(root: string, files: readonly string[]): Set<string> {
  const derived = new Set<string>();
  const texts = new Map<string, string>();
  for (const f of files) {
    try {
      texts.set(f, readFileSync(join(root, f), "utf8"));
    } catch {
      /* untracked deletion */
    }
  }
  for (let round = 0; round < 4; round += 1) {
    const before = derived.size;
    const hint = derived.size > 0 ? new RegExp(`${TOKEN_HINT.source}|\\b(?:${[...derived].join("|")})\\b`) : TOKEN_HINT;
    for (const [f, text] of texts) {
      if (!hint.test(text)) continue;
      for (const name of carriersIn(parse(f, text), derived)) derived.add(name);
    }
    if (derived.size === before) break;
  }
  return derived;
}

export function scanSource(file: string, text: string, derived: ReadonlySet<string> = new Set()): Finding[] {
  const pkg = PACKAGE_SOURCE.test(file);
  const hint = derived.size > 0 ? new RegExp(`${TOKEN_HINT.source}|\\b(?:${[...derived].join("|")})\\b`) : TOKEN_HINT;
  if (!hint.test(text) && !(pkg && PACKAGE_HINT.test(text))) return [];
  const sf = parse(file, text);
  const raw = text.split("\n");
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const push = (line: number, why: string, node: ts.Node) => {
    const dedupe = `${line}:${why.slice(0, 20)}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    const base = `${file}::${enclosingFunctionName(node)}::${expressionText(node, sf)}`;
    findings.push({ file, line: line + 1, text: (raw[line] ?? "").trim(), why, key: base });
  };
  const WHY_FILE =
    "reads the ACTIVE organization in a file that lists things — reads ignore the active organization (policies/access-ladder.md). Narrow with the shell's EntityOrgFilter (?org_filter=, default All organizations), or, when this read only addresses a write or server call, say so: // org-filter: write-target|server-call|default-for-new <reason>";
  const WHY_SITE =
    "an active-organization value reaches a read here (select / rpc / list fetch / query key / filter) — reads ignore the active organization (policies/access-ladder.md). Use the person's chosen ?org_filter= (default All organizations), or annotate THIS call: // org-filter: write-target|server-call|default-for-new <reason of 12+ characters> (an annotation on the source line covers nothing after it)";
  const badNote = (cls: string) =>
    `org-filter annotation must name write-target | server-call | default-for-new and a reason of 12+ characters (got "${cls}")`;

  // Direct sources in the file (the legacy file-level rule uses direct ones only).
  const directNodes = new Map<number, ts.Node>();
  const visit = (n: ts.Node) => {
    if (isSource(n, new Set())) {
      const l = lineOf(sf, n);
      if (!directNodes.has(l)) directNodes.set(l, n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  const code = codeOf(text);
  if (directNodes.size > 0 && LIST_READS.some((re) => re.test(code))) {
    for (const [line, node] of directNodes) {
      const note = annotationFor(raw, line);
      if (!note.found) push(line, WHY_FILE, node);
      else if (!note.ok) push(line, badNote(note.cls), node);
    }
  }

  // Call-site rule, per outermost function (and module level): taint, then reads that receive it.
  // A component's props carry it too: `<Bench organizationId={organizationId}>` taints `organizationId`
  // inside `function Bench` in the same file (the organization read once at the top of a screen and used
  // by a child three hundred lines later is still a read of the active organization).
  const scopes: Array<{ node: ts.Node; name: string }> = [];
  const nameOfFn = (fn: ts.Node): string => {
    if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
    let p: ts.Node | undefined = fn.parent;
    while (p && (ts.isCallExpression(p) || ts.isParenthesizedExpression(p))) p = p.parent;
    return p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) ? p.name.text : "";
  };
  const collect = (n: ts.Node, insideFn: boolean) => {
    const isFn = ts.isFunctionLike(n) && !ts.isTypeNode(n) && "body" in n && !!(n as ts.FunctionLikeDeclaration).body;
    if (isFn && !insideFn) {
      scopes.push({ node: n, name: nameOfFn(n) });
      return;
    }
    ts.forEachChild(n, (c) => collect(c, insideFn));
  };
  collect(sf, false);
  // Module-level statements that are not function bodies form one more scope.
  scopes.push({ node: sf, name: "" });

  const propTaint = new Map<string, Set<string>>();
  const taintOf = new Map<ts.Node, Set<string>>();
  const skipInner = (scope: ts.Node, n: ts.Node) =>
    scope === sf && n !== sf && ts.isFunctionLike(n) && "body" in n && !!(n as ts.FunctionLikeDeclaration).body;

  const kit = (scope: ts.Node, tainted: Set<string>) => {
    const isTaintedIdent = (x: ts.Identifier): boolean => {
      if (!tainted.has(x.text)) return false;
      const p = x.parent;
      return !((ts.isPropertyAccessExpression(p) && p.name === x) || (ts.isPropertyAssignment(p) && p.name === x));
    };
    /** Anywhere inside `n`: a source, or a tainted name (used for call ARGUMENTS — any value that reaches a read). */
    const mentionsTaint = (n: ts.Node): boolean => {
      let hit = false;
      const walk = (x: ts.Node) => {
        if (hit) return;
        if (isSource(x, derived, pkg) || (ts.isIdentifier(x) && isTaintedIdent(x))) {
          hit = true;
          return;
        }
        ts.forEachChild(x, walk);
      };
      walk(n);
      return hit;
    };
    /** Does the VALUE of `e` itself hold the active organization (not merely something computed with it)? Only these propagate taint. */
    const carriesTaint = (e: ts.Node): boolean => {
      if (isSource(e, derived, pkg)) return true;
      if (ts.isIdentifier(e)) return isTaintedIdent(e);
      if (ts.isParenthesizedExpression(e) || ts.isAwaitExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) {
        return carriesTaint(e.expression);
      }
      if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) return carriesTaint(e.expression);
      if (ts.isBinaryExpression(e)) return carriesTaint(e.left) || carriesTaint(e.right);
      if (ts.isConditionalExpression(e)) return carriesTaint(e.whenTrue) || carriesTaint(e.whenFalse);
      if (ts.isObjectLiteralExpression(e)) {
        return e.properties.some((pr) =>
          ts.isShorthandPropertyAssignment(pr) ? tainted.has(pr.name.text) : ts.isPropertyAssignment(pr) ? carriesTaint(pr.initializer) : ts.isSpreadAssignment(pr) ? carriesTaint(pr.expression) : false,
        );
      }
      if (ts.isArrayLiteralExpression(e)) return e.elements.some((x) => carriesTaint(x));
      if (ts.isTemplateExpression(e)) return e.templateSpans.some((sp) => carriesTaint(sp.expression));
      if (ts.isCallExpression(e)) {
        // wrappers that hand back what they were given: selector hooks, memo, string coercion
        if (/^(useAppSelector|useSelector|useMemo|String)$/.test(calleeName(e))) return e.arguments.some((a) => mentionsTaint(a));
      }
      return false;
    };
    return { mentionsTaint, carriesTaint };
  };
  const declared = (name: ts.BindingName, into: string[]) => {
    if (ts.isIdentifier(name)) into.push(name.text);
    else for (const el of name.elements) if (!ts.isOmittedExpression(el)) declared(el.name, into);
  };

  for (let round = 0; round < 5; round += 1) {
    let changed = false;
    for (const sc of scopes) {
      const tainted = taintOf.get(sc.node) ?? new Set<string>();
      taintOf.set(sc.node, tainted);
      for (const a of propTaint.get(sc.name) ?? []) if (sc.name && !tainted.has(a)) { tainted.add(a); changed = true; }
      const { carriesTaint } = kit(sc.node, tainted);
      for (let i = 0; i < 6; i += 1) {
        const before = tainted.size;
        const walk = (n: ts.Node) => {
          if (skipInner(sc.node, n)) return;
          if (ts.isVariableDeclaration(n) && n.initializer && carriesTaint(n.initializer)) {
            const names: string[] = [];
            declared(n.name, names);
            names.forEach((x) => tainted.add(x));
          }
          if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
            const tag = n.tagName.getText(sf);
            if (/^[A-Z]/.test(tag)) {
              for (const at of n.attributes.properties) {
                if (!ts.isJsxAttribute(at) || !at.initializer || !ts.isJsxExpression(at.initializer) || !at.initializer.expression) continue;
                if (!carriesTaint(at.initializer.expression)) continue;
                const set = propTaint.get(tag) ?? new Set<string>();
                if (!set.has(at.name.getText(sf))) {
                  set.add(at.name.getText(sf));
                  propTaint.set(tag, set);
                  changed = true;
                }
              }
            }
          }
          ts.forEachChild(n, walk);
        };
        walk(sc.node);
        if (tainted.size === before) break;
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const sc of scopes) {
    const scope = sc.node;
    const { mentionsTaint } = kit(scope, taintOf.get(scope) ?? new Set<string>());
    const flag = (node: ts.Node, kind: string) => {
      const line = lineOf(sf, node);
      const note = annotationFor(raw, line);
      if (note.found && note.ok) return;
      push(line, note.found ? badNote(note.cls) : `${WHY_SITE} [${kind}]`, node);
    };
    const walkSites = (n: ts.Node) => {
      if (skipInner(scope, n)) return;
      if (ts.isCallExpression(n)) {
        const name = calleeName(n);
        // In package source the organization a read is SEATED in rides the receiver too: `clientIn(client, org).listKeyset(…)`.
        const seated = pkg && ts.isPropertyAccessExpression(n.expression) && mentionsTaint(n.expression.expression);
        if (isReadCall(n, pkg) && !isExemptWrite(n, name) && (seated || n.arguments.some((a) => mentionsTaint(a)))) flag(n, `${name}()`);
      }
      if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === "queryKey" && mentionsTaint(n.initializer)) flag(n, "queryKey");
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tag = n.tagName.getText(sf);
        if (READ_TAGS.has(tag) && n.attributes.properties.some((a) => mentionsTaint(a))) flag(n, `<${tag}>`);
      }
      ts.forEachChild(n, walkSites);
    };
    walkSites(scope);
  }
  // Number identical call sites by POSITION (not scan order), so the key is stable under edits elsewhere.
  findings.sort((a, b) => a.line - b.line);
  const occurrence = new Map<string, number>();
  for (const f of findings) {
    const n = (occurrence.get(f.key) ?? 0) + 1;
    occurrence.set(f.key, n);
    f.key = `${f.key}#${n}`;
  }
  return findings;
}

export function scan(root: string, files: readonly string[]): Map<string, Finding[]> {
  const out = new Map<string, Finding[]>();
  const derived = findDerivedSources(root, files);
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const found = scanSource(file, text, derived);
    if (found.length > 0) out.set(file, found);
  }
  return out;
}

const NOT_SHIPPED = /(__tests__|__fixtures__|\.test\.|\.spec\.|\/__mocks__\/|\.d\.ts$)/;

/** Sibling directories this run could not read (no sibling checkout): said out loud, and their baseline rows are not judged stale. */
export const unmeasured: string[] = [];

export function scannedFiles(root: string): string[] {
  const own = repoFiles(root, {
    under: SCAN_DIRS.filter((d) => !d.startsWith("../")),
    match: /\.(ts|tsx)$/,
  });
  // A sibling checkout's files come from ITS git (this repo's ls-files never names `../`), kept `../repo/…` relative to this root.
  const sibling: string[] = [];
  unmeasured.length = 0;
  for (const dir of SIBLING_DIRS) {
    const [, repo = "", ...rest] = dir.split("/");
    const repoRoot = join(root, "..", repo);
    if (!existsSync(join(repoRoot, rest.join("/")))) {
      unmeasured.push(dir);
      continue;
    }
    for (const rel of repoFiles(repoRoot, { under: [rest.join("/")], match: /\.(ts|tsx)$/ })) sibling.push(`../${repo}/${rel}`);
  }
  return [...own, ...sibling].filter((f) => !NOT_SHIPPED.test(f));
}

function readBaseline(root: string): Record<string, BaselineEntry> {
  try {
    return JSON.parse(readFileSync(join(root, BASELINE), "utf8")).sites ?? {};
  } catch {
    return {};
  }
}

/** Exit code: 0 = no new active-organization read (by CALL SITE) and no stale baseline row. */
export function judge(found: Map<string, Finding[]>, baseline: Record<string, BaselineEntry>, log = console.log): number {
  const all = [...found.values()].flat();
  const keys = new Set(all.map((x) => x.key));
  const fresh = all.filter((x) => !(x.key in baseline));
  const stale = Object.keys(baseline).filter((k) => !keys.has(k) && !unmeasured.some((d) => k.startsWith(`${d}/`)));
  for (const d of unmeasured) log(`[WARN] UNMEASURED: ${d}/ — the sibling checkout is not here, so its reads were NOT scanned (its baseline rows are not judged).`);
  for (const x of fresh) log(`[FAIL] ${x.file}:${x.line}  ${x.text}\n       ${x.why}\n       (baseline key: ${x.key})`);
  for (const k of stale) {
    log(`[FAIL] ${k} is in ${BASELINE} but no longer trips the guard — remove its row (the baseline only shrinks).`);
  }
  log(
    `${fresh.length === 0 && stale.length === 0 ? "[ OK ]" : "[FAIL]"} check:no-active-org-in-reads — ${all.length} call site(s) in ${found.size} file(s) read the active organization; ${all.length - fresh.length} known (baseline, with owners), ${fresh.length} new, ${stale.length} stale baseline row(s).`,
  );
  return fresh.length === 0 && stale.length === 0 ? 0 : 1;
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "no-active-org-in-reads-"));
  const plant = (rel: string, body: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
    return rel;
  };
  const cases: Array<{ name: string; file: string; expectFindings: boolean }> = [
    {
      name: "RED: a picker listing the active organization's tables with no filter",
      file: plant(
        "features/a/Picker.tsx",
        `import { useTables, RecordsProvider } from "@ai-matrx/records/react";\nimport { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";\nexport function P() { const { organizationId } = useOrganizationRequired(); const t = useTables(); return <RecordsProvider config={{ organizationId }}>{t.data}</RecordsProvider>; }\n`,
      ),
      expectFindings: true,
    },
    {
      name: "RED: a label or control beside it does not excuse an active-organization list read",
      file: plant(
        "features/b/Picker.tsx",
        `import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";\nexport function P() { const { organizationId } = useOrganizationRequired(); const rows = listThings(organizationId); return <EntityOrgFilter orgId={null} onChange={() => {}} counts={{ byKind: {}, narrow: {} }} />; }\n`,
      ),
      expectFindings: true,
    },
    {
      name: "GREEN: a reasoned write-target annotation",
      file: plant(
        "features/c/Create.tsx",
        `export function C() {\n  // org-filter: write-target the new table is created in the organization the person is working in\n  const { organizationId } = useOrganizationRequired();\n  const rows = listTemplates();\n  return null;\n}\n`,
      ),
      expectFindings: false,
    },
    {
      name: "RED: a reasonless annotation",
      file: plant(
        "features/d/Create.tsx",
        `export function C() {\n  // org-filter: write-target ok\n  const { organizationId } = useOrganizationRequired();\n  const rows = listTemplates();\n  return null;\n}\n`,
      ),
      expectFindings: true,
    },
    {
      name: "RED: \"visible\" is not a class — a label never legalises it",
      file: plant(
        "features/e/List.tsx",
        `export function C() {\n  // org-filter: visible the list shows which organization it is filtering\n  const id = useAppSelector(selectOrganizationId);\n  const rows = useThingsList(id);\n  return null;\n}\n`,
      ),
      expectFindings: true,
    },
    {
      name: "GREEN: reads the active organization but lists nothing",
      file: plant(
        "features/f/Badge.tsx",
        `export function B() { const { organizationId } = useOrganizationRequired(); return organizationId; }\n`,
      ),
      expectFindings: false,
    },
    {
      name: "GREEN: a selector named only in a comment or an import list",
      file: plant(
        "features/g/Doc.tsx",
        `import { selectOrganizationId, other } from "x";\n// selectOrganizationId( is prose here\nexport const rows = listThings();\n`,
      ),
      expectFindings: false,
    },
  ];
  // ── 2026-09-30 blind-spot fixtures: each of these was INVISIBLE to the first version of this guard.
  const blind: Array<{ name: string; files: string[]; target: string; expect: boolean }> = [
    {
      name: "RED: a hook reads the active org in one file, a page lists with it in another",
      files: [
        plant("hooks/useWorkingOrgId.ts", `export function useWorkingOrgId() { return useAppSelector(selectOrganizationId); }\n`),
        plant("features/x1/Page.tsx", `export function P() { const org = useWorkingOrgId(); const rows = loadThings(org); return rows; }\n`),
      ],
      target: "features/x1/Page.tsx",
      expect: true,
    },
    {
      name: "GREEN: the same wrapper hook is defined but nothing reads with it",
      files: [
        plant("hooks/useWorkingOrgId2.ts", `export function useWorkingOrgId2() { return useAppSelector(selectOrganizationId); }\n`),
        plant("features/x1b/Badge.tsx", `export function B() { const org = useWorkingOrgId2(); return org; }\n`),
      ],
      target: "features/x1b/Badge.tsx",
      expect: false,
    },
    {
      name: "RED: an rpc NOT named list_* receives the active organization",
      files: [
        plant("features/x2/Inbox.tsx", `export function I() {\n  const { organizationId } = useOrganizationRequired();\n  return supabase.rpc("work_inbox", { p_organization_id: organizationId, p_limit: 200 });\n}\n`),
      ],
      target: "features/x2/Inbox.tsx",
      expect: true,
    },
    {
      name: "RED: state.appContext.organization_id read by hand feeds a query key",
      files: [
        plant("features/x3/Q.tsx", `export function Q() {\n  const org = useAppSelector((s) => s.appContext.organization_id);\n  return useQuery({ queryKey: ["things", org], queryFn: () => null });\n}\n`),
      ],
      target: "features/x3/Q.tsx",
      expect: true,
    },
    {
      name: "RED: selectEffectiveOrganizationId narrows a .select() with .eq('organization_id')",
      files: [
        plant("features/x4/S.ts", `export async function s(state: any) {\n  const org = selectEffectiveOrganizationId(state);\n  return supabase.from("things").select("*").eq("organization_id", org);\n}\n`),
      ],
      target: "features/x4/S.ts",
      expect: true,
    },
    {
      name: "RED: the shared cookie read (activeOrgCookie.read) feeds a list fetch",
      files: [
        plant("features/x5/C.ts", `export async function c(userId: string) {\n  const org = activeOrgCookie.read(userId);\n  return listThings(org);\n}\n`),
      ],
      target: "features/x5/C.ts",
      expect: true,
    },
    {
      name: "RED: a one-line write-target note at the source does NOT cover a later read of the variable",
      files: [
        plant(
          "features/x6/Bench.tsx",
          `export function B() {\n  // org-filter: write-target the bench creates its disposable table in the organization the person works in\n  const { organizationId } = useOrganizationRequired();\n  const create = () => createTable({ organizationId });\n  useEffect(() => {\n    supabase.rpc("work_inbox", { p_organization_id: organizationId });\n  }, [organizationId]);\n  return create;\n}\n`,
        ),
      ],
      target: "features/x6/Bench.tsx",
      expect: true,
    },
    {
      name: "RED: the active org is passed as a prop to a child in the same file that runs the rpc (TryEverythingScreen shape)",
      files: [
        plant(
          "features/x6b/Screen.tsx",
          `export default function Screen() {\n  // org-filter: write-target the bench creates its disposable table in the organization the person works in\n  const { organizationId } = useOrganizationRequired();\n  return <Strip organizationId={organizationId!} />;\n}\nfunction Strip({ organizationId }: { organizationId: string }) {\n  useEffect(() => {\n    supabase.rpc("work_inbox", { p_organization_id: organizationId, p_limit: 200 });\n  }, [organizationId]);\n  return null;\n}\n`,
        ),
      ],
      target: "features/x6b/Screen.tsx",
      expect: true,
    },
    {
      name: "GREEN: the same read annotated AT ITS OWN CALL SITE",
      files: [
        plant(
          "features/x7/Bench.tsx",
          `export function B() {\n  const { organizationId } = useOrganizationRequired();\n  useEffect(() => {\n    // org-filter: server-call the inbox is the run queue of the organization the person is working in\n    supabase.rpc("work_inbox", { p_organization_id: organizationId });\n  }, [organizationId]);\n  return null;\n}\n`,
        ),
      ],
      target: "features/x7/Bench.tsx",
      expect: false,
    },
    {
      name: "GREEN: writes carry the active organization (insert, update().eq, POST fetch, create_ rpc)",
      files: [
        plant(
          "features/x8/W.ts",
          `export async function w() {\n  const org = getActiveOrgId();\n  await supabase.from("t").insert({ organization_id: org });\n  await supabase.from("t").update({ a: 1 }).eq("organization_id", org);\n  await fetch("/api/x", { method: "POST", body: JSON.stringify({ organization_id: org }) });\n  await supabase.rpc("create_thing", { p_organization_id: org });\n}\n`,
        ),
      ],
      target: "features/x8/W.ts",
      expect: false,
    },
    {
      name: "RED: providers/ is scanned",
      files: [plant("providers/P.tsx", `export function P() { const o = getActiveOrgId(); return listThings(o); }\n`)],
      target: "providers/P.tsx",
      expect: true,
    },
    {
      name: "RED: utils/ is scanned",
      files: [plant("utils/u.ts", `export async function u() { const o = getActiveOrgId(); return listThings(o); }\n`)],
      target: "utils/u.ts",
      expect: true,
    },
    {
      name: "RED: packages/ is scanned",
      files: [plant("packages/p/src/p.ts", `export async function p() { const o = getActiveOrgId(); return listThings(o); }\n`)],
      target: "packages/p/src/p.ts",
      expect: true,
    },
  ];
  // ── THE PACKAGE SHAPE (2026-10-07, lane I): the Applet data path is built in @ai-matrx/applets, entity-data
  // and records, where the active organization arrives as an option, never a selector.
  blind.push(
    {
      name: "RED: package — an entity list asked with the host's active organization getter",
      files: [plant("packages-shared/entity-data/src/port.ts", `export function port(options: { activeOrganizationId?: () => string | null }) {\n  return { list: (token: string) => client.list({ token, organizationId: options.activeOrganizationId?.() }) };\n}\n`)],
      target: "packages-shared/entity-data/src/port.ts",
      expect: true,
    },
    {
      name: "RED: package — a table read seated in opts.activeOrganizationId instead of the table's own organization",
      files: [plant("packages-shared/applets/src/host.ts", `export function load(opts: { activeOrganizationId: string | null }, tableId: string) {\n  const seat = opts.activeOrganizationId;\n  return client.tableRead({ table_id: tableId, organization_id: seat });\n}\n`)],
      target: "packages-shared/applets/src/host.ts",
      expect: true,
    },
    {
      name: "RED: package — entity-data's activeOrganization() helper narrows a list",
      files: [plant("packages-shared/entity-data/src/list.ts", `export async function l() {\n  const org = activeOrganization();\n  return client.list({ token: "party", scope: { organization_id: org } });\n}\n`)],
      target: "packages-shared/entity-data/src/list.ts",
      expect: true,
    },
    {
      name: "RED: package — a read seated in a client bound to the active organization (receiver, not argument)",
      files: [plant("packages-shared/records/src/table-port.ts", `export async function l(client: C, tableId: string) {\n  return clientIn(client, client.config.activeOrganizationId).listKeyset({ table_id: tableId });\n}\n`)],
      target: "packages-shared/records/src/table-port.ts",
      expect: true,
    },
    {
      name: "GREEN: package — the active organization only names where a NEW row is created",
      files: [plant("packages-shared/entity-data/src/create.ts", `export async function c(token: string) {\n  const organizationId = activeOrganization();\n  return client.insert({ token, organizationId, rows: [] });\n}\n`)],
      target: "packages-shared/entity-data/src/create.ts",
      expect: false,
    },
    {
      name: "GREEN: package — the host's option handed to a client constructor (writes) is not a read",
      files: [plant("packages-shared/applets/src/client.ts", `export function make(opts: { activeOrganizationId: string | null }) {\n  return createRecordsClient({ organizationId: opts.activeOrganizationId });\n}\n`)],
      target: "packages-shared/applets/src/client.ts",
      expect: false,
    },
  );
  let failures = 0;
  // The sibling checkout's directories are really listed (until 2026-10-07 `../aidream/apps/shared/chat/src` was
  // named here and never scanned: this repo's git never answers a `../` path).
  const listed = scannedFiles(REPO_ROOT);
  for (const dirName of SIBLING_DIRS) {
    if (unmeasured.includes(dirName)) {
      console.log(`[WARN] UNMEASURED: ${dirName}/ — no sibling checkout here, so the listing arm could not run`);
      continue;
    }
    const ok = listed.some((f) => f.startsWith(`${dirName}/`));
    if (!ok) failures += 1;
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${dirName}/ is listed from the sibling checkout`);
  }
  for (const dirName of ["providers", "utils", "packages", "app", "features", "../aidream/apps/shared/chat/src", "../aidream/apps/shared/applets/src", "../aidream/apps/shared/entity-data/src", "../aidream/apps/shared/records/src", "components", "lib", "hooks"]) {
    const ok = (SCAN_DIRS as readonly string[]).includes(dirName);
    if (!ok) failures += 1;
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${dirName}/ is in the scanned directories`);
  }
  for (const b of blind) {
    const got = (scan(dir, b.files).get(b.target) ?? []).length > 0;
    const ok = got === b.expect;
    if (!ok) failures += 1;
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${b.name}`);
  }
  for (const c of cases) {
    const got = (scan(dir, [c.file]).get(c.file) ?? []).length > 0;
    const ok = got === c.expectFindings;
    if (!ok) failures += 1;
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${c.name}`);
  }
  // The baseline arms: a new offender fails, a stale row fails, a known offender passes.
  const found = scan(dir, ["features/a/Picker.tsx"]);
  const quiet = () => {};
  const serverCall = scan(dir, [
    plant(
      "features/h/Run.tsx",
      `export function R() {\n  // org-filter: server-call the agent run executes in the organization the person is working in\n  const { organizationId } = useOrganizationRequired();\n  const rows = listAgents();\n  return null;\n}\n`,
    ),
  ]);
  const scOk = serverCall.size === 0;
  if (!scOk) failures += 1;
  console.log(`${scOk ? "[ OK ]" : "[FAIL]"} GREEN: a reasoned server-call annotation`);
  const knownBaseline: Record<string, BaselineEntry> = {};
  for (const x of found.get("features/a/Picker.tsx") ?? []) knownBaseline[x.key] = { class: "silent-filter", owner: "x", note: "y" };
  const arms: Array<[string, number, number]> = [
    ["RED: a new offender not in the baseline", judge(found, {}, quiet), 1],
    ["GREEN: a known offender in the baseline", judge(found, knownBaseline, quiet), 0],
    [
      "RED: a stale baseline row",
      judge(found, { ...knownBaseline, "features/gone.tsx::gone::listThings(org)#1": { class: "silent-filter", owner: "x", note: "y" } }, quiet),
      1,
    ],
  ];
  // ── THE BASELINE IS PER CALL SITE (2026-09-30). The first version forgave whole files: a NEW read in a
  // baselined file passed. Each arm baselines v1 of one file, then judges an edited version.
  const siteFile = "features/site/Inbox.tsx";
  const baselineOf = (m: Map<string, Finding[]>): Record<string, BaselineEntry> => {
    const b: Record<string, BaselineEntry> = {};
    for (const xs of m.values()) for (const x of xs) b[x.key] = { class: "silent-filter", owner: "x", note: "y" };
    return b;
  };
  const v1 = `export function A() {\n  const o = getActiveOrgId();\n  return supabase.rpc("work_inbox", { p_organization_id: o });\n}\n`;
  plant(siteFile, v1);
  const v1Baseline = baselineOf(scan(dir, [siteFile]));
  const judgeVersion = (body: string) => {
    plant(siteFile, body);
    return judge(scan(dir, [siteFile]), v1Baseline, quiet);
  };
  arms.push(
    ["GREEN: the baselined file, unchanged", judgeVersion(v1), 0],
    ["GREEN: the same read moved down the file (line numbers are not part of a row)", judgeVersion("// moved\n\n\n" + v1), 0],
    [
      "RED: a NEW read in a different function of a baselined file",
      judgeVersion(v1 + `export function B() {\n  const o = getActiveOrgId();\n  return supabase.rpc("work_inbox", { p_organization_id: o });\n}\n`),
      1,
    ],
    [
      "RED: a DIFFERENT read added to the same function of a baselined file",
      judgeVersion(v1.replace("return supabase.rpc", 'supabase.rpc("other_inbox", { p_organization_id: o });\n  return supabase.rpc')),
      1,
    ],
    [
      "RED: the SAME read repeated in the same function (the second is a new site)",
      judgeVersion(v1.replace("return supabase.rpc", 'supabase.rpc("work_inbox", { p_organization_id: o });\n  return supabase.rpc')),
      1,
    ],
  );
  // ── ensureOrgId / awaitEffectiveOrganizationId return the active organization.
  const srcCases: Array<{ name: string; body: string; expect: boolean }> = [
    { name: "RED: ensureOrgId(undefined) feeds a read", body: `export async function f() {\n  const o = await ensureOrgId(undefined);\n  return supabase.rpc("work_inbox", { p_organization_id: o });\n}\n`, expect: true },
    { name: "RED: ensureOrgId(null) feeds a read", body: `export async function f() {\n  const o = await ensureOrgId(null);\n  return supabase.rpc("work_inbox", { p_organization_id: o });\n}\n`, expect: true },
    { name: "RED: ensureOrgId() with no argument feeds a read", body: `export async function f() {\n  const o = await ensureOrgId();\n  return supabase.rpc("work_inbox", { p_organization_id: o });\n}\n`, expect: true },
    { name: "GREEN: ensureOrgId(<the record's own organization>) is not the active organization", body: `export async function f(record: { organizationId: string }) {\n  const o = await ensureOrgId(record.organizationId);\n  return supabase.rpc("work_inbox", { p_organization_id: o });\n}\n`, expect: false },
    { name: "RED: awaitEffectiveOrganizationId() feeds a read", body: `export async function f() {\n  const w = await awaitEffectiveOrganizationId();\n  if (w.status !== "ready") return null;\n  return supabase.rpc("work_inbox", { p_organization_id: w.organizationId });\n}\n`, expect: true },
    { name: "GREEN: ensureOrgId(null) that only feeds a write, annotated on its line", body: `export async function f() {\n  // org-filter: write-target the new row is created in the organization the person works in\n  const o = await ensureOrgId(null);\n  return supabase.from("things").insert({ organization_id: o });\n}\n`, expect: false },
    { name: "RED: ensureOrgId(null) in a file that also lists, with no annotation", body: `export async function f() {\n  const o = await ensureOrgId(null);\n  await supabase.from("things").insert({ organization_id: o });\n  return listThings();\n}\n`, expect: true },
  ];
  srcCases.forEach((c, i) => {
    const rel = plant(`features/src${i}/S.ts`, c.body);
    const got = (scan(dir, [rel]).get(rel) ?? []).length > 0;
    arms.push([c.name, got === c.expect ? 0 : 1, 0]);
  });
  for (const [name, got, want] of arms) {
    const ok = got === want;
    if (!ok) failures += 1;
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${name}`);
  }
  console.log(failures === 0 ? "[ OK ] self-test: every arm answered as designed" : `[FAIL] self-test: ${failures} arm(s) wrong`);
  return failures === 0 ? 0 : 1;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const found = scan(REPO_ROOT, scannedFiles(REPO_ROOT));
  if (process.argv.includes("--list")) {
    for (const [file, xs] of found) for (const x of xs) console.log(`${file}\t${x.line}\t${x.key}`);
    return 0;
  }
  return judge(found, readBaseline(REPO_ROOT));
}

process.exit(main());
