/**
 * THE OBJECT INVENTORY — one database's objects as `identity -> signature`, read by SELECTs only.
 *
 * Split out of `scripts/db-objects-diff.ts` (lane LEDGER-REBASE, 2026-09-22) so a SECOND caller
 * can diff the same inventory: `pnpm db:apply --ledger-rebase` takes it before and after running
 * a file's current bytes on the dev clone, and "zero delta" is its proof that the file already
 * describes what is live. aidream mirrors this module in `db/objects_inventory.py`, query for
 * query, so both runners prove a rebase with the same eyes.
 *
 * TWO DEPTHS, AND WHY.
 *   · `entry` — base tables, columns, constraints, triggers, event triggers. Exactly what
 *     `db:objects-diff --against branch` has always compared; its output does not move.
 *   · `full`  — `entry` plus every object a migration file in this campaign actually writes:
 *     FUNCTION bodies (pg_get_functiondef, hashed), their ACLs, owners and comments; VIEWS
 *     (pg_get_viewdef); POLICIES (command, roles, USING, WITH CHECK, permissive); INDEXES
 *     (pg_get_indexdef); relation ACLs, owners, comments and row-security flags; schema ACLs.
 *     A rebase proof blind to function bodies would be worthless: the files it rebases are
 *     mostly `CREATE OR REPLACE FUNCTION`, and the `entry` depth cannot see a body at all.
 *
 * The caller owns the transaction. This module never begins, commits or rolls back, so it reads
 * inside a proof's own savepoint exactly as it reads inside `begin transaction read only`.
 */
import type { DeltaObject, ObjectKind } from "./db-objects-diff-core";

export type InventoryDepth = "entry" | "full";

