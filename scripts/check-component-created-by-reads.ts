#!/usr/bin/env npx tsx
/**
 * check:component-created-by-reads — code never reads a COMPONENT row's `created_by` as a person.
 *
 * WHY THIS EXISTS (2026-09-27)
 * ----------------------------
 * A `component` table takes its access from a parent (db-rules §6d-1, THE COMPONENT OWNERSHIP
 * LAW: `../common-docs/systems/platform/db-rules/FEATURE.md`). On those tables the trigger
 * `zzz_component_created_by` (`platform.component_created_by_from_parent()`) REWRITES
 * `created_by` to the PARENT's owner on insert and reparent, on purpose. Whoever saved the row
 * is gone from that column. aidream read `seo.coverage_tracker.created_by` as "the person who
 * saved this monitor" and a test digest reached Arman's personal inbox; this repo had the same
 * class: `canvas.canvas_item_state` was keyed `(canvas_id, created_by)`, so every viewer of a
 * canvas shared ONE state row (the parent owner's), and "my lists" / "my artifacts" /
 * snapshot attribution all answered with the parent owner instead of the person.
 *
 * On a component, `created_by` answers ONE question: "who owns the parent?". It is never the
 * author, the saver, a recipient, a "mine" filter, UI attribution, or a per-viewer key.
 *
 * WHAT TO READ INSTEAD
 *   * The person who last saved the row: `updated_by` — `platform._stamp_actor` stamps it from
 *     `app.user_id` / `auth.uid()` on every write and nothing rewrites it. It can be NULL (a
 *     server write that declared no person): that is "unknown" and the UI must say so — NEVER
 *     fall back to `created_by`. Helper: `componentSaver()` in `lib/provenance/componentSaver.ts`.
 *   * Per-viewer state: a NAMED viewer column (`canvas_item_state.viewer_id`) set to the viewer.
 *   * Who may see / change the row: the parent, through RLS — not an app-side created_by filter.
 *
 * WHAT IT REFUSES (TypeScript AST, offline)
 *   1. A supabase-js chain whose `.from("<table>")` (schema from `.schema("<s>")` in the same
 *      chain, `public` when absent) is a component and that READS `created_by`: a filter
 *      (`.eq/.neq/.in/.is/.not/.order/.gt/...("created_by", …)`), `.match({ created_by })`,
 *      a top-level `created_by` column in `.select(…)`, or an `onConflict` naming it.
 *      Embedded resources (`conversation!inner(created_by)`, `.eq("conversation.created_by")`)
 *      belong to the embedded table and are not this table's read.
 *   2. Any other read of `.created_by` / `["created_by"]` inside a function (or module body)
 *      that references a component table — by a `.from()` chain, a generated-types reference
 *      (`Tables<{ schema: "chat" }, "artifact">`, `Database["chat"]["Tables"]["artifact"]`, or a
 *      same-file alias of one), or a SQL string naming `schema.table`.
 *   A hand-written row interface joins by declaring its table: `/** @componentRow chat.artifact *\/`.
 *   Writing `created_by` (an object key in an insert payload) is not flagged — the trigger
 *   overwrites it; that is merely pointless.
 *
 * The component registry is the live `platform.entity_types` (`rls_variant = 'component'`,
 * with a `created_by` column), snapshotted to `scripts/component-created-by-tables.json` so the
 * check runs offline in CI. Refresh it with `--refresh-registry` (reads the live DB).
 *
 * EXEMPTIONS: a read that genuinely wants the PARENT's owner (or reads another table's
 * `created_by` inside a scope that also touches a component) carries, on the same line or the
 * line directly above:  `// component-created-by-ok: <why this read is not a person>`.
 * A marker without a reason fails. There is no baseline: the census was repointed.
 *
 * LIMITS (named, not hidden): a row type imported from ANOTHER file and read there is not
 * traced; SQL in `migrations/` is not scanned (the report functions were repointed in
 * `migrations/component_created_by_report_readers_use_saver.sql`).
 *
 * Usage:
 *   pnpm check:component-created-by-reads               # check (exit 1 on a finding)
 *   pnpm check:component-created-by-reads --self-test   # prove it can fail and pass
 *   pnpm check:component-created-by-reads --refresh-registry
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "scripts/component-created-by-tables.json");
const MARK = /component-created-by-ok:\s*(\S.*)?$/;
const FILTER_METHODS = new Set([
  "eq", "neq", "in", "is", "not", "gt", "gte", "lt", "lte", "like", "ilike",
  "order", "filter", "contains", "containedBy", "overlaps",
]);
const SKIP = /(^|\/)(node_modules|\.next|dist|build|coverage|migrations|__tests__|__fixtures__)(\/|$)|\.test\.tsx?$|\.spec\.tsx?$|types\/database|\.gen\.ts$|\.d\.ts$/;

export interface Finding {
  file: string;
  line: number;
  scope: string;
  table: string;
  how: string;
}

type Registry = Set<string>;

function loadRegistry(): Registry {
  const raw = JSON.parse(readFileSync(REGISTRY, "utf8")) as { tables: string[] };
  return new Set(raw.tables);
}

function lit(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** Walk a call chain down to its root, returning every `.method(args)` call on the way. */
function chainCalls(expr: ts.Expression): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  let cur: ts.Expression = expr;
  for (;;) {
    if (ts.isAwaitExpression(cur) || ts.isParenthesizedExpression(cur) || ts.isNonNullExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (ts.isCallExpression(cur)) {
      out.push(cur);
      cur = cur.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    break;
  }
  return out;
}

function methodName(call: ts.CallExpression): string | null {
  return ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : null;
}

/** schema.table named by a chain containing `.from("t")`, or null. */
function chainTable(calls: ts.CallExpression[]): string | null {
  let table: string | null = null;
  let schema: string | null = null;
  for (const c of calls) {
    const m = methodName(c);
    if (m === "from" && table === null) table = lit(c.arguments[0]);
    if (m === "schema" && schema === null) schema = lit(c.arguments[0]);
  }
  if (!table) return null;
  if (table.includes(".")) return table;
  return `${schema ?? "public"}.${table}`;
}

/** Top-level column names of a PostgREST select string (embedded resources excluded). */
function topLevelColumns(select: string): string[] {
  const cols: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of select) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      cols.push(cur.trim());
      cur = "";
      continue;
    }
    if (depth === 0 && ch !== ")") cur += ch;
  }
  if (cur.trim()) cols.push(cur.trim());
  return cols.map((c) => c.replace(/^[\w]+:/, "").replace(/::\w+$/, "").trim());
}

