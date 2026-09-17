#!/usr/bin/env npx tsx
/**
 * check-org-insert-scope — every write to an organization-scoped table CARRIES
 * the organization. Omitting the column is not "leaving it to the default": it
 * is the personal-workspace substitution, performed by a database trigger.
 *
 * THE LAW: common-docs/policies/context-is-carried-never-rebuilt.md rule 4 —
 * "No personal-organization fallback, no system-organization fallback, no
 * database trigger choosing a tenant."
 *
 * THE FACT this guard exists for (proved live, 2026-09-17):
 * `public._stamp_org_default` is a BEFORE INSERT trigger on 328 tables. When a
 * row arrives with `organization_id` NULL — because the payload omitted the key
 * or sent `x ?? null` — the trigger sets it to the INSERTING USER'S PERSONAL
 * organization. So on the client there is no difference between
 *
 *     .insert({ title })                       // key absent
 *     .insert({ title, organization_id: null }) // key null
 *     .insert({ title, organization_id: orgFromBody ?? null })
 *
 * and writing the person's private workspace by name. The row lands in a tenant
 * nobody selected, nothing throws, nothing logs, and the person cannot find
 * their own work. `check-org-fallback-shapes.ts` cannot see any of it — it reads
 * fallback EXPRESSIONS, and here the substitution is an ABSENCE.
 *
 * WHAT IT DOES (TypeScript AST, never a regex over the text)
 *   1. Derives the organization-scoped table set from `types/database.types.ts`
 *      — every `<schema>.<table>` whose generated `Row` declares
 *      `organization_id`. The generated types are the source of truth, so the
 *      set cannot drift from the database behind the guard's back.
 *   2. Finds every `.insert(` / `.upsert(` in the shipped client and route code
 *      (app/ components/ features/ hooks/ lib/ utils/ providers/; tests,
 *      stories, fixtures and `(dev)` demos excluded), resolves the table from
 *      the `.from("…")` / `.schema("…").from("…")` in the same call chain or
 *      from a same-file helper, and classifies the payload.
 *
 *      A BARE table name says nothing about the schema — the schema was chosen
 *      where the CLIENT was built. So the chain's root is followed to its
 *      definition, across the import when it lives in another module:
 *      `interviewDb(supabase).from("session")` is `interview.session`,
 *      `savedViewDb().from("saved_view")` is `platform.saved_view`. A root the
 *      pass cannot follow is reported UNRESOLVED **by its name** and NEVER
 *      re-homed into `public.` — until 2026-09-17 it was, and `public.session`
 *      (a table this database does not have) read as "not in the generated
 *      types", so the ratchet absorbed the site while all 53 live
 *      `interview.session` rows sat in their creator's personal organization.
 *
 *      `app/api/cms/**` and `app/api/html-pages/**` are OUT OF SCOPE by
 *      declaration (see CMS_PRODUCT_DB_SCOPES) and counted on every run.
 *
 *      The verdicts:
 *
 *      CARRIES     an object literal (or a same-file variable, helper return,
 *                  `.map()` body or spread) that names `organization_id` with a
 *                  non-null source.  → fine, not reported.
 *      MISSING     organization-scoped table, the key is simply absent.
 *      NULLABLE    the key is there but its source can be null — `?? null`,
 *                  `: null`, a same-file variable typed `string | null`.
 *      UNRESOLVED  the payload is built outside this file, or in a shape this
 *                  resolver cannot settle; or the table itself cannot be
 *                  resolved statically. "Anything the resolver cannot settle
 *                  statically FAILS as UNRESOLVED" is this repo's guard law
 *                  (see the realtime-publication guard) — an unmeasured site is
 *                  never a pass.
 *
 * HOW IT FAILS
 *   • NULLABLE fails IMMEDIATELY, always, and is never baselined. A null org is
 *     the trigger firing; there is no such thing as legacy permission for it.
 *   • MISSING and UNRESOLVED are carried in a RATCHETING baseline,
 *     `scripts/org-insert-scope-baseline.json`, so the guard can ship today
 *     against the standing backlog while three conversion lanes work it down.
 *     The baseline ONLY SHRINKS: a NEW site fails by name, and a STALE entry
 *     (a site that was fixed) fails too — with `--fix` as the remedy, which
 *     rewrites the baseline downward. `--fix` REFUSES to absorb growth, and it
 *     still exits 1 while a NULLABLE site exists, because that half is not
 *     baselineable at all.
 *
 * WHAT IT CANNOT SEE (never let a green run imply more than it proves)
 *   • Whether a non-null-looking value is the SELECTED organization or some
 *     other organization — that is `check-org-fallback-shapes.ts`'s question.
 *   • An optional chain (`parent?.organization_id`) — it can produce undefined
 *     and is a real hazard, but flagging it statically would misjudge the
 *     already-narrowed cases, so it reads as CARRIES here.
 *   • Writes that do not go through `.insert(` / `.upsert(` — an RPC that
 *     inserts server-side is judged in the database, not here.
 *
 * Usage:
 *   tsx scripts/check-org-insert-scope.ts              # exit 1 on a violation
 *   tsx scripts/check-org-insert-scope.ts --fix        # ratchet the baseline down
 *   tsx scripts/check-org-insert-scope.ts --self-test  # prove it can fail
 * It runs inside `pnpm check:organization-context`, right after
 * `check-org-fallback-shapes.ts`, which CI runs on every PR.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";
import ts from "typescript";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const DB_TYPES = join(ROOT, "types/database.types.ts");
const BASELINE_PATH = join(ROOT, "scripts/org-insert-scope-baseline.json");

const SCAN_DIRS = [
  "app",
  "components",
  "features",
  "hooks",
  "lib",
  "utils",
  "providers",
];

const SKIP_DIRS = new Set([
  "node_modules",
  "__tests__",
  "__mocks__",
  "fixtures",
  "stories",
  "test",
  "tests",
]);

/** Stands in for a `.from(x)` argument that is not a literal this pass can settle. */
const UNRESOLVED_ARG = "<unresolved-arg>";

/** Stands in for a client wrapper whose schema this pass cannot settle. */
const UNRESOLVED_WRAPPER = "<unresolved-wrapper:";