export type InventoryQuery = (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;

export interface Inventory {
  readonly objects: Map<string, string>;
  /** `schema.table` for every base table — the both-sides suppression rule reads it. */
  readonly tables: Set<string>;
}

const SEP = String.fromCharCode(31); // ASCII unit separator — never legal in a pg identifier

export function identityOf(o: DeltaObject): string {
  return [o.kind, o.schema ?? "", o.table ?? "", o.name].join(SEP);
}

export function parseIdentity(identity: string): DeltaObject {
  const [kind, schema, table, name] = identity.split(SEP);
  return {
    kind: kind as ObjectKind,
    schema: schema === "" ? null : schema!,
    table: table === "" ? null : table!,
    name: name!,
  };
}

/** Catalog and per-session schemas only — everything else is inventoried. */
export const SCHEMA_FILTER = `n.nspname not in ('pg_catalog','information_schema')
     and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'`;

export const TABLES_SQL = `
  select n.nspname as schema_name, c.relname as table_name,
         c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and ${SCHEMA_FILTER}`;

export const COLUMNS_SQL = `
  select n.nspname as schema_name, c.relname as table_name, a.attname as column_name,
         format_type(a.atttypid, a.atttypmod) as data_type,
         a.attnotnull as not_null,
         coalesce(pg_get_expr(d.adbin, d.adrelid), '') as column_default,
         a.attidentity as identity_kind,
         a.attgenerated as generated_kind
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where c.relkind in ('r','p') and a.attnum > 0 and not a.attisdropped and ${SCHEMA_FILTER}`;

export const CONSTRAINTS_SQL = `
  select n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name,
         pg_get_constraintdef(con.oid) as definition, con.convalidated as validated
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where ${SCHEMA_FILTER}`;

export const TRIGGERS_SQL = `
  select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name,
         pg_get_triggerdef(t.oid) as definition, t.tgenabled as enabled
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and ${SCHEMA_FILTER}`;

export const EVENT_TRIGGERS_SQL = `
  select e.evtname as name, e.evtevent as event, e.evtenabled as enabled,
         p.proname as function_name, e.evttags::text as tags
  from pg_event_trigger e
  join pg_proc p on p.oid = e.evtfoid`;

/** Aggregates (`prokind = 'a'`) have no pg_get_functiondef; their shape is the argument list. */
export const FUNCTIONS_SQL = `
  select n.nspname as schema_name,
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
         case when p.prokind = 'a' then 'aggregate'
              else md5(pg_get_functiondef(p.oid)) end as body_md5,
         coalesce(p.proacl::text, '(default)') as acl,
         pg_get_userbyid(p.proowner) as owner,
         coalesce(md5(obj_description(p.oid, 'pg_proc')), '') as comment_md5
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where ${SCHEMA_FILTER}`;

export const VIEWS_SQL = `
  select n.nspname as schema_name, c.relname as view_name, c.relkind as kind,
         md5(pg_get_viewdef(c.oid)) as def_md5
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('v','m') and ${SCHEMA_FILTER}`;

export const RELATION_ACLS_SQL = `
  select n.nspname as schema_name, c.relname as rel_name, c.relkind as kind,
         coalesce(c.relacl::text, '(default)') as acl,
         pg_get_userbyid(c.relowner) as owner,
         coalesce(md5(obj_description(c.oid, 'pg_class')), '') as comment_md5
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p','v','m','S','f') and ${SCHEMA_FILTER}`;

export const POLICIES_SQL = `
  select n.nspname as schema_name, c.relname as table_name, pol.polname as policy_name,
         pol.polcmd as cmd, pol.polpermissive as permissive,
         coalesce((select string_agg(case when r = 0 then 'public' else pg_get_userbyid(r) end, ',' order by 1)
                     from unnest(pol.polroles) r), '') as roles,
         coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') as using_expr,
         coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as check_expr
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where ${SCHEMA_FILTER}`;

export const INDEXES_SQL = `
  select n.nspname as schema_name, t.relname as table_name, i.relname as index_name,
         pg_get_indexdef(x.indexrelid) as definition, x.indisvalid as valid
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where ${SCHEMA_FILTER}`;

export const SCHEMAS_SQL = `
  select n.nspname as schema_name, coalesce(n.nspacl::text, '(default)') as acl,
         pg_get_userbyid(n.nspowner) as owner
  from pg_namespace n
  where ${SCHEMA_FILTER}`;

/**
 * Read one side. `depth: "entry"` is byte-for-byte what `db:objects-diff` has always read
 * (a table's signature stays the word `exists`, so its output does not move).
 */
export async function inventoryObjects(query: InventoryQuery, depth: InventoryDepth): Promise<Inventory> {
  const objects = new Map<string, string>();
  const tables = new Set<string>();
  const put = (o: DeltaObject, signature: string) => objects.set(identityOf(o), signature);
  const s = (v: unknown) => String(v ?? "");

  for (const r of (await query(TABLES_SQL)).rows) {
    put(
      { kind: "table", schema: s(r.schema_name), table: s(r.table_name), name: s(r.table_name) },
      depth === "full" ? `exists rls=${r.rls} force=${r.force_rls}` : "exists",
    );
    tables.add(`${s(r.schema_name)}.${s(r.table_name)}`);
  }
  for (const r of (await query(COLUMNS_SQL)).rows) {
    put(
      { kind: "column", schema: s(r.schema_name), table: s(r.table_name), name: s(r.column_name) },
      [
        r.data_type,
        r.not_null ? "not null" : "null",
        r.column_default ? `default ${r.column_default}` : "no default",
        r.identity_kind ? `identity ${r.identity_kind}` : "",
        r.generated_kind ? `generated ${r.generated_kind}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  for (const r of (await query(CONSTRAINTS_SQL)).rows) {
    put(
      { kind: "constraint", schema: s(r.schema_name), table: s(r.table_name), name: s(r.constraint_name) },
      depth === "full" ? `${s(r.definition)} [validated=${r.validated}]` : s(r.definition),
    );
  }
  for (const r of (await query(TRIGGERS_SQL)).rows) {
    put(
      { kind: "trigger", schema: s(r.schema_name), table: s(r.table_name), name: s(r.trigger_name) },
      `${s(r.definition)} [enabled=${s(r.enabled)}]`,
    );
  }
  for (const r of (await query(EVENT_TRIGGERS_SQL)).rows) {
    put(
      { kind: "event_trigger", schema: null, table: null, name: s(r.name) },
      `on ${s(r.event)} execute ${s(r.function_name)} [enabled=${s(r.enabled)}] tags=${r.tags ?? "(all)"}`,
    );
  }
  if (depth === "entry") return { objects, tables };

  for (const r of (await query(FUNCTIONS_SQL)).rows) {
    put(
      { kind: "function", schema: s(r.schema_name), table: null, name: s(r.signature) },
      `body ${s(r.body_md5)} acl ${s(r.acl)} owner ${s(r.owner)} comment ${s(r.comment_md5) || "(none)"}`,
    );
  }
  for (const r of (await query(VIEWS_SQL)).rows) {
    put(
      { kind: "view", schema: s(r.schema_name), table: null, name: s(r.view_name) },
      `${s(r.kind) === "m" ? "materialized" : "view"} def ${s(r.def_md5)}`,
    );
  }
  for (const r of (await query(RELATION_ACLS_SQL)).rows) {
    put(
      { kind: "acl", schema: s(r.schema_name), table: null, name: s(r.rel_name) },
      `relkind ${s(r.kind)} acl ${s(r.acl)} owner ${s(r.owner)} comment ${s(r.comment_md5) || "(none)"}`,
    );
  }
  for (const r of (await query(POLICIES_SQL)).rows) {
    put(
      { kind: "policy", schema: s(r.schema_name), table: s(r.table_name), name: s(r.policy_name) },
      `cmd ${s(r.cmd)} ${r.permissive ? "permissive" : "restrictive"} to ${s(r.roles)} ` +
        `using (${s(r.using_expr)}) check (${s(r.check_expr)})`,
    );
  }
  for (const r of (await query(INDEXES_SQL)).rows) {
    put(
      { kind: "index", schema: s(r.schema_name), table: s(r.table_name), name: s(r.index_name) },
      `${s(r.definition)} [valid=${r.valid}]`,
    );
  }
  for (const r of (await query(SCHEMAS_SQL)).rows) {
    put(
      { kind: "schema", schema: s(r.schema_name), table: null, name: s(r.schema_name) },
      `acl ${s(r.acl)} owner ${s(r.owner)}`,
    );
  }
  return { objects, tables };
}