function typeRefTable(node: ts.Node, aliases?: Map<string, string>): string | null {
  // Tables<{ schema: "chat" }, "artifact">, TablesInsert<...>, TablesUpdate<...>
  if (ts.isTypeReferenceNode(node) && node.typeArguments && ts.isIdentifier(node.typeName)) {
    const name = node.typeName.text;
    if (/^Tables(Insert|Update)?$/.test(name)) {
      const [first, second] = node.typeArguments;
      if (node.typeArguments.length === 1 && first && ts.isLiteralTypeNode(first) && ts.isStringLiteral(first.literal)) {
        return `public.${first.literal.text}`;
      }
      if (first && second && ts.isTypeLiteralNode(first) && ts.isLiteralTypeNode(second) && ts.isStringLiteral(second.literal)) {
        for (const m of first.members) {
          if (ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name) && m.name.text === "schema" && m.type && ts.isLiteralTypeNode(m.type) && ts.isStringLiteral(m.type.literal)) {
            return `${m.type.literal.text}.${second.literal.text}`;
          }
        }
      }
    }
  }
  // Database["chat"]["Tables"]["artifact"]
  if (ts.isIndexedAccessTypeNode(node)) {
    const idx = (n: ts.TypeNode) => (ts.isLiteralTypeNode(n) && ts.isStringLiteral(n.literal) ? n.literal.text : null);
    const t = idx(node.indexType);
    const mid = node.objectType;
    // WebTables["finding"] where `type WebTables = Database["web"]["Tables"]`
    if (t && ts.isTypeReferenceNode(mid) && ts.isIdentifier(mid.typeName)) {
      const sch = aliases?.get(`schema:${mid.typeName.text}`);
      if (sch) return `${sch}.${t}`;
    }
    if (t && ts.isIndexedAccessTypeNode(mid) && idx(mid.indexType) === "Tables" && ts.isIndexedAccessTypeNode(mid.objectType)) {
      const s = idx(mid.objectType.indexType);
      if (s) return `${s}.${t}`;
    }
  }
  return null;
}

