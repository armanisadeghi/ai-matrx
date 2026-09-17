/**
 * THE SYNC PLAN — `pnpm check:branch-schema-drift --sync-plan` writes the file that
 * closes what the check just failed on, instead of describing it.
 *
 * WHY THIS EXISTS
 * ---------------
 * The rehearsal branch is a schema-only transplant and production moves under it every
 * hour, so `check:branch-schema-drift` goes red again days after it went green. Twice now
 * the answer has been the same shape of work — read production's catalog, write a
 * `-- target: branch` file into `migrations/campaign/`, apply it through the runner — and
 * twice it was done by hand. Doing it by hand is where a body gets paraphrased, and a
 * paraphrased body is permanent drift the check will report forever.
 *
 * So the check that MEASURES the drift also PRINTS its remedy, from the same read of the
 * same catalog, in the same run. The next sync is one command and a review, not an
 * afternoon.
 *
 * WHAT IT EMITS, AND IN WHAT ORDER
 * --------------------------------
 *   1. `platform.entity_types` registry rows for missing relations that production
 *      registers — FIRST, because `provision_shape_guard` refuses an entity-shaped table
 *      created outside `platform.provision()` UNLESS the registry already names it. The
 *      row is production's own, column for column.
 *   2. the relations themselves: columns, defaults, constraints, indexes, RLS, and the
 *      client grants production gives them.
 *   3. functions, from `pg_get_functiondef` verbatim.
 *   4. policies, rebuilt from `pg_policy` (`pg_get_expr` for both expressions).
 *   5. triggers and event triggers, from `pg_get_triggerdef` / `pg_event_trigger`.
 *   6. the grant levelling: a REVOKE for every EXECUTE the BRANCH gives and production
 *      does not.
 *
 * IT IS A PLAN, NOT AN APPLY. This module opens NOTHING but a read-only connection to
 * production and returns a string. A human (or the lane holding the lock) reads it, saves
 * it into `migrations/campaign/`, and applies it through the runner with
 * `--source campaign --lane <LANE> --target branch`. There is no write path here in any
 * flag combination.
 *
 * WHAT IT REFUSES TO GUESS. A column with an identity or a generated expression, a
 * partitioned or foreign relation, a view or a materialised view: each of those needs a
 * decision this generator does not have, so it emits a loud `-- UNSUPPORTED:` line naming
 * the object rather than a statement that is nearly right. A nearly-right CREATE is worse
 * than an absent one, because it goes green.
 */
import type pg from "pg";

export interface PlanObj {
  readonly kind: string;
  readonly schema: string;
  /** The inventory identity, e.g. `platform.masterwork_source[r]` or `schema.fn(args)`. */
  readonly identity: string;
}