/**
 * THE CMS IS A SEPARATE PRODUCT DATABASE — declared here by name, never left to
 * fall into UNRESOLVED.
 *
 * `app/api/cms/**` and `app/api/html-pages/**` build their own supabase client
 * against Supabase project `viyklljfdhtidwecakwx` (env
 * `NEXT_PUBLIC_SUPABASE_HTML_URL` + `SUPABASE_HTML_SECRET_KEY`) — the one
 * declared separate PRODUCT database (aidream CLAUDE.md § ONE database). Its
 * tables (`client_sites`, `client_pages`, `client_assets`, `client_components`,
 * `site_collections`, `site_collection_items`, `client_activity_log`,
 * `html_pages`) are NOT in `types/database.types.ts`, are not organization-
 * scoped, and `public._stamp_org_default` does not exist there. Reporting them
 * as UNRESOLVED would park eight permanent entries in a ratchet that is
 * supposed to shrink to zero, and would teach the next agent that an
 * unmeasured site is normal. So they are OUT OF SCOPE by declaration, counted
 * and PRINTED on every run — never silently dropped.
 */
const CMS_PRODUCT_DB_SCOPES: ReadonlyArray<{
  prefix: string;
  client: string;
}> = [
  {
    prefix: "app/api/cms/",
    client: "getCmsClient() — app/api/cms/_lib/cmsDb.ts",
  },
  {
    prefix: "app/api/html-pages/",
    client: "getHtmlAdminClient() — built in the route from NEXT_PUBLIC_SUPABASE_HTML_URL",
  },
];

const cmsScopeFor = (relPath: string) =>
  CMS_PRODUCT_DB_SCOPES.find((scope) => relPath.startsWith(scope.prefix));

/**
 * Client factories that carry NO schema, so `.from("x")` on their result really
 * is `public.x`. Everything else that a chain starts from is treated as a
 * schema wrapper: it is resolved by following it to its definition, and when it
 * cannot be resolved the site is UNRESOLVED **by the wrapper's name** — never
 * re-homed into `public.`, which is how `interviewDb(supabase).from("session")`
 * read as `public.session`, a table the generated types do not have, and got
 * absorbed as "not in types" while 53 of 53 live `interview.session` rows sat
 * in their creator's personal organization.
 */
const PLAIN_CLIENT_FACTORIES = new Set([
  "createClient",
  "createBrowserClient",
  "createServerClient",
  "createAdminClient",
  "createSupabaseClient",
  "getSupabase",
  "getScriptClient",
  "getClient",
  "getServiceClient",
  "getSupabaseClient",
  "getCmsClient",
  "getHtmlAdminClient",
]);

export type Status = "CARRIES" | "MISSING" | "NULLABLE" | "UNRESOLVED";

export interface Site {
  file: string;
  line: number;
  table: string;
  status: Status;
  /** Why, in one phrase — printed with the finding. */
  reason: string;
  /** Identity that survives a line shift: the payload's normalized text. */
  signature: string;
  snippet: string;
}

export interface TableIndex {
  /** `<schema>.<table>` for every generated Row carrying organization_id. */
  orgScoped: Set<string>;
  /** Every `<schema>.<table>` the generated types know about. */
  known: Set<string>;
  /** Bare table name -> every schema that has one, for the `.from("x")` case. */
  byName?: Map<string, string[]>;
}

interface BaselineEntry {
  file: string;
  table: string;
  status: "MISSING" | "UNRESOLVED";
  signature: string;
}

interface Baseline {
  _comment: string;
  seeded_at: string;
  count: number;
  sites: BaselineEntry[];
}

/* ------------------------------------------------------------------ *
 * 1. The organization-scoped table set, derived from the generated types
 * ------------------------------------------------------------------ */

