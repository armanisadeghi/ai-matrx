/**
 * check:no-active-org-in-reads — THE ACTIVE ORGANIZATION IS NEVER A LIST FILTER.
 * Law (Arman, 2026-09-30): common-docs/policies/active-org-is-never-a-list-filter.md.
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
 * readActiveOrganizationId / readActiveOrganizationForIdentity, the selectors selectOrganizationId /
 * selectActiveOrganizationId / selectEffectiveOrganizationId, a hand-read `state.appContext` /
 * `appContext.organization_id`, the shared cookie (`activeOrgCookie.read(...)`), and — across files —
 * any wrapper hook/selector (use*/get*/select*/read*/resolve*/current*/active*/require*) whose body
 * reads one of those, wherever it is defined (a hook reading it in one file and a page listing in
 * another is the same read).
 *
 *  RULE 1 (file level, legacy). A file that reads a source AND lists (useTables / list*() / use*List() /
 *  fetch*s() / rpc('list_…') / .from().select( / <RecordsProvider / RecordsMount): every source line must
 *  carry the annotation below.
 *  RULE 2 (call site, 2026-09-30). Inside one function, a value derived from a source (the variable it
 *  was assigned to, and anything assigned from that) that reaches a READ CALL — .select() / .rpc() (any
 *  name) / .eq .in .match .or .filter (unless the chain writes) / useQuery / a `queryKey` / fetch or
 *  callApi (unless POST/PUT/PATCH/DELETE) / list* fetch* load* search* query* find* count* / use*List /
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
 * THE BASELINE (`scripts/no-active-org-in-reads-baseline.json`) holds what is not fixed yet, each
 * with its census class and owner. It only SHRINKS: a baseline row whose file no longer trips the
 * guard fails until the row is removed, and a new file that trips fails.
 *
 * `--self-test` proves both directions on planted fixtures. `--list` prints every offender.
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ts from "typescript";

import { REPO_ROOT, repoFiles } from "./lib/repo-files";

const BASELINE = "scripts/no-active-org-in-reads-baseline.json";

/** Every directory of application code. (2026-09-30: providers/ utils/ packages/ joined — a hook or provider there reads the active organization exactly like a feature does.) */
export const SCAN_DIRS = ["app", "features", "components", "lib", "hooks", "providers", "utils", "packages"] as const;

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
]);
/** Selectors that return it. */
const SOURCE_IDENTS = new Set(["selectOrganizationId", "selectActiveOrganizationId", "selectEffectiveOrganizationId"]);
/** `activeOrgCookie.read(userId)` and friends: the shared cookie IS the remembered active organization. */
const COOKIE_OBJECT = /^(activeOrg\w*Cookie|\w*ActiveOrgCookie)$/;
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
const READ_CALLEES = new Set([
  "select", "rpc", "eq", "in", "match", "or", "filter", "neq",
  "useQuery", "useInfiniteQuery", "useSuspenseQuery", "useQueries", "fetchQuery",
  "fetch", "callApi",
]);
const READ_CALLEE_SHAPE = /^(list|fetch|load|search|query|find|count)[A-Z_]\w*$|^use\w*(List|Query|Tables|Records|Search)$/;
/** Filter methods that also appear on writes (`.update(x).eq("organization_id", org)`): read only when no write verb is in the chain. */
const FILTER_CALLEES = new Set(["eq", "in", "match", "or", "filter", "neq", "select"]);
const WRITE_VERBS = new Set(["insert", "update", "upsert", "delete"]);
/** An rpc whose name starts with a write verb carries the active org as a write/server-call target. */
const WRITE_RPC = /^(create|update|delete|insert|upsert|set|save|archive|restore|add|remove|grant|revoke|invite|accept|transfer|submit|start|run|send|enqueue|record|log|register|mark|apply|rename|move|copy|duplicate|publish|unpublish|claim|release)_/;
const WRITE_METHOD = /method\s*:\s*["'`](POST|PUT|PATCH|DELETE)/;
const READ_TAGS = new Set(["RecordsProvider", "RecordsMount"]);

const ANNOTATION = /\/\/\s*org-filter:\s*(\S+)\s*(.*)$/;
const CLASSES = new Set(["write-target", "server-call", "default-for-new"]);

export interface Finding {
  file: string;
  line: number;
  text: string;
  why: string;
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
function isSource(node: ts.Node, derived: ReadonlySet<string>): boolean {
  if (ts.isCallExpression(node)) {
    const n = calleeName(node);
    if (SOURCE_CALLS.has(n) || derived.has(n)) return true;
    const e = node.expression;
    if (ts.isPropertyAccessExpression(e) && /^(read|get)$/.test(e.name.text) && ts.isIdentifier(e.expression) && COOKIE_OBJECT.test(e.expression.text)) {
      return true;
    }
    return false;
  }
  if (ts.isIdentifier(node)) {
    if (isDeclarationName(node)) return false;
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
  }
  return false;
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
    if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) && WRITE_RPC.test(first.text)) return true;
  }
  if (name === "fetch" || name === "callApi" || /^fetch[A-Z]/.test(name)) {
    if (call.arguments.some((a) => WRITE_METHOD.test(a.getText()))) return true;
  }
  return false;
}