function isScopeNode(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isConstructorDeclaration(node)) return true;
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parent) {
    const p = node.parent;
    return ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isExportAssignment(p);
  }
  return false;
}

function scopeName(node: ts.Node): string {
  if (ts.isSourceFile(node)) return "<module>";
  const named = node as ts.Node & { name?: ts.Node };
  if (named.name && ts.isIdentifier(named.name)) return named.name.text;
  const p = node.parent as ts.Node & { name?: ts.Node };
  if (p?.name && ts.isIdentifier(p.name)) return p.name.text;
  return "<anonymous>";
}

function markerFor(lines: string[], line0: number): "ok" | "bare" | null {
  for (const l of [lines[line0], lines[line0 - 1]]) {
    if (l === undefined) continue;
    const m = MARK.exec(l);
    if (m) return m[1] && m[1].trim().length > 3 ? "ok" : "bare";
  }
  return null;
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/**
 * Pass 1 across the repo: EXPORTED type aliases / interfaces that name a component row
 * (`export type CxArtifactRow = Tables<{ schema: "chat" }, "artifact">`), so a converter in
 * another file that takes a `CxArtifactRow` and reads `.created_by` is caught. A name declared
 * in more than one file is ambiguous and dropped (`Row`, `Props`).
 */
export function collectExportedAliases(files: { file: string; text: string }[], components: Registry): Map<string, string> {
  const hits = new Map<string, string>();
  const declared = new Map<string, number>();
  for (const { file, text } of files) {
    const sf = parse(file, text);
    const local = new Map<string, string>();
    for (let pass = 0; pass < 2; pass++) collectAliasesInto(sf, components, local);
    for (const st of sf.statements) {
      if ((ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        declared.set(st.name.text, (declared.get(st.name.text) ?? 0) + 1);
        const t = local.get(st.name.text);
        if (t) hits.set(st.name.text, t);
      }
    }
  }
  for (const [name, n] of declared) if (n > 1) hits.delete(name);
  return hits;
}

function collectAliasesInto(sf: ts.SourceFile, components: Registry, aliasTable: Map<string, string>): void {
  const collectAlias = (node: ts.Node) => {
    if (ts.isTypeAliasDeclaration(node) && ts.isIndexedAccessTypeNode(node.type)) {
      // `type WebTables = Database["web"]["Tables"]` — a schema alias, resolved by typeRefTable.
      const it = node.type;
      const lt = (n: ts.TypeNode) => (ts.isLiteralTypeNode(n) && ts.isStringLiteral(n.literal) ? n.literal.text : null);
      if (lt(it.indexType) === "Tables" && ts.isIndexedAccessTypeNode(it.objectType)) {
        const sch = lt(it.objectType.indexType);
        if (sch) aliasTable.set(`schema:${node.name.text}`, sch);
      }
    }
    if ((ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.name) {
      let hit: string | null = null;
      // A hand-written row shape declares its table: `/** @componentRow chat.artifact */`.
      for (const tag of ts.getJSDocTags(node)) {
        const c = typeof tag.comment === "string" ? tag.comment.trim() : "";
        if (tag.tagName.text === "componentRow" && components.has(c)) hit = c;
      }
      const visit = (n: ts.Node) => {
        if (hit) return;
        const t = typeRefTable(n, aliasTable);
        if (t && components.has(t)) hit = t;
        else if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName) && aliasTable.has(n.typeName.text)) hit = aliasTable.get(n.typeName.text)!;
        n.forEachChild(visit);
      };
      visit(node);
      if (hit) aliasTable.set(node.name.text, hit);
    }
    node.forEachChild(collectAlias);
  };
  collectAlias(sf);
}

export function scanSource(file: string, text: string, components: Registry, globalAliases?: Map<string, string>): Finding[] {
  const sf = parse(file, text);
  const lines = text.split("\n");
  const findings: Finding[] = [];

  // Type aliases / interfaces that name a component row: exported ones repo-wide, then this file's.
  const aliasTable = new Map<string, string>(globalAliases ?? []);
  collectAliasesInto(sf, components, aliasTable);
  collectAliasesInto(sf, components, aliasTable); // second pass resolves aliases declared later

  interface ScopeInfo { node: ts.Node; tables: Set<string>; reads: { node: ts.Node; how: string }[] }
  const scopes = new Map<ts.Node, ScopeInfo>();
  const scopeOf = (node: ts.Node): ScopeInfo => {
    let cur: ts.Node = node.parent;
    while (cur && !ts.isSourceFile(cur) && !isScopeNode(cur)) cur = cur.parent;
    // A module-level scope rolls up to its OUTERMOST function so callbacks join their owner.
    let outer: ts.Node = cur;
    for (let p = cur?.parent; p && !ts.isSourceFile(p); p = p.parent) if (isScopeNode(p)) outer = p;
    const key = outer ?? sf;
    let info = scopes.get(key);
    if (!info) scopes.set(key, (info = { node: key, tables: new Set(), reads: [] }));
    return info;
  };

  const report = (node: ts.Node, table: string, how: string, scope: string) => {
    const line0 = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    const mark = markerFor(lines, line0);
    if (mark === "ok") return;
    findings.push({ file, line: line0 + 1, scope, table, how: mark === "bare" ? `${how}; marker has no reason` : how });
  };

  const seenChainReads = new Set<ts.Node>();

  const visit = (node: ts.Node) => {
    // Component references in this scope.
    const t = typeRefTable(node, aliasTable);
    if (t && components.has(t)) scopeOf(node).tables.add(t);
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && aliasTable.has(node.typeName.text)) {
      scopeOf(node).tables.add(aliasTable.get(node.typeName.text)!);
    }
    const s = lit(node) ?? (ts.isTemplateExpression(node) ? node.getText(sf) : null);
    if (s && /\bcreated_by\b/.test(s) && /\b(select|from|where|join|update|returning)\b/i.test(s)) {
      // SQL text: `schema.table` + created_by in one string.
      for (const m of s.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/g)) {
        const fq = `${m[1]}.${m[2]}`;
        if (components.has(fq)) {
          scopeOf(node).tables.add(fq);
          const info = scopeOf(node);
          report(node, fq, "SQL text names a component and reads created_by", scopeName(info.node));
          break;
        }
      }
    }

    // A supabase-js chain ending at .from(): precise per-chain reads.
    if (ts.isCallExpression(node) && methodName(node) === "from" && !(node.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === "from")) {
      // climb to the top of the chain
      let top: ts.Node = node;
      while (top.parent && (ts.isPropertyAccessExpression(top.parent) || (ts.isCallExpression(top.parent) && top.parent.expression === top))) top = top.parent;
      const calls = chainCalls(top as ts.Expression);
      const table = chainTable(calls);
      if (table && components.has(table)) {
        const info = scopeOf(node);
        info.tables.add(table);
        const where = scopeName(info.node);
        for (const c of calls) {
          const m = methodName(c);
          // Report at the `.method(` line — a call's own start is the head of the whole chain.
          const at: ts.Node = ts.isPropertyAccessExpression(c.expression) ? c.expression.name : c;
          const a0 = lit(c.arguments[0]);
          if (m && FILTER_METHODS.has(m) && a0 !== null && /^created_by\b/.test(a0)) {
            seenChainReads.add(c);
            report(at, table, `.${m}("${a0}") filters on the parent owner`, where);
          }
          if (m === "or" && a0 && /(^|,|\()created_by\./.test(a0)) report(at, table, `.or() filters on created_by`, where);
          if (m === "select" && a0 && topLevelColumns(a0).includes("created_by")) report(at, table, `.select() reads created_by`, where);
          if (m === "match" && c.arguments[0] && ts.isObjectLiteralExpression(c.arguments[0]) && c.arguments[0].properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "created_by")) {
            report(at, table, `.match({ created_by }) filters on the parent owner`, where);
          }
          if ((m === "upsert" || m === "insert") && c.arguments[1] && ts.isObjectLiteralExpression(c.arguments[1])) {
            for (const p of c.arguments[1].properties) {
              if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "onConflict") {
                const v = lit(p.initializer);
                if (v && v.split(",").map((x) => x.trim()).includes("created_by")) report(p, table, `onConflict keys on created_by (the parent owner)`, where);
              }
            }
          }
        }
      }
    }

    // Property reads: x.created_by / x?.created_by / x["created_by"] (not a write target).
    const isRead = (n: ts.Node) => {
      const p = n.parent;
      if (p && ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) return false;
      if (p && (ts.isShorthandPropertyAssignment(p))) return false;
      return true;
    };
    if (ts.isPropertyAccessExpression(node) && node.name.text === "created_by" && isRead(node)) scopeOf(node).reads.push({ node, how: "reads .created_by" });
    if (ts.isElementAccessExpression(node) && lit(node.argumentExpression) === "created_by" && isRead(node)) scopeOf(node).reads.push({ node, how: 'reads ["created_by"]' });
    // Destructuring: const { created_by } = row
    if (ts.isBindingElement(node) && ((node.propertyName && ts.isIdentifier(node.propertyName) && node.propertyName.text === "created_by") || (!node.propertyName && ts.isIdentifier(node.name) && node.name.text === "created_by"))) {
      scopeOf(node).reads.push({ node, how: "destructures created_by" });
    }

    node.forEachChild(visit);
  };
  visit(sf);

  for (const info of scopes.values()) {
    if (info.tables.size === 0) continue;
    const tables = [...info.tables].sort().join(", ");
    for (const r of info.reads) report(r.node, tables, `${r.how} in a scope that reads a component`, scopeName(info.node));
  }
  // de-dup by line
  const seen = new Set<string>();
  return findings.filter((f) => {
    const k = `${f.file}:${f.line}:${f.how}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function listFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // This file's own self-test fixtures are deliberate violations.
  return out.split("\n").filter((f) => f && !SKIP.test(f) && f !== "scripts/check-component-created-by-reads.ts");
}

function refreshRegistry(): void {
  const dir = mkdtempSync(join(tmpdir(), "ccb-"));
  const sql = join(dir, "q.sql");
  writeFileSync(
    sql,
    `select coalesce(json_agg(e.schema_name||'.'||e.table_name order by 1), '[]'::json) as tables
       from platform.entity_types e
      where e.rls_variant = 'component'
        and exists (select 1 from information_schema.columns c
                     where c.table_schema = e.schema_name and c.table_name = e.table_name
                       and c.column_name = 'created_by')`,
  );
  const raw = execFileSync("npx", ["tsx", "scripts/execute-admin-query.ts", "--file", sql], { cwd: ROOT, encoding: "utf8" });
  const parsed = JSON.parse(raw) as { result: { tables: string[] }[] };
  const tables = parsed.result[0]?.tables ?? [];
  if (tables.length === 0) throw new Error("registry refresh returned no component tables — refusing to write an empty registry");
  writeFileSync(
    REGISTRY,
    `${JSON.stringify({ source: "platform.entity_types where rls_variant='component' and has created_by", refreshed: new Date().toISOString().slice(0, 10), tables }, null, 2)}\n`,
  );
  console.log(`component registry refreshed: ${tables.length} tables -> ${REGISTRY}`);
}

function selfTest(): number {
  const reg: Registry = new Set(["canvas.canvas_item_state", "chat.artifact", "chat.message"]);
  const bad = `
    import type { Tables } from "@/types/database.types";
    type ArtifactRow = Tables<{ schema: "chat" }, "artifact">;
    export async function load(userId: string) {
      await supabase.schema("canvas").from("canvas_item_state").select("state").eq("created_by", userId);
      await supabase.schema("canvas").from("canvas_item_state").upsert({ canvas_id: "x" }, { onConflict: "canvas_id,created_by" });
      const { data } = await supabase.schema("chat").from("message").select("id, created_by");
      return data?.map((m) => m.created_by);
    }
    export function toView(row: ArtifactRow) { return { userId: row.created_by }; }
    const q = \`select m.created_by from chat.message m\`;
  `;
  const good = `
    import type { Tables } from "@/types/database.types";
    type ArtifactRow = Tables<{ schema: "chat" }, "artifact">;
    export async function load(userId: string) {
      await supabase.schema("canvas").from("canvas_item_state").select("state").eq("viewer_id", userId);
      await supabase.schema("canvas").from("canvas_item_state").upsert({ canvas_id: "x", created_by: userId }, { onConflict: "canvas_id,viewer_id" });
      const { data } = await supabase.schema("chat").from("message").select("id, updated_by, conversation!inner(created_by)").eq("conversation.created_by", userId);
      return data?.map((m) => m.updated_by);
    }
    export function toView(row: ArtifactRow) { return { userId: row.updated_by }; }
    export function owner(row: ArtifactRow) {
      // component-created-by-ok: the parent conversation's owner, shown as "Owner"
      return row.created_by;
    }
    export async function entityOnly(userId: string) {
      await supabase.schema("chat").from("conversation").select("id").eq("created_by", userId);
    }
  `;
  const bare = `
    export async function f(u: string) {
      // component-created-by-ok:
      await supabase.schema("chat").from("message").select("id").eq("created_by", u);
    }
  `;
  const b = scanSource("self-test/bad.ts", bad, reg);
  const g = scanSource("self-test/good.ts", good, reg);
  const m = scanSource("self-test/bare.ts", bare, reg);
  const typesFile = { file: "self-test/types.ts", text: `export type CxArtifactRow = Tables<{ schema: "chat" }, "artifact">;\n/** @componentRow chat.message */\nexport interface HandRow { created_by: string | null }` };
  const tagged = scanSource("self-test/tagged.ts", `import type { HandRow } from "./types";\nexport const f = (r: HandRow) => r.created_by;`, reg, collectExportedAliases([typesFile], reg));
  const converter = `import type { CxArtifactRow } from "./types";\nexport function rowToRecord(row: CxArtifactRow) { return { userId: row.created_by }; }`;
  const cross = scanSource("self-test/convert.ts", converter, reg, collectExportedAliases([typesFile], reg));
  const crossClean = scanSource("self-test/convert.ts", converter.replace("row.created_by", "row.updated_by"), reg, collectExportedAliases([typesFile], reg));
  const need = ['.eq("created_by")', "onConflict", ".select() reads", "reads .created_by", "SQL text"];
  const missing = need.filter((n) => !b.some((f) => f.how.includes(n)));
  const toViewCaught = b.some((f) => f.scope === "toView");
  const ok = missing.length === 0 && toViewCaught && g.length === 0 && m.length === 1 && cross.length === 1 && crossClean.length === 0 && tagged.length === 1;
  console.log(`self-test: bad=${b.length} finding(s) [missing: ${missing.join("; ") || "none"}; alias read caught: ${toViewCaught}], good=${g.length}, bare-marker=${m.length}, cross-file alias=${cross.length} (fixed: ${crossClean.length}), @componentRow=${tagged.length}`);
  for (const f of [...b, ...g, ...m]) console.log(`  ${f.file}:${f.line} [${f.table}] ${f.how}`);
  console.log(ok ? "SELF-TEST PASSED" : "SELF-TEST FAILED");
  return ok ? 0 : 1;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.includes("--refresh-registry")) {
    refreshRegistry();
    return 0;
  }
  if (args.includes("--self-test")) return selfTest();
  const components = loadRegistry();
  const only = args.filter((a) => !a.startsWith("--"));
  const files = only.length ? only : listFiles();
  const findings: Finding[] = [];
  const texts: { file: string; text: string }[] = [];
  for (const f of only.length ? listFiles() : files) {
    try {
      const text = readFileSync(join(ROOT, f), "utf8");
      if (/\bTables(Insert|Update)?<|\["Tables"\]/.test(text) || text.includes("created_by")) texts.push({ file: f, text });
    } catch {
      /* deleted in the working tree */
    }
  }
  const aliases = collectExportedAliases(texts.filter((t) => /\bTables(Insert|Update)?<|\["Tables"\]/.test(t.text)), components);
  const targets = new Set(files);
  for (const { file, text } of texts) {
    if (!targets.has(file) || !text.includes("created_by")) continue;
    findings.push(...scanSource(file, text, components, aliases));
  }
  console.log(`component created_by reads — ${components.size} component tables, ${files.length} files scanned`);
  if (findings.length === 0) {
    console.log("OK: no code reads a component row's created_by as a person.");
    return 0;
  }
  for (const f of findings) console.log(`  ${f.file}:${f.line} in ${f.scope} [${f.table}] ${f.how}`);
  console.log(`\n${findings.length} read(s) of a component's created_by. On a component that column is the PARENT's owner.`);
  console.log("Read `updated_by` (componentSaver) for who saved it, a named viewer column for per-viewer state,");
  console.log("or mark a genuine parent-owner read: // component-created-by-ok: <why>");
  return 1;
}

process.exit(main());