export function buildTableIndex(source: string): TableIndex {
  const sf = ts.createSourceFile(
    "database.types.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const orgScoped = new Set<string>();
  const known = new Set<string>();

  const memberNamed = (
    type: ts.TypeNode | undefined,
    name: string,
  ): ts.TypeLiteralNode | undefined => {
    if (!type || !ts.isTypeLiteralNode(type)) return undefined;
    for (const member of type.members) {
      if (!ts.isPropertySignature(member) || !member.name) continue;
      const memberName = ts.isIdentifier(member.name)
        ? member.name.text
        : ts.isStringLiteral(member.name)
          ? member.name.text
          : "";
      if (memberName !== name) continue;
      const inner = member.type;
      return inner && ts.isTypeLiteralNode(inner) ? inner : undefined;
    }
    return undefined;
  };

  const propertyNames = (type: ts.TypeLiteralNode): string[] => {
    const names: string[] = [];
    for (const member of type.members) {
      if (!ts.isPropertySignature(member) || !member.name) continue;
      names.push(
        ts.isIdentifier(member.name)
          ? member.name.text
          : ts.isStringLiteral(member.name)
            ? member.name.text
            : "",
      );
    }
    return names;
  };

  for (const statement of sf.statements) {
    if (
      !ts.isTypeAliasDeclaration(statement) ||
      statement.name.text !== "Database" ||
      !ts.isTypeLiteralNode(statement.type)
    ) {
      continue;
    }
    for (const schemaMember of statement.type.members) {
      if (!ts.isPropertySignature(schemaMember) || !schemaMember.name) continue;
      const schema = ts.isIdentifier(schemaMember.name)
        ? schemaMember.name.text
        : ts.isStringLiteral(schemaMember.name)
          ? schemaMember.name.text
          : "";
      if (!schema || schema === "__InternalSupabase") continue;
      const tables = memberNamed(schemaMember.type, "Tables");
      if (!tables) continue;
      for (const tableMember of tables.members) {
        if (!ts.isPropertySignature(tableMember) || !tableMember.name) continue;
        const table = ts.isIdentifier(tableMember.name)
          ? tableMember.name.text
          : ts.isStringLiteral(tableMember.name)
            ? tableMember.name.text
            : "";
        if (!table) continue;
        known.add(`${schema}.${table}`);
        const row = memberNamed(tableMember.type, "Row");
        if (row && propertyNames(row).includes("organization_id")) {
          orgScoped.add(`${schema}.${table}`);
        }
      }
    }
  }
  const byName = new Map<string, string[]>();
  for (const qualified of known) {
    const [schema, ...rest] = qualified.split(".");
    const table = rest.join(".");
    const schemas = byName.get(table) ?? [];
    schemas.push(schema);
    byName.set(table, schemas);
  }
  return { orgScoped, known, byName };
}

/**
 * A `.from("tasks")` whose `.schema(...)` was applied to the client somewhere
 * this pass cannot see reads as `public.tasks`. When `public` has no such table
 * and EXACTLY ONE schema does, that is the table — the generated types describe
 * the whole database, so a unique bare name is unambiguous. Two candidates
 * (`crm.saved_view` / `platform.saved_view`) stay unresolved, and so does a
 * name the types do not know at all (the CMS is a separate product database).
 */
function disambiguate(index: TableIndex, table: string): string {
  if (index.known.has(table)) return table;
  if (!table.startsWith("public.")) return table;
  const bare = table.slice("public.".length);
  const byName =
    index.byName ??
    (() => {
      const map = new Map<string, string[]>();
      for (const qualified of index.known) {
        const [schema, ...rest] = qualified.split(".");
        const name = rest.join(".");
        const schemas = map.get(name) ?? [];
        schemas.push(schema);
        map.set(name, schemas);
      }
      index.byName = map;
      return map;
    })();
  const candidates = byName.get(bare) ?? [];
  return candidates.length === 1 ? `${candidates[0]}.${bare}` : table;
}

/* ------------------------------------------------------------------ *
 * 2. The per-file scan
 * ------------------------------------------------------------------ */

interface FileCtx {
  sf: ts.SourceFile;
  /** Repo-relative path of the file being scanned — the anchor every relative import resolves against. */
  file: string;
  vars: Map<string, ts.VariableDeclaration>;
  fns: Map<string, ts.Node>;
  imported: Set<string>;
  /** local name -> { module specifier, name inside that module } */
  importSources: Map<string, { module: string; exported: string }>;
}

function unwrap(node: ts.Expression): ts.Expression {
  let current: ts.Expression = node;
  for (;;) {
    if (ts.isParenthesizedExpression(current)) current = current.expression;
    else if (ts.isAwaitExpression(current)) current = current.expression;
    else if (ts.isNonNullExpression(current)) current = current.expression;
    else if (ts.isAsExpression(current)) current = current.expression;
    else if (ts.isSatisfiesExpression(current)) current = current.expression;
    else if (ts.isTypeAssertionExpression?.(current)) current = current.expression;
    else return current;
  }
}

function buildFileCtx(sf: ts.SourceFile, file: string): FileCtx {
  const vars = new Map<string, ts.VariableDeclaration>();
  const fns = new Map<string, ts.Node>();
  const imported = new Set<string>();
  const importSources = new Map<string, { module: string; exported: string }>();

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const init = node.initializer;
      if (
        init &&
        (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
      ) {
        fns.set(node.name.text, init);
      }
      if (!vars.has(node.name.text)) vars.set(node.name.text, node);
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      fns.set(node.name.text, node);
    }
    if (ts.isImportDeclaration(node) && node.importClause) {
      const clause = node.importClause;
      const module = ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : "";
      if (clause.name) {
        imported.add(clause.name.text);
        importSources.set(clause.name.text, { module, exported: "default" });
      }
      if (clause.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            imported.add(element.name.text);
            importSources.set(element.name.text, {
              module,
              exported: (element.propertyName ?? element.name).text,
            });
          }
        } else {
          imported.add(clause.namedBindings.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { sf, file, vars, fns, imported, importSources };
}

/* ------------------------------------------------------------------ *
 * 2b. Which SCHEMA the chain's root client carries
 *
 * A bare `.from("session")` says nothing about the schema: the schema was
 * chosen where the client was BUILT — `interviewDb(supabase)` (imported from
 * utils/supabase/interviewDb.ts), `savedViewDb()` (a same-file helper returning
 * `supabase.schema("platform")`), `const db = supabase.schema("crm")`. So the
 * root is FOLLOWED TO ITS DEFINITION, across the import when it lives in
 * another module, and the schema it applies is the table's schema.
 * ------------------------------------------------------------------ */

/** Parsed source files, keyed by absolute path — a wrapper module is read once. */
const moduleCache = new Map<string, ts.SourceFile | null>();

function loadModule(absPath: string): ts.SourceFile | null {
  const cached = moduleCache.get(absPath);
  if (cached !== undefined) return cached;
  let sf: ts.SourceFile | null = null;
  try {
    const source = readFileSync(absPath, "utf8");
    sf = ts.createSourceFile(
      absPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      absPath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
  } catch {
    sf = null;
  }
  moduleCache.set(absPath, sf);
  return sf;
}

/** `@/utils/supabase/interviewDb` / `./filesDb` -> the file on disk, or undefined. */
function resolveModuleFile(spec: string, fromFile: string): string | undefined {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) {
    base = resolve(join(ROOT, fromFile, ".."), spec);
  } else return undefined; // a package import — not our wrapper
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** The declaration of `name` at the top level of `sf`, if it has one. */
function topLevelDeclaration(sf: ts.SourceFile, name: string): ts.Node | undefined {
  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement;
    }
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) return decl;
      }
    }
  }
  return undefined;
}

/** The import of `name` in `sf`, if it has one. */
function importOf(
  sf: ts.SourceFile,
  name: string,
): { module: string; exported: string } | undefined {
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const module = ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : "";
    const clause = statement.importClause;
    if (clause.name?.text === name) return { module, exported: "default" };
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.name.text === name) {
          return { module, exported: (element.propertyName ?? element.name).text };
        }
      }
    }
  }
  return undefined;
}

/** Every distinct `.schema("literal")` applied inside a declaration's value. */
function schemasInNode(node: ts.Node): Set<string> {
  const found = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "schema" &&
      n.arguments.length === 1
    ) {
      const arg = unwrap(n.arguments[0]);
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
        found.add(arg.text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** Calls this declaration hands its result back from — `return webDb(client)`. */
function delegatedCallNames(node: ts.Node): string[] {
  const names: string[] = [];
  const fromExpression = (expr: ts.Expression): void => {
    let current: ts.Node = unwrap(expr);
    while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
      if (ts.isCallExpression(current)) {
        const callee = unwrap(current.expression);
        if (ts.isIdentifier(callee)) {
          names.push(callee.text);
          return;
        }
        current = callee;
      } else current = current.expression;
    }
  };
  if (ts.isVariableDeclaration(node) && node.initializer) {
    const init = unwrap(node.initializer);
    if (ts.isArrowFunction(init) && !ts.isBlock(init.body)) fromExpression(init.body);
    else if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      for (const r of returnExpressions(init)) fromExpression(r);
    } else fromExpression(init);
    return names;
  }
  for (const r of returnExpressions(node)) fromExpression(r);
  return names;
}