export interface PlanGrant {
  /** `schema.fn(identity args)`. */
  readonly identity: string;
  /** `anon` | `authenticated` | `service_role` | `PUBLIC`. */
  readonly grantee: string;
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** `platform.masterwork_source[r]` -> { schema, name, relkind }. */
function splitRelation(identity: string): { schema: string; name: string; relkind: string } {
  const m = /^([^.]+)\.(.+)\[(.)\]$/.exec(identity);
  if (!m) throw new Error(`sync-plan: cannot parse relation identity ${identity}`);
  return { schema: m[1], name: m[2], relkind: m[3] };
}

/** `platform.masterwork_source._touch_row` -> { schema, table, name }. */
function splitOnRelation(identity: string): { schema: string; table: string; name: string } {
  const parts = identity.split(".");
  if (parts.length < 3) throw new Error(`sync-plan: cannot parse identity ${identity}`);
  return { schema: parts[0], table: parts[1], name: parts.slice(2).join(".") };
}

async function one<T extends pg.QueryResultRow>(
  client: pg.Client,
  sql: string,
  params: unknown[],
): Promise<T[]> {
  const { rows } = await client.query<T>(sql, params);
  return rows;
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

async function renderRelation(
  client: pg.Client,
  schema: string,
  name: string,
  relkind: string,
): Promise<string[]> {
  const ref = `${q(schema)}.${q(name)}`;
  if (relkind !== "r") {
    return [
      `-- UNSUPPORTED: ${schema}.${name} has relkind '${relkind}' (partitioned, view, matview or foreign).`,
      `--   Carry it by hand, or through platform.provision(spec) if it is entity-shaped.`,
      "",
    ];
  }
  const cols = await one<{
    attname: string;
    coltype: string;
    notnull: boolean;
    def: string | null;
    identity: string;
    generated: string;
  }>(
    client,
    `select a.attname,
            format_type(a.atttypid, a.atttypmod) as coltype,
            a.attnotnull as notnull,
            pg_get_expr(d.adbin, d.adrelid) as def,
            a.attidentity as identity,
            a.attgenerated as generated
       from pg_attribute a
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = ($1||'.'||$2)::regclass and a.attnum > 0 and not a.attisdropped
      order by a.attnum`,
    [q(schema), q(name)],
  );
  const unsupported = cols.filter((c) => c.identity !== "" || c.generated !== "");
  if (unsupported.length > 0) {
    return [
      `-- UNSUPPORTED: ${schema}.${name} has identity/generated column(s): ` +
        unsupported.map((c) => c.attname).join(", "),
      "",
    ];
  }
  const out: string[] = [];
  out.push(`-- ${schema}.${name} — production's shape, from its own catalog.`);
  out.push(`create table ${ref} (`);
  out.push(
    cols
      .map(
        (c) =>
          `  ${q(c.attname)} ${c.coltype}` +
          (c.def ? ` default ${c.def}` : "") +
          (c.notnull ? " not null" : ""),
      )
      .join(",\n"),
  );
  out.push(`);`);

  const cons = await one<{ conname: string; def: string; contype: string }>(
    client,
    `select c.conname, pg_get_constraintdef(c.oid) as def, c.contype::text as contype
       from pg_constraint c
      where c.conrelid = ($1||'.'||$2)::regclass
      order by case c.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end, c.conname`,
    [q(schema), q(name)],
  );
  for (const c of cons) {
    out.push(`alter table ${ref} add constraint ${q(c.conname)} ${c.def};`);
  }

  const idx = await one<{ def: string }>(
    client,
    `select pg_get_indexdef(i.indexrelid) as def
       from pg_index i
       join pg_class ic on ic.oid = i.indexrelid
      where i.indrelid = ($1||'.'||$2)::regclass
        and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
      order by ic.relname`,
    [q(schema), q(name)],
  );
  for (const i of idx) out.push(`${i.def};`);

  const [rls] = await one<{ rowsecurity: boolean; forced: boolean }>(
    client,
    `select relrowsecurity as rowsecurity, relforcerowsecurity as forced
       from pg_class where oid = ($1||'.'||$2)::regclass`,
    [q(schema), q(name)],
  );
  if (rls?.rowsecurity) out.push(`alter table ${ref} enable row level security;`);
  if (rls?.forced) out.push(`alter table ${ref} force row level security;`);

  const acl = await one<{ grantee: string; privilege_type: string }>(
    client,
    `select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
            a.privilege_type
       from pg_class c
       cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      where c.oid = ($1||'.'||$2)::regclass
        and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon','authenticated','service_role'))
      order by grantee, a.privilege_type`,
    [q(schema), q(name)],
  );
  const byGrantee = new Map<string, string[]>();
  for (const a of acl) {
    if (!byGrantee.has(a.grantee)) byGrantee.set(a.grantee, []);
    byGrantee.get(a.grantee)!.push(a.privilege_type.toLowerCase());
  }
  for (const [grantee, privs] of byGrantee) {
    out.push(`grant ${privs.join(", ")} on ${ref} to ${grantee === "PUBLIC" ? "public" : q(grantee)};`);
  }
  out.push("");
  return out;
}

/**
 * The registry row `provision_shape_guard` reads. Emitted BEFORE the CREATE TABLE, and
 * only when production actually registers the relation — an invented row would make the
 * branch differ from production in a new way to stop it differing in an old one.
 */
async function renderEntityTypeRow(
  client: pg.Client,
  schema: string,
  name: string,
): Promise<string[]> {
  const rows = await one<{ stmt: string | null }>(
    client,
    `select 'insert into platform.entity_types ('
            || string_agg(quote_ident(k), ', ' order by ord)
            || ') values ('
            || string_agg(case when v is null then 'null' else quote_literal(v) end
                          || '::' || t, ', ' order by ord)
            || ') on conflict do nothing;' as stmt
       from (
         select (j).key as k, (j).value as v, ord,
                (select format_type(a.atttypid, a.atttypmod)
                   from pg_attribute a
                  where a.attrelid = 'platform.entity_types'::regclass
                    and a.attname = (j).key and not a.attisdropped) as t
           from (
             select jsonb_each_text(to_jsonb(e)) as j,
                    row_number() over () as ord
               from platform.entity_types e
              where e.schema_name = $1 and e.table_name = $2
           ) s
       ) q
      -- table_ref is a regclass and the table does not exist yet at this point in the
      -- file, so naming it here would fail to parse. It is DERIVED anyway — the
      -- entity_types_set_ref trigger writes it — and the UPDATE after the CREATE TABLE
      -- below sets it to exactly what production holds.
      where k <> 'table_ref'`,
    [schema, name],
  );
  const stmt = rows[0]?.stmt ?? null;
  if (!stmt) return [];
  return [
    `-- platform.entity_types row FIRST: provision_shape_guard refuses an entity-shaped`,
    `-- table created outside platform.provision() unless the registry already names it,`,
    `-- and this row is production's own, column for column.`,
    stmt,
    "",
  ];
}

// ---------------------------------------------------------------------------
// Functions, policies, triggers, event triggers
// ---------------------------------------------------------------------------

async function renderFunction(client: pg.Client, identity: string): Promise<string[]> {
  const rows = await one<{ def: string }>(
    client,
    `select pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' = $1`,
    [identity],
  );
  if (rows.length === 0) return [`-- UNSUPPORTED: function ${identity} vanished between the two reads.`, ""];
  return [`${rows[0].def};`, ""];
}

async function renderPolicy(
  client: pg.Client,
  schema: string,
  table: string,
  name: string,
): Promise<string[]> {
  const rows = await one<{
    permissive: string;
    cmd: string;
    roles: string[];
    qual: string | null;
    withcheck: string | null;
  }>(
    client,
    `select case when pol.polpermissive then 'permissive' else 'restrictive' end as permissive,
            case pol.polcmd when 'r' then 'select' when 'a' then 'insert'
                            when 'w' then 'update' when 'd' then 'delete' else 'all' end as cmd,
            (select coalesce(array_agg(pg_get_userbyid(r)::text order by r), array['public']::text[])
               from unnest(pol.polroles) r where r <> 0) as roles,
            pg_get_expr(pol.polqual, pol.polrelid) as qual,
            pg_get_expr(pol.polwithcheck, pol.polrelid) as withcheck
       from pg_policy pol
       join pg_class c on c.oid = pol.polrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and pol.polname = $3`,
    [schema, table, name],
  );
  if (rows.length === 0) return [`-- UNSUPPORTED: policy ${schema}.${table}.${name} vanished.`, ""];
  const p = rows[0];
  const roles = (p.roles ?? ["public"]).map((r) => (r === "public" ? "public" : q(r))).join(", ");
  const parts = [
    `create policy ${q(name)} on ${q(schema)}.${q(table)}`,
    `  as ${p.permissive} for ${p.cmd} to ${roles}`,
  ];
  if (p.qual) parts.push(`  using (${p.qual})`);
  if (p.withcheck) parts.push(`  with check (${p.withcheck})`);
  return [`${parts.join("\n")};`, ""];
}

async function renderTrigger(
  client: pg.Client,
  schema: string,
  table: string,
  name: string,
): Promise<string[]> {
  const rows = await one<{ def: string }>(
    client,
    `select pg_get_triggerdef(t.oid) as def
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and t.tgname = $3 and not t.tgisinternal`,
    [schema, table, name],
  );
  if (rows.length === 0) return [`-- UNSUPPORTED: trigger ${schema}.${table}.${name} vanished.`, ""];
  return [`${rows[0].def};`, ""];
}

async function renderEventTrigger(client: pg.Client, name: string): Promise<string[]> {
  const rows = await one<{ evtevent: string; fn: string; tags: string[] | null; enabled: string }>(
    client,
    `select et.evtevent, p.pronamespace::regnamespace::text||'.'||p.proname as fn,
            et.evttags::text[] as tags, et.evtenabled::text as enabled
       from pg_event_trigger et join pg_proc p on p.oid = et.evtfoid
      where et.evtname = $1`,
    [name],
  );
  if (rows.length === 0) return [`-- UNSUPPORTED: event trigger ${name} vanished.`, ""];
  const e = rows[0];
  const when = e.tags && e.tags.length > 0 ? ` when tag in (${e.tags.map(lit).join(", ")})` : "";
  const out = [`create event trigger ${q(name)} on ${e.evtevent}${when} execute function ${e.fn}();`];
  if (e.enabled === "D") out.push(`alter event trigger ${q(name)} disable;`);
  out.push("");
  return out;
}

// ---------------------------------------------------------------------------
// The whole plan
// ---------------------------------------------------------------------------

export interface SyncPlanInput {
  readonly missing: readonly PlanObj[];
  readonly looserGrants: readonly PlanGrant[];
  /** `schema.fn(args)` -> every client grantee production gives EXECUTE. */
  readonly prodGrantsByFn: ReadonlyMap<string, readonly string[]>;
  /** The same, as the branch holds it. */
  readonly branchGrantsByFn: ReadonlyMap<string, readonly string[]>;
  readonly lane: string;
  readonly fileName: string;
}

/**
 * Reads production (SELECT-only, inside the caller's read-only transaction) and returns
 * the text of a `-- target: branch` migration that closes exactly what was measured.
 */
export async function renderSyncPlan(
  prodClient: pg.Client,
  input: SyncPlanInput,
): Promise<string> {
  const { missing, looserGrants, prodGrantsByFn, branchGrantsByFn, lane, fileName } = input;
  const lines: string[] = [];
  lines.push(`-- target: branch`);
  lines.push(`--`);
  lines.push(`-- ${fileName} — generated by \`pnpm check:branch-schema-drift --sync-plan\`.`);
  lines.push(`--`);
  lines.push(`-- Every body below is production's own catalog, read SELECT-only inside`);
  lines.push(`-- "begin transaction read only": pg_get_functiondef, pg_get_triggerdef,`);
  lines.push(`-- pg_get_constraintdef, pg_get_indexdef, pg_get_expr. Nothing is paraphrased,`);
  lines.push(`-- because a paraphrased body is drift this check reports forever.`);
  lines.push(`--`);
  lines.push(`--   uv run python db/apply_migrations.py --source campaign \\`);
  lines.push(`--     --only ${fileName} --target branch --lane ${lane} --no-generate`);
  lines.push(`--`);
  lines.push(`-- READ IT BEFORE APPLYING IT. This generator refuses to guess: anything it`);
  lines.push(`-- cannot derive exactly appears as an "-- UNSUPPORTED:" line naming the object.`);
  lines.push("");

  const relations = missing.filter((o) => o.kind === "relation");
  const functions = missing.filter((o) => o.kind === "function");
  const policies = missing.filter((o) => o.kind === "policy");
  const triggers = missing.filter((o) => o.kind === "trigger");
  const eventTriggers = missing.filter((o) => o.kind === "event_trigger");

  if (relations.length > 0) {
    lines.push(`-- ============================ RELATIONS (${relations.length})`);
    lines.push("");
    for (const r of relations) {
      const { schema, name, relkind } = splitRelation(r.identity);
      const registry = await renderEntityTypeRow(prodClient, schema, name);
      lines.push(...registry);
      lines.push(...(await renderRelation(prodClient, schema, name, relkind)));
      if (registry.length > 0) {
        lines.push(
          `-- The registry row's table_ref, now that the relation it points at exists.`,
          `update platform.entity_types set table_ref = to_regclass(${lit(`${schema}.${name}`)})`,
          ` where schema_name = ${lit(schema)} and table_name = ${lit(name)};`,
          "",
        );
      }
    }
  }
  if (functions.length > 0) {
    lines.push(`-- ============================ FUNCTIONS (${functions.length})`);
    lines.push("");
    for (const f of functions) lines.push(...(await renderFunction(prodClient, f.identity)));
  }
  if (policies.length > 0) {
    lines.push(`-- ============================ POLICIES (${policies.length})`);
    lines.push("");
    for (const p of policies) {
      const { schema, table, name } = splitOnRelation(p.identity);
      lines.push(...(await renderPolicy(prodClient, schema, table, name)));
    }
  }
  if (triggers.length > 0) {
    lines.push(`-- ============================ TRIGGERS (${triggers.length})`);
    lines.push("");
    for (const t of triggers) {
      const { schema, table, name } = splitOnRelation(t.identity);
      lines.push(...(await renderTrigger(prodClient, schema, table, name)));
    }
  }
  if (eventTriggers.length > 0) {
    lines.push(`-- ============================ EVENT TRIGGERS (${eventTriggers.length})`);
    lines.push("");
    for (const e of eventTriggers) lines.push(...(await renderEventTrigger(prodClient, e.identity)));
  }
  if (looserGrants.length > 0) {
    // PER FUNCTION, NOT PER ROW. A function whose `PUBLIC` grant is revoked and whose
    // production-explicit `authenticated` grant is not restored is not levelled — it is
    // newly TIGHTER than production, which denies a read production allows and sends the
    // next lane to fix a defect that does not exist. So every function this section
    // touches gets production's client grant set restated in full.
    const touched = [...new Set(looserGrants.map((g) => g.identity))].sort();
    const revokes: string[] = [];
    const grants: string[] = [];
    for (const identity of touched) {
      const paren = identity.lastIndexOf("(");
      const fn = identity.slice(0, paren);
      const args = identity.slice(paren);
      const [sch, ...rest] = fn.split(".");
      const target = `${q(sch)}.${q(rest.join("."))}${args}`;
      const prodSet = new Set(prodGrantsByFn.get(identity) ?? []);
      const branchSet = new Set(branchGrantsByFn.get(identity) ?? []);
      for (const grantee of [...branchSet].sort()) {
        if (prodSet.has(grantee)) continue;
        revokes.push(
          `revoke execute on function ${target} from ${grantee === "PUBLIC" ? "public" : q(grantee)};`,
        );
      }
      for (const grantee of [...prodSet].sort()) {
        if (branchSet.has(grantee)) continue;
        grants.push(
          `grant execute on function ${target} to ${grantee === "PUBLIC" ? "public" : q(grantee)};`,
        );
      }
    }
    lines.push(
      `-- ============================ GRANT LEVELLING (${touched.length} function(s): ${revokes.length} revoke(s), ${grants.length} grant(s))`,
    );
    lines.push(`--`);
    lines.push(`-- Each revoke is an EXECUTE the BRANCH gives and production does not, so a client`);
    lines.push(`-- call it answers here is one production answers 42501 for. Each grant beside it is`);
    lines.push(`-- production's own explicit grant on the same function, restored — the branch was`);
    lines.push(`-- reaching it through the PUBLIC grant being revoked, and dropping one without the`);
    lines.push(`-- other would trade a looser branch for a tighter one.`);
    lines.push("");
    lines.push(...revokes);
    lines.push("");
    lines.push(...grants);
    lines.push("");
  }
  if (
    relations.length + functions.length + policies.length + triggers.length +
      eventTriggers.length + looserGrants.length ===
    0
  ) {
    lines.push(`-- Nothing to carry: the branch is level with production in the failing scope.`);
    lines.push("");
  }
  return lines.join("\n");
}