function isReadCallee(name: string): boolean {
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

const TOKEN_HINT = /useOrganizationRequired|useActiveOrganizationId|useServerOrganizationId|ActiveOrgId|SelectedOrgId|readActiveOrg|selectOrganizationId|selectActiveOrganizationId|selectEffectiveOrganizationId|appContext|ActiveOrgCookie|activeOrg\w*Cookie/;

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
  const hint = derived.size > 0 ? new RegExp(`${TOKEN_HINT.source}|\\b(?:${[...derived].join("|")})\\b`) : TOKEN_HINT;
  if (!hint.test(text)) return [];
  const sf = parse(file, text);
  const raw = text.split("\n");
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const push = (line: number, why: string) => {
    const key = `${line}:${why.slice(0, 20)}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ file, line: line + 1, text: (raw[line] ?? "").trim(), why });
  };
  const WHY_FILE =
    "reads the ACTIVE organization in a file that lists things — reads ignore the active organization (policies/active-org-is-never-a-list-filter.md). Narrow with the shell's EntityOrgFilter (?org_filter=, default All organizations), or, when this read only addresses a write or server call, say so: // org-filter: write-target|server-call|default-for-new <reason>";
  const WHY_SITE =
    "an active-organization value reaches a read here (select / rpc / list fetch / query key / filter) — reads ignore the active organization (policies/active-org-is-never-a-list-filter.md). Use the person's chosen ?org_filter= (default All organizations), or annotate THIS call: // org-filter: write-target|server-call|default-for-new <reason of 12+ characters> (an annotation on the source line covers nothing after it)";
  const badNote = (cls: string) =>
    `org-filter annotation must name write-target | server-call | default-for-new and a reason of 12+ characters (got "${cls}")`;

  // Direct sources in the file (the legacy file-level rule uses direct ones only).
  const directLines: number[] = [];
  const visit = (n: ts.Node) => {
    if (isSource(n, new Set())) directLines.push(lineOf(sf, n));
    ts.forEachChild(n, visit);
  };
  visit(sf);

  const code = codeOf(text);
  if (directLines.length > 0 && LIST_READS.some((re) => re.test(code))) {
    for (const line of new Set(directLines)) {
      const note = annotationFor(raw, line);
      if (!note.found) push(line, WHY_FILE);
      else if (!note.ok) push(line, badNote(note.cls));
    }
  }

  // Call-site rule, per outermost function (and module level): taint, then reads that receive it.
  const scopes: ts.Node[] = [];
  const collect = (n: ts.Node, insideFn: boolean) => {
    const isFn = ts.isFunctionLike(n) && !ts.isTypeNode(n) && "body" in n && !!(n as ts.FunctionLikeDeclaration).body;
    if (isFn && !insideFn) {
      scopes.push(n);
      return;
    }
    ts.forEachChild(n, (c) => collect(c, insideFn));
  };
  collect(sf, false);
  // Module-level statements that are not function bodies form one more scope.
  scopes.push(sf);

  for (const scope of scopes) {
    const tainted = new Set<string>();
    const mentionsTaint = (n: ts.Node): boolean => {
      let hit = false;
      const walk = (x: ts.Node) => {
        if (hit) return;
        if (isSource(x, derived)) {
          hit = true;
          return;
        }
        if (ts.isIdentifier(x) && tainted.has(x.text)) {
          const p = x.parent;
          const isMemberName = ts.isPropertyAccessExpression(p) && p.name === x;
          const isKey = ts.isPropertyAssignment(p) && p.name === x;
          if (!isMemberName && !isKey) {
            hit = true;
            return;
          }
        }
        ts.forEachChild(x, walk);
      };
      walk(n);
      return hit;
    };
    const declared = (name: ts.BindingName, into: string[]) => {
      if (ts.isIdentifier(name)) into.push(name.text);
      else for (const el of name.elements) if (!ts.isOmittedExpression(el)) declared(el.name, into);
    };
    // fixpoint over declarations
    for (let i = 0; i < 6; i += 1) {
      const before = tainted.size;
      const walk = (n: ts.Node) => {
        if (scope === sf && n !== sf && ts.isFunctionLike(n) && "body" in n && (n as ts.FunctionLikeDeclaration).body) return;
        if (ts.isVariableDeclaration(n) && n.initializer && mentionsTaint(n.initializer)) {
          const names: string[] = [];
          declared(n.name, names);
          names.forEach((x) => tainted.add(x));
        }
        ts.forEachChild(n, walk);
      };
      walk(scope);
      if (tainted.size === before) break;
    }
    const flag = (node: ts.Node, kind: string) => {
      const line = lineOf(sf, node);
      const note = annotationFor(raw, line);
      if (note.found && note.ok) return;
      push(line, note.found ? badNote(note.cls) : `${WHY_SITE} [${kind}]`);
    };
    const walkSites = (n: ts.Node) => {
      if (scope === sf && n !== sf && ts.isFunctionLike(n) && "body" in n && (n as ts.FunctionLikeDeclaration).body) return;
      if (ts.isCallExpression(n)) {
        const name = calleeName(n);
        if (isReadCallee(name) && !isExemptWrite(n, name) && n.arguments.some((a) => mentionsTaint(a))) flag(n, `${name}()`);
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
  return findings.sort((a, b) => a.line - b.line);
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

export function scannedFiles(root: string): string[] {
  return repoFiles(root, {
    under: [...SCAN_DIRS],
    match: /\.(ts|tsx)$/,
  }).filter((f) => !/(__tests__|\.test\.|\.spec\.|\/__mocks__\/|\.d\.ts$)/.test(f));
}

function readBaseline(root: string): Record<string, BaselineEntry> {
  try {
    return JSON.parse(readFileSync(join(root, BASELINE), "utf8")).files ?? {};
  } catch {
    return {};
  }
}

/** Exit code: 0 = no new silent filter and no stale baseline row. */
export function judge(found: Map<string, Finding[]>, baseline: Record<string, BaselineEntry>, log = console.log): number {
  const fresh = [...found.keys()].filter((f) => !(f in baseline));
  const stale = Object.keys(baseline).filter((f) => !found.has(f));
  for (const f of fresh) {
    for (const x of found.get(f) ?? []) log(`[FAIL] ${x.file}:${x.line}  ${x.text}\n       ${x.why}`);
  }
  for (const f of stale) {
    log(`[FAIL] ${f} is in ${BASELINE} but no longer trips the guard — remove its row (the baseline only shrinks).`);
  }
  log(
    `${fresh.length === 0 && stale.length === 0 ? "[ OK ]" : "[FAIL]"} check:no-active-org-in-reads — ${found.size} file(s) read the active organization where they list things; ${found.size - fresh.length} known (baseline, with owners), ${fresh.length} new, ${stale.length} stale baseline row(s).`,
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
  let failures = 0;
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
  const arms: Array<[string, number, number]> = [
    ["RED: a new offender not in the baseline", judge(found, {}, quiet), 1],
    [
      "GREEN: a known offender in the baseline",
      judge(found, { "features/a/Picker.tsx": { class: "silent-filter", owner: "x", note: "y" } }, quiet),
      0,
    ],
    [
      "RED: a stale baseline row",
      judge(
        found,
        {
          "features/a/Picker.tsx": { class: "silent-filter", owner: "x", note: "y" },
          "features/gone.tsx": { class: "silent-filter", owner: "x", note: "y" },
        },
        quiet,
      ),
      1,
    ],
  ];
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
    for (const [file, xs] of found) console.log(`${file}\t${xs.map((x) => x.line).join(",")}`);
    return 0;
  }
  return judge(found, readBaseline(REPO_ROOT));
}

process.exit(main());