/**
 * The schema a named client source applies, following same-file declarations
 * and imports. Returns "" when the name resolves to something that applies NO
 * schema (a plain client), and undefined when it cannot be settled at all.
 */
function schemaOfName(
  name: string,
  sf: ts.SourceFile,
  file: string,
  depth = 0,
): string | "" | undefined {
  if (depth > 3) return undefined;
  if (PLAIN_CLIENT_FACTORIES.has(name)) return "";

  const decl = topLevelDeclaration(sf, name);
  if (decl) {
    const schemas = schemasInNode(decl);
    if (schemas.size === 1) return [...schemas][0];
    if (schemas.size > 1) return undefined; // several schemas in one wrapper: not settleable
    for (const delegate of delegatedCallNames(decl)) {
      const inherited = schemaOfName(delegate, sf, file, depth + 1);
      if (inherited) return inherited;
      if (inherited === "") return "";
    }
    return "";
  }

  const imported = importOf(sf, name);
  if (!imported) return undefined;
  const target = resolveModuleFile(imported.module, file);
  if (!target) return undefined; // a package import — never a schema wrapper of ours
  const targetSf = loadModule(target);
  if (!targetSf) return undefined;
  return schemaOfName(
    imported.exported === "default" ? name : imported.exported,
    targetSf,
    relative(ROOT, target),
    depth + 1,
  );
}

/** The schema the chain's root applies, as seen from the file being scanned. */
function schemaOfRoot(name: string, ctx: FileCtx): string | "" | undefined {
  return schemaOfName(name, ctx.sf, ctx.file);
}

/** The `<schema>.<table>` a call chain writes to, or "" when unresolvable. */
function resolveTable(
  chain: ts.Expression,
  ctx: FileCtx,
  depth = 0,
): string {
  if (depth > 3) return "";
  const parts: string[] = [];
  let current: ts.Node | undefined = chain;
  let rootIdentifier = "";
  let rootCall: ts.CallExpression | undefined;

  while (current) {
    if (ts.isCallExpression(current)) {
      const callee: ts.Expression = current.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const method = callee.name.text;
        if (method === "from" || method === "schema") {
          const arg = current.arguments[0];
          const literal = arg ? literalString(arg, ctx) : "";
          if (literal) parts.push(literal);
          else parts.push(UNRESOLVED_ARG);
        }
        current = callee.expression;
      } else if (ts.isIdentifier(callee)) {
        rootIdentifier = callee.text;
        rootCall = current;
        current = undefined;
      } else {
        current = callee;
      }
    } else if (ts.isPropertyAccessExpression(current)) {
      current = current.expression;
    } else if (ts.isIdentifier(current)) {
      rootIdentifier = current.text;
      current = undefined;
    } else if (ts.isNonNullExpression(current) || ts.isParenthesizedExpression(current) || ts.isAwaitExpression(current)) {
      current = current.expression;
    } else {
      current = undefined;
    }
  }

  parts.reverse();
  const resolved = parts.join(".");
  if (resolved.includes(UNRESOLVED_ARG)) return "";
  if (resolved) {
    // `.schema("x").from("y")` / `.from("schema.table")` already carry both halves.
    if (resolved.includes(".")) return resolved;
    // A BARE table name: its schema is whatever the chain's ROOT applied.
    if (rootIdentifier) {
      const schema = schemaOfRoot(rootIdentifier, ctx);
      if (schema) return `${schema}.${resolved}`;
      if (schema === undefined && rootCall) {
        // A wrapper that could not be followed. Re-homing it into `public.`
        // invents a table the database does not have and lets the ratchet
        // absorb it; an unmeasured site is never a pass, so it is reported
        // BY NAME instead.
        return `${UNRESOLVED_WRAPPER}${rootIdentifier}()>`;
      }
    }
    return `public.${resolved}`;
  }

  // No `.from()` in this chain: the client came from a same-file helper or
  // variable that already carries it.
  const source = rootCall
    ? ctx.fns.get(rootIdentifier)
    : ctx.vars.get(rootIdentifier)?.initializer;
  if (!source) return "";
  return findFirstFromChain(source, ctx, depth + 1);
}

/** First `.from(...)` chain inside a helper body / initializer. */
function findFirstFromChain(node: ts.Node, ctx: FileCtx, depth: number): string {
  let found = "";
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "from"
    ) {
      const resolved = resolveTable(n, ctx, depth);
      if (resolved) {
        found = resolved;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function literalString(arg: ts.Expression, ctx: FileCtx): string {
  const node = unwrap(arg);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    const decl = ctx.vars.get(node.text);
    const init = decl?.initializer ? unwrap(decl.initializer) : undefined;
    if (init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))) {
      return init.text;
    }
  }
  return "";
}

const WORSE: Record<Status, number> = {
  CARRIES: 0,
  UNRESOLVED: 1,
  MISSING: 2,
  NULLABLE: 3,
};

interface Verdict {
  status: Status;
  reason: string;
}

const worst = (verdicts: Verdict[]): Verdict =>
  verdicts.reduce(
    (acc, v) => (WORSE[v.status] > WORSE[acc.status] ? v : acc),
    verdicts[0] ?? { status: "UNRESOLVED", reason: "empty payload" },
  );

function typeNodeIsNullable(type: ts.TypeNode | undefined): boolean {
  if (!type) return false;
  if (ts.isUnionTypeNode(type)) {
    return type.types.some((t) => typeNodeIsNullable(t));
  }
  if (type.kind === ts.SyntaxKind.NullKeyword) return true;
  if (type.kind === ts.SyntaxKind.UndefinedKeyword) return true;
  if (ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword) {
    return true;
  }
  return false;
}

/** `?? null`, `: null`, a same-file source declared `| null`. */
function isNullableOrgValue(
  expr: ts.Expression,
  ctx: FileCtx,
  depth = 0,
): boolean {
  if (depth > 4) return false;
  const node = unwrap(expr);

  if (node.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isIdentifier(node) && node.text === "undefined") return true;

  if (ts.isAsExpression(expr) && typeNodeIsNullable(expr.type)) return true;

  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (
      op === ts.SyntaxKind.QuestionQuestionToken ||
      op === ts.SyntaxKind.BarBarToken
    ) {
      return isNullableOrgValue(node.right, ctx, depth + 1);
    }
  }

  if (ts.isConditionalExpression(node)) {
    return (
      isNullableOrgValue(node.whenTrue, ctx, depth + 1) ||
      isNullableOrgValue(node.whenFalse, ctx, depth + 1)
    );
  }

  if (ts.isIdentifier(node)) {
    const decl = ctx.vars.get(node.text);
    if (!decl) return false;
    if (typeNodeIsNullable(decl.type)) return true;
    if (decl.initializer) {
      return isNullableOrgValue(decl.initializer, ctx, depth + 1);
    }
  }
  return false;
}

function objectOrgProperty(
  obj: ts.ObjectLiteralExpression,
): { value: ts.Expression | null; found: boolean; spreads: ts.Expression[] } {
  const spreads: ts.Expression[] = [];
  for (const prop of obj.properties) {
    if (ts.isSpreadAssignment(prop)) {
      spreads.push(prop.expression);
      continue;
    }
    const name =
      prop.name && ts.isIdentifier(prop.name)
        ? prop.name.text
        : prop.name && ts.isStringLiteral(prop.name)
          ? prop.name.text
          : "";
    if (name !== "organization_id") continue;
    if (ts.isPropertyAssignment(prop)) {
      return { value: prop.initializer, found: true, spreads };
    }
    if (ts.isShorthandPropertyAssignment(prop)) {
      return { value: prop.name, found: true, spreads };
    }
    return { value: null, found: true, spreads };
  }
  return { value: null, found: false, spreads };
}

function returnExpressions(fn: ts.Node): ts.Expression[] {
  const out: ts.Expression[] = [];
  if (
    (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn)) &&
    fn.body
  ) {
    if (ts.isArrowFunction(fn) && fn.body && !ts.isBlock(fn.body)) {
      out.push(fn.body);
      return out;
    }
    const visit = (n: ts.Node): void => {
      if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) return;
      if (ts.isArrowFunction(n) && n !== fn) return;
      if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(fn.body, visit);
  }
  return out;
}

export function classifyPayload(
  expr: ts.Expression,
  ctx: FileCtx,
  depth = 0,
): Verdict {
  if (depth > 4) {
    return { status: "UNRESOLVED", reason: "payload nested deeper than the resolver follows" };
  }
  const node = unwrap(expr);

  if (ts.isObjectLiteralExpression(node)) {
    const { value, found, spreads } = objectOrgProperty(node);
    if (found) {
      if (!value) {
        return { status: "UNRESOLVED", reason: "organization_id is a computed/accessor property" };
      }
      if (isNullableOrgValue(value, ctx)) {
        return {
          status: "NULLABLE",
          reason: "organization_id can be null — the BEFORE INSERT trigger then stamps the personal organization",
        };
      }
      return { status: "CARRIES", reason: "organization_id carried" };
    }
    if (spreads.length > 0) {
      const verdicts = spreads.map((s) => classifyPayload(s, ctx, depth + 1));
      const best = verdicts.reduce(
        (acc, v) => (WORSE[v.status] < WORSE[acc.status] ? v : acc),
        verdicts[0],
      );
      if (best.status === "CARRIES") return best;
      if (verdicts.some((v) => v.status === "UNRESOLVED")) {
        return {
          status: "UNRESOLVED",
          reason: "payload spreads an object built outside this file",
        };
      }
      return { status: "MISSING", reason: "organization_id absent from the payload and from every spread" };
    }
    return { status: "MISSING", reason: "organization_id absent from the payload" };
  }

  if (ts.isArrayLiteralExpression(node)) {
    if (node.elements.length === 0) {
      return { status: "UNRESOLVED", reason: "empty array payload" };
    }
    return worst(
      node.elements.map((e) =>
        ts.isSpreadElement(e)
          ? { status: "UNRESOLVED" as Status, reason: "array payload spreads rows built elsewhere" }
          : classifyPayload(e, ctx, depth + 1),
      ),
    );
  }

  if (ts.isConditionalExpression(node)) {
    return worst([
      classifyPayload(node.whenTrue, ctx, depth + 1),
      classifyPayload(node.whenFalse, ctx, depth + 1),
    ]);
  }

  if (ts.isIdentifier(node)) {
    if (ctx.imported.has(node.text)) {
      return { status: "UNRESOLVED", reason: `payload \`${node.text}\` is imported from another module` };
    }
    const decl = ctx.vars.get(node.text);
    if (decl?.initializer) return classifyPayload(decl.initializer, ctx, depth + 1);
    return { status: "UNRESOLVED", reason: `payload \`${node.text}\` is not built in this file` };
  }

  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    // `rows.map((r) => ({ … }))`
    if (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === "map" &&
      node.arguments.length > 0
    ) {
      const fn = unwrap(node.arguments[0]);
      if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
        const returns = returnExpressions(fn);
        if (returns.length > 0) {
          return worst(returns.map((r) => classifyPayload(r, ctx, depth + 1)));
        }
      }
      return { status: "UNRESOLVED", reason: "payload is mapped by a callback this resolver cannot settle" };
    }
    if (ts.isIdentifier(callee)) {
      if (ctx.imported.has(callee.text)) {
        return {
          status: "UNRESOLVED",
          reason: `payload comes from \`${callee.text}()\`, imported from another module`,
        };
      }
      const fn = ctx.fns.get(callee.text);
      if (fn) {
        const returns = returnExpressions(fn);
        if (returns.length > 0) {
          return worst(returns.map((r) => classifyPayload(r, ctx, depth + 1)));
        }
      }
    }
    return { status: "UNRESOLVED", reason: "payload is a call this resolver cannot settle" };
  }

  return {
    status: "UNRESOLVED",
    reason: `payload is a ${ts.SyntaxKind[node.kind]} this resolver cannot settle`,
  };
}

const normalize = (text: string): string =>
  text.replace(/\s+/g, " ").trim().slice(0, 140);

export function scanSource(
  relPath: string,
  source: string,
  index: TableIndex,
): Site[] {
  const sf = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const ctx = buildFileCtx(sf, relPath);
  const sites: Site[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "insert" ||
        node.expression.name.text === "upsert") &&
      node.arguments.length > 0
    ) {
      const table = disambiguate(index, resolveTable(node.expression.expression, ctx));
      const known = table && index.known.has(table);
      const orgScoped = table && index.orgScoped.has(table);

      if (known && !orgScoped) {
        // The table has no organization_id column at all — nothing to carry.
      } else {
        const payload = node.arguments[0];
        const line =
          sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const verdict: Verdict = !table
          ? {
              status: "UNRESOLVED",
              reason: "the table cannot be resolved statically from this call chain",
            }
          : table.startsWith(UNRESOLVED_WRAPPER)
            ? {
                status: "UNRESOLVED",
                reason: `the schema is applied by \`${table.slice(UNRESOLVED_WRAPPER.length, -1)}\`, which this pass cannot follow — the table is NOT assumed to be in \`public\``,
              }
            : !known
            ? {
                status: "UNRESOLVED",
                reason: `\`${table}\` is not in types/database.types.ts — its scope cannot be proved`,
              }
            : classifyPayload(payload, ctx);

        if (verdict.status !== "CARRIES") {
          sites.push({
            file: relPath,
            line,
            table: table || "<unresolved>",
            status: verdict.status,
            reason: verdict.reason,
            signature: normalize(payload.getText(sf)),
            snippet: normalize(node.getText(sf)).slice(0, 160),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return sites;
}

/* ------------------------------------------------------------------ *
 * 3. Walking the repo
 * ------------------------------------------------------------------ */

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "(dev)") continue;
      yield* walk(full);
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec|stories|dev)\.tsx?$/.test(name) &&
      !/\.d\.ts$/.test(name)
    ) {
      yield full;
    }
  }
}

const keyOf = (s: { file: string; table: string; status: string; signature: string }) =>
  [s.file, s.table, s.status, s.signature].join(" :: ");

function readBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  } catch (err) {
    console.error(
      `[check:org-insert-scope] ${BASELINE_PATH} is unreadable (${String(err)}). A baseline that cannot be read is not a baseline.`,
    );
    return null;
  }
}

function writeBaseline(sites: Site[]): void {
  const entries: BaselineEntry[] = sites
    .filter((s) => s.status === "MISSING" || s.status === "UNRESOLVED")
    .map((s) => ({
      file: s.file,
      table: s.table,
      status: s.status as "MISSING" | "UNRESOLVED",
      signature: s.signature,
    }))
    .sort((a, b) =>
      keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0,
    );
  const baseline: Baseline = {
    _comment:
      "RATCHET — organization-scoped writes that do not yet carry the organization. `public._stamp_org_default` stamps the writer's PERSONAL organization on any NULL, so every entry here is a row that can silently land in a workspace nobody selected (common-docs/policies/context-is-carried-never-rebuilt.md rule 4). This list may only SHRINK: a NEW site fails immediately, a fixed one fails as STALE until `tsx scripts/check-org-insert-scope.ts --fix` rewrites it downward, and NULLABLE is never carried here at all. Line numbers are deliberately absent — an entry is identified by file + table + payload text, so unrelated edits above it do not churn the file.",
    seeded_at: new Date().toISOString(),
    count: entries.length,
    sites: entries,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

const REMEDY =
  "Fix: read the selected organization — `getActiveOrgId()` / `ensureOrgId(explicit)` (or `selectOrganizationId` in React), or take the PARENT record's `organization_id` — and put it in the payload. A write never leaves it to the trigger: `public._stamp_org_default` fires BEFORE INSERT on 328 tables and stamps the writer's PERSONAL organization, so an absent or null key IS the personal-workspace substitution. When there is no selection, REFUSE — `OrganizationContextError(\"Select an organization before sending this request.\")`, which every surface already renders as `OrganizationRequiredNotice`.";

const LAW =
  "THE LAW: common-docs/policies/context-is-carried-never-rebuilt.md rule 4 — the actor and the organization are minted at the boundary and CARRIED; nothing below it invents, defaults or substitutes them, and no database trigger chooses a tenant.";

/* ------------------------------------------------------------------ *
 * 4. Self-test — prove the guard can fail
 * ------------------------------------------------------------------ */

function selfTest(): number {
  const index: TableIndex = {
    // `assignment.session` and `crm.saved_view` are here on purpose: they are
    // the real second candidates for those bare names, and without them the
    // one-candidate fallback would rescue a misresolved `public.session` and
    // the fixtures below could not fail.
    orgScoped: new Set([
      "agent.definition",
      "assignment.session",
      "chat.artifact",
      "crm.saved_view",
      "interview.session",
      "platform.saved_view",
      "public.tasks",
      "public.notes",
    ]),
    known: new Set([
      "agent.definition",
      "assignment.session",
      "chat.artifact",
      "crm.saved_view",
      "interview.session",
      "platform.saved_view",
      "public.tasks",
      "public.notes",
      "public.app_telemetry",
    ]),
  };

  const offenders: Array<{
    label: string;
    expect: Status;
    code: string;
    /** When set, the resolved table must be exactly this — the schema half of the verdict. */
    expectTable?: string;
  }> = [
    {
      // THE MISRESOLUTION THIS GUARD SHIPPED WITH (fixed 2026-09-17): the schema
      // is applied by the IMPORTED wrapper, so `.from("session")` is
      // `interview.session` — and `public.session`, which the database does not
      // have, used to read as "not in types" and get absorbed by the ratchet
      // while every live row sat in its creator's personal organization.
      label: "an imported schema wrapper (`interviewDb(supabase).from(\"session\")`)",
      expect: "MISSING",
      expectTable: "interview.session",
      code: [
        'import { interviewDb } from "@/utils/supabase/interviewDb";',
        "export async function create(supabase: any, title: string) {",
        '  await interviewDb(supabase).from("session").insert({ title });',
        "}",
      ].join("\n"),
    },
    {
      label: "a same-file wrapper that applies the schema (`savedViewDb().from(\"saved_view\")`)",
      expect: "MISSING",
      expectTable: "platform.saved_view",
      code: [
        'import { supabase } from "@/utils/supabase/client";',
        "function savedViewDb() {",
        '  return supabase.schema("platform");',
        "}",
        "export async function create(name: string) {",
        '  await savedViewDb().from("saved_view").insert({ name });',
        "}",
      ].join("\n"),
    },
    {
      label: "a wrapper this pass cannot follow — reported BY NAME, never re-homed into `public.`",
      expect: "UNRESOLVED",
      expectTable: "<unresolved-wrapper:mysteryDb()>",
      code: [
        'import { mysteryDb } from "@some/external-package";',
        "export async function create(supabase: any, title: string) {",
        '  await mysteryDb(supabase).from("session").insert({ title });',
        "}",
      ].join("\n"),
    },
    {
      label: "an org-scoped insert with the key absent (the trigger stamps the personal org)",
      expect: "MISSING",
      code: [
        "export async function create(supabase: any, name: string, user: { id: string }) {",
        '  await supabase.schema("agent").from("definition").insert({ name, created_by: user.id });',
        "}",
      ].join("\n"),
    },
    {
      label: "an explicit null organization (same trigger)",
      expect: "NULLABLE",
      code: [
        "export async function create(supabase: any, title: string, orgFromBody: string | null) {",
        '  await supabase.schema("chat").from("artifact").insert({ title, organization_id: orgFromBody ?? null });',
        "}",
      ].join("\n"),
    },
    {
      label: "a first-membership pick that ends in null",
      expect: "NULLABLE",
      code: [
        "export async function create(db: any, title: string, selectedOrgId: string | null, orgs: { id: string }[]) {",
        "  const organizationId = selectedOrgId ?? orgs[0]?.id ?? null;",
        '  await db.from("tasks").insert({ title, organization_id: organizationId });',
        "}",
      ].join("\n"),
    },
    {
      label: "a payload variable typed `string | null`",
      expect: "NULLABLE",
      code: [
        "export async function create(db: any, title: string) {",
        "  const organizationId: string | null = readSomething();",
        '  await db.from("notes").insert({ organization_id: organizationId, title });',
        "}",
        "declare function readSomething(): string | null;",
      ].join("\n"),
    },
    {
      label: "a payload built in another module",
      expect: "UNRESOLVED",
      code: [
        'import { buildRow } from "@/features/x/buildRow";',
        "export async function create(db: any) {",
        '  await db.from("tasks").insert(buildRow());',
        "}",
      ].join("\n"),
    },
    {
      label: "a table that cannot be resolved from the call chain",
      expect: "UNRESOLVED",
      code: [
        "export async function create(db: any, table: string, row: { title: string }) {",
        "  await db.from(table).insert(row);",
        "}",
      ].join("\n"),
    },
    {
      label: "a row spread from an object that has no organization",
      expect: "MISSING",
      code: [
        "export async function create(db: any, title: string) {",
        "  const base = { title, created_at: new Date().toISOString() };",
        '  await db.from("notes").insert({ ...base });',
        "}",
      ].join("\n"),
    },
    {
      label: "an array of rows where one row omits the organization",
      expect: "MISSING",
      code: [
        "export async function create(db: any, organizationId: string) {",
        '  await db.from("tasks").insert([{ title: "a", organization_id: organizationId }, { title: "b" }]);',
        "}",
      ].join("\n"),
    },
  ];

  for (const [i, testCase] of offenders.entries()) {
    const rel = `offender-${i}.ts`;
    const sites = scanSource(rel, testCase.code, index);
    const hit = sites.find(
      (s) =>
        s.status === testCase.expect &&
        (!testCase.expectTable || s.table === testCase.expectTable),
    );
    if (!hit) {
      console.error(
        `[check:org-insert-scope] SELF-TEST FAILED — expected ${testCase.expect}${
          testCase.expectTable ? ` on \`${testCase.expectTable}\`` : ""
        } for ${testCase.label}; got ${
          sites.length === 0
            ? "nothing at all"
            : sites.map((s) => `${s.status} on \`${s.table}\``).join(", ")
        }. The guard can no longer fail on that shape, so a green run proves nothing.`,
      );
      return 1;
    }
  }

  // Compliant code — none of it may be flagged.
  const clean = [
    'import { ensureOrgId } from "@/lib/organizations/activeOrg";',
    "export async function create(db: any, title: string, explicit?: string) {",
    "  const organizationId = await ensureOrgId(explicit);",
    '  await db.schema("agent").from("definition").insert({ name: title, organization_id: organizationId });',
    '  await db.from("tasks").insert([{ title, organization_id: organizationId }]);',
    "  const row = { title, organization_id: organizationId };",
    '  await db.from("notes").upsert(row);',
    '  await db.from("notes").insert({ ...row, pinned: true });',
    '  await db.from("app_telemetry").insert({ event: "created" });',
    "}",
  ].join("\n");
  const cleanHits = scanSource("clean.ts", clean, index);
  if (cleanHits.length !== 0) {
    console.error(
      `[check:org-insert-scope] SELF-TEST FAILED — the guard flagged compliant code (${cleanHits
        .map((h) => `${h.line}:${h.status}:${h.reason}`)
        .join(", ")}), which would push people off the canonical primitives.`,
    );
    return 1;
  }

  // The derivation half: a generated-types fragment must yield the org-scoped set.
  const typesFragment = [
    "export type Database = {",
    "  agent: { Tables: { definition: { Row: { id: string; organization_id: string }; Insert: { id?: string } } } }",
    "  telemetry: { Tables: { event: { Row: { id: string; payload: unknown }; Insert: { id?: string } } } }",
    "}",
  ].join("\n");
  const derived = buildTableIndex(typesFragment);
  if (
    !derived.orgScoped.has("agent.definition") ||
    derived.orgScoped.has("telemetry.event") ||
    !derived.known.has("telemetry.event")
  ) {
    console.error(
      "[check:org-insert-scope] SELF-TEST FAILED — the organization-scoped table set is not derived correctly from the generated types; every verdict downstream would be judged against the wrong set.",
    );
    return 1;
  }

  console.log(
    `[check:org-insert-scope] self-test OK — derives the org-scoped table set from the generated types, flags all ${offenders.length} unscoped-write shapes (MISSING / NULLABLE / UNRESOLVED), and passes compliant writes and a non-org-scoped table.`,
  );
  return 0;
}

/* ------------------------------------------------------------------ *
 * 5. main
 * ------------------------------------------------------------------ */

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return selfTest();
  const fix = argv.includes("--fix");

  let index: TableIndex;
  try {
    index = buildTableIndex(readFileSync(DB_TYPES, "utf8"));
  } catch (err) {
    console.error(
      `[check:org-insert-scope] cannot read ${relative(ROOT, DB_TYPES)} (${String(err)}). The organization-scoped table set is derived from it; without it this guard is UNMEASURED, never a pass.`,
    );
    return 2;
  }
  if (index.orgScoped.size === 0) {
    console.error(
      "[check:org-insert-scope] the generated types yielded ZERO organization-scoped tables. That cannot be true — treat this as UNMEASURED and fix the derivation, never as a pass.",
    );
    return 2;
  }

  const sites: Site[] = [];
  let scanned = 0;
  let cmsFiles = 0;
  const self = relative(ROOT, join(ROOT, "scripts/check-org-insert-scope.ts"));

  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = relative(ROOT, file);
      if (rel === self) continue;
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      scanned += 1;
      if (!source.includes(".insert(") && !source.includes(".upsert(")) continue;
      const cms = cmsScopeFor(rel);
      if (cms) {
        // Declared out of scope, not silently dropped — counted and printed.
        cmsFiles += 1;
        continue;
      }
      sites.push(...scanSource(rel, source, index));
    }
  }

  const nullable = sites.filter((s) => s.status === "NULLABLE");
  const ratcheted = sites.filter(
    (s) => s.status === "MISSING" || s.status === "UNRESOLVED",
  );
  const missing = sites.filter((s) => s.status === "MISSING");
  const unresolved = sites.filter((s) => s.status === "UNRESOLVED");

  const baseline = readBaseline();
  const baselineCounts = new Map<string, number>();
  for (const entry of baseline?.sites ?? []) {
    baselineCounts.set(keyOf(entry), (baselineCounts.get(keyOf(entry)) ?? 0) + 1);
  }
  const currentCounts = new Map<string, number>();
  for (const site of ratcheted) {
    currentCounts.set(keyOf(site), (currentCounts.get(keyOf(site)) ?? 0) + 1);
  }

  const fresh: Site[] = [];
  if (baseline) {
    const remaining = new Map(baselineCounts);
    for (const site of ratcheted) {
      const left = remaining.get(keyOf(site)) ?? 0;
      if (left > 0) remaining.set(keyOf(site), left - 1);
      else fresh.push(site);
    }
  }
  const stale: BaselineEntry[] = [];
  if (baseline) {
    const remaining = new Map(currentCounts);
    for (const entry of baseline.sites) {
      const left = remaining.get(keyOf(entry)) ?? 0;
      if (left > 0) remaining.set(keyOf(entry), left - 1);
      else stale.push(entry);
    }
  }

  console.log(
    `[check:org-insert-scope] ${scanned} files scanned · ${index.orgScoped.size} organization-scoped tables · ${sites.length} unscoped write site(s): ${missing.length} MISSING, ${nullable.length} NULLABLE, ${unresolved.length} UNRESOLVED (baseline holds ${baseline?.sites.length ?? 0}).`,
  );
  console.log(
    `[check:org-insert-scope] ${cmsFiles} writing file(s) under ${CMS_PRODUCT_DB_SCOPES.map((scope) => scope.prefix).join(" / ")} are OUT OF SCOPE by declaration — they write the separate CMS product database (Supabase project viyklljfdhtidwecakwx), which has no organization_id and no _stamp_org_default trigger.`,
  );

  if (fix) {
    if (baseline && fresh.length > 0) {
      console.error(
        `\n[check:org-insert-scope] --fix REFUSED — ${fresh.length} site(s) are NEW since the baseline. The ratchet only shrinks; fix the writes, never the baseline:\n`,
      );
      for (const s of fresh) {
        console.error(`  ✗ NEW ${s.file}:${s.line} [${s.status}] ${s.table} — ${s.reason}`);
      }
      console.error(`\n${LAW}\n${REMEDY}\n`);
      return 1;
    }
    writeBaseline(ratcheted);
    console.log(
      `[check:org-insert-scope] baseline rewritten — ${ratcheted.length} site(s) recorded (was ${baseline?.sites.length ?? "absent"}). ${relative(ROOT, BASELINE_PATH)}`,
    );
    if (nullable.length > 0) {
      // A NULL organization is never baselined, so --fix cannot make the guard
      // green while one exists — and it says so instead of exiting 0.
      console.error(
        `\n[check:org-insert-scope] the baseline is written, but ${nullable.length} NULLABLE site(s) still fail every run — a null organization IS the trigger firing:\n`,
      );
      for (const s of nullable) {
        console.error(`  ✗ ${s.file}:${s.line} [NULLABLE] ${s.table} — ${s.reason}`);
      }
      console.error(`\n${LAW}\n${REMEDY}\n`);
      return 1;
    }
    return 0;
  }

  if (!baseline) {
    console.error(
      `\n[check:org-insert-scope] NO BASELINE at ${relative(ROOT, BASELINE_PATH)}. Seed it with \`tsx scripts/check-org-insert-scope.ts --fix\` and commit it — without it every standing site reads as new and the guard cannot ship.\n`,
    );
    return 1;
  }

  let failed = false;

  if (nullable.length > 0) {
    failed = true;
    console.error(
      `\n[check:org-insert-scope] ${nullable.length} write(s) send a NULL organization to an organization-scoped table — the BEFORE INSERT trigger then files the row in the writer's PERSONAL workspace:\n`,
    );
    for (const s of nullable) {
      console.error(`  ✗ ${s.file}:${s.line} [NULLABLE] ${s.table} — ${s.reason}\n      ${s.snippet}`);
    }
  }

  if (fresh.length > 0) {
    failed = true;
    console.error(
      `\n[check:org-insert-scope] ${fresh.length} NEW unscoped write site(s) — the ratchet only shrinks:\n`,
    );
    for (const s of fresh) {
      console.error(`  ✗ ${s.file}:${s.line} [${s.status}] ${s.table} — ${s.reason}\n      ${s.snippet}`);
    }
  }

  if (stale.length > 0) {
    failed = true;
    console.error(
      `\n[check:org-insert-scope] ${stale.length} baseline entr(ies) no longer match any write site. A stale entry hides the next regression behind a slot nobody uses — re-run with --fix to ratchet the baseline down:\n`,
    );
    for (const entry of stale) {
      console.error(`  ✗ STALE ${entry.file} [${entry.status}] ${entry.table} — ${entry.signature}`);
    }
  }

  if (failed) {
    console.error(`\n${LAW}\n${REMEDY}\n`);
    return 1;
  }

  console.log(
    `[check:org-insert-scope] OK — no NULLABLE write, no new unscoped write, no stale baseline entry. ${ratcheted.length} site(s) still owed to the ratchet.`,
  );
  return 0;
}

try {
  exitAfterDrain(main());
} catch (err) {
  console.error("[check:org-insert-scope] unexpected error:", err);
  exitAfterDrain(2);
}
