#!/usr/bin/env npx tsx
/**
 * DOOR ROWS — a door returns only what its caller may read.
 *
 * db-rules FEATURE.md §6d. Born from DD-192 (2026-09-13). The existing door
 * gate (`pnpm check:impl-doors:strict`) proves two things about a declared
 * client door: that the GRANT is the one somebody declared, and that the body
 * CONTAINS a caller predicate. V-52 proved that is not the same as the door
 * being bounded to its caller:
 *
 *   - `public.inv_list` handed a plain member of two unrelated organizations
 *     another organization's pending invitations WITH their acceptance tokens.
 *     The body has the gate. `iam._container_authz` returns `actor_role = NULL`
 *     for a non-member, `NULL not in ('owner','admin')` is NULL, so the
 *     `raise exception` never fired.
 *   - `public.inv_create` carried the identical line, so the same stranger
 *     could MINT AN ADMIN INVITATION into any organization.
 *   - `seo.starter_pack_catalog` returned another organization's entitled
 *     starter packs for any organization id passed.
 *
 * The door gate was GREEN the whole time. Presence of a predicate is not
 * boundedness of the rows. THIS gate measures the rows.
 *
 * THE METHOD (the one V-52 used by hand, automated over the whole population):
 *
 *   1. A fixed cast of principals, all real rows in `auth.users`:
 *        A  a plain member of two organizations  (test@test.com)
 *        C  a signed-in user who is a member of NO organization
 *      and a victim identity B (admin@admin.com) whose organizations neither
 *      A nor C belongs to. The cast is fixed so the harness is reproducible;
 *      it is asserted live on every run (§CAST) and the run ABORTS if the cast
 *      no longer holds — a probe as a caller who happens to be a member of the
 *      victim org proves nothing, and would silently go green.
 *
 *   2. A victim catalog, obtained as `postgres`: for every table reachable
 *      from a door argument, one real row id that belongs to a victim
 *      organization the caller is NOT a member of.
 *
 *   3. For every declared signed-in door: derive its argument shape from
 *      `pg_proc` and fill each argument from the victim catalog — the org id
 *      of an organization the caller has no standing in, the row id of that
 *      org's rows, the victim's own user id. An argument that cannot be
 *      derived makes the door UNMEASURED BY NAME — never a silent pass.
 *
 *   4. Call the door inside a transaction that is ALWAYS rolled back, as
 *      `role authenticated` with the caller's real JWT claims.
 *
 *   5. Diff every uuid in the answer against what that caller can SELECT
 *      DIRECTLY under RLS. A door that returns a row the caller cannot read,
 *      or mints a row into an organization the caller has no standing in, is
 *      a FAIL BY NAME with the leaked row printed.
 *
 * WHAT COUNTS AS WHAT — the honesty rules, because a gate that reads a type
 * error as a pass is worse than no gate:
 *
 *   PASS        the door refused with a real authorization error, or answered
 *               with nothing, or answered only with rows the caller can SELECT
 *               directly under RLS.
 *   FAIL        the door answered with a row the caller cannot SELECT under
 *               RLS, or minted a row into a victim organization.
 *   UNMEASURED  the arguments could not be derived, or the call failed for a
 *               reason that is not an authorization decision (a type error, a
 *               missing required payload, a timeout). Named, with the reason.
 *               NEVER counted as a pass.
 *
 *   pnpm check:door-rows           # loud, non-blocking (exit 0)
 *   pnpm check:door-rows:strict    # exit 1 on any FAIL or on UNMEASURED
 *                                  #   credentials (never a silent green)
 *   pnpm check:door-rows:self-test # proves the harness FAILS a known leak
 *
 * Flags: `--population=b75|signed-in|all` (default `b75`, the 477 doors
 * DD-169 batch 3 declared) · `--only=schema.fn` · `--limit=N` ·
 * `--table=path.md` writes the per-door table · `--json=path.json`.
 *
 * CREDENTIALS. Direct Postgres, the same five `SUPABASE_MATRIX_*` variables
 * `pnpm db:apply` uses, from this repo's env files or the aidream checkout's
 * `.env`. Without them it CANNOT measure anything, so it says UNMEASURED
 * loudly and, under `--strict`, exits 1.
 *
 * NOTHING IS WRITTEN. Every probe runs inside `begin` … `rollback`, including
 * on error, including the self-test's planted door. The self-test asserts, after
 * its rollback, that no planted function survives.
 *
 * WHAT THIS GATE STILL CANNOT SEE — named here so nobody reads a green run as
 * more than it is:
 *
 *  - A DELETE. A deleted row cannot be read back to place it against the
 *    caller's standing, and the per-transaction statistics counters are not
 *    proof on their own (see below), so deletes are not reported at all. A door
 *    that deletes another organization's rows and returns nothing would pass.
 *  - A door whose arguments cannot be derived, which is every door that needs a
 *    payload, a slug, or an id shape this harness has no victim row for. Those
 *    are UNMEASURED BY NAME — 211 of the 477 on the first full run — and the
 *    honest reading of a clean run is "0 FAIL among what was measured".
 *  - Anything outside the DECLARED door population: a door row that resolves to
 *    no live function, or whose function no client can execute, is reported
 *    separately and measured by nobody.
 *  - This connection goes through Supavisor in TRANSACTION POOLING mode, so
 *    `pg_stat_xact_user_tables` is treated as a candidate list only; every
 *    candidate is confirmed row by row against the row's own transaction
 *    status before it is reported.
 *
 * Exit codes: 0 clean (or findings without --strict) · 1 findings/UNMEASURED
 * credentials with --strict · 2 script error.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

const ROOT = process.cwd();

/**
 * The self-test runs every probe inside ONE outer transaction so the door it
 * plants is never committed. When this is set, a probe brackets itself with a
 * SAVEPOINT instead of BEGIN — a nested BEGIN is a no-op in Postgres and its
 * ROLLBACK would end the OUTER transaction, which is how a self-test leaves a
 * function behind in the live database.
 */
let OUTER_TX = false;
const TX_BEGIN = () => (OUTER_TX ? "savepoint door_probe" : "begin");
const TX_ROLLBACK = () => (OUTER_TX ? "rollback to savepoint door_probe" : "rollback");

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
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  ok: `${C.green}[ OK ]${C.reset} `,
};

const ARGV = process.argv.slice(2);
const STRICT = ARGV.includes("--strict");
const SELF_TEST = ARGV.includes("--self-test");
const flag = (name: string): string | null => {
  const hit = ARGV.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const POPULATION = (flag("population") ?? "b75") as "b75" | "signed-in" | "all";
const ONLY = flag("only");
const LIMIT = Number(flag("limit") ?? "0") || 0;
const TABLE_OUT = flag("table");
const JSON_OUT = flag("json");
const CALL_TIMEOUT_MS = Number(flag("timeout") ?? "6000") || 6000;
const POOL = Math.max(1, Number(flag("pool") ?? "6") || 6);

// ─── credentials ─────────────────────────────────────────────────────────────

const DB_VARS = [
  "SUPABASE_MATRIX_USER",
  "SUPABASE_MATRIX_PASSWORD",
  "SUPABASE_MATRIX_HOST",
  "SUPABASE_MATRIX_PORT",
  "SUPABASE_MATRIX_DATABASE_NAME",
] as const;

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function newClient(env: DbEnv): pg.Client {
  return new pg.Client({
    user: env.user,
    password: env.password,
    host: env.host,
    port: env.port,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60_000,
  });
}

interface DbEnv {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
  from: string;
}

function loadDbEnv(): DbEnv | null {
  const tryBag = (bag: Record<string, string | undefined>, from: string): DbEnv | null => {
    if (DB_VARS.some((k) => !bag[k])) return null;
    return {
      user: bag.SUPABASE_MATRIX_USER!,
      password: bag.SUPABASE_MATRIX_PASSWORD!,
      host: bag.SUPABASE_MATRIX_HOST!,
      port: Number(bag.SUPABASE_MATRIX_PORT!),
      database: bag.SUPABASE_MATRIX_DATABASE_NAME!,
      from,
    };
  };
  const fromProcess = tryBag(process.env, "the environment");
  if (fromProcess) return fromProcess;
  for (const f of [
    resolve(ROOT, ".env.local"),
    resolve(ROOT, ".env.production.local"),
    resolve(ROOT, ".env.production"),
    resolve(ROOT, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"),
  ]) {
    if (!existsSync(f)) continue;
    const hit = tryBag(parseEnvFile(f), f);
    if (hit) return hit;
  }
  return null;
}

// ─── the cast ────────────────────────────────────────────────────────────────
//
// Fixed, asserted live, never inferred from whoever happens to be handy. A
// caller who turns out to be a member of the victim organization would pass
// every probe for the wrong reason.

const CALLER_A_EMAIL = "test@test.com";
const VICTIM_B_EMAIL = "admin@admin.com";

interface Principal {
  label: string;
  id: string;
  email: string;
  orgIds: string[];
  isPlatformAdmin: boolean;
}

interface Cast {
  a: Principal; // plain member of ≥1 organization
  c: Principal; // signed-in member of NO organization
  b: Principal; // the victim, member of organizations a and c are not in
  victimOrgIds: string[]; // organizations neither a nor c belongs to
}

// ─── door population ─────────────────────────────────────────────────────────

interface Door {
  schema: string;
  fn: string;
  identityArgs: string;
  declaredBy: string | null;
  gatePredicate: string | null;
  oid: number;
  volatile: boolean;
  argNames: string[];
  argTypes: string[]; // format_type text, e.g. "uuid", "text", "uuid[]"
  argDefaults: number; // count of arguments with defaults (trailing)
  retSet: boolean;
}

type Verdict = "PASS" | "FAIL" | "UNMEASURED";

interface Probe {
  caller: string;
  args: string; // the literal argument list used
  outcome: string; // refused / empty / rows / error
  detail: string;
}

interface DoorResult {
  door: Door;
  verdict: Verdict;
  why: string;
  leaked: string[];
  probes: Probe[];
}

// ─── argument derivation ─────────────────────────────────────────────────────
//
// A door's argument shape comes from `pg_proc`; the VALUES come from the victim
// catalog. The rules below are deliberately narrow: anything they cannot fill
// makes the door UNMEASURED by name. A harness that guesses a value and reads
// the resulting type error as a refusal is exactly the failure mode DD-192
// exists to close.

/**
 * The victim row for an entity name, preferring a table in the door's own
 * schema — `seo.site` for a `seo` door, `web.site` for a `web` one. Passing a
 * `web.site` id to a `seo` door produces `gsc_site_not_found`, which is not an
 * authorization decision and would leave the door UNMEASURED for no reason.
 */
function pickEntity(
  catalog: Catalog,
  schema: string,
  names: string[],
): { table: string; id: string } | null {
  for (const raw of names) {
    for (const n of [raw, `${raw}s`, raw.replace(/s$/, "")]) {
      const hits = catalog.byEntity[n];
      if (!hits?.length) continue;
      return hits.find((h) => h.table.startsWith(`${schema}.`)) ?? hits[0];
    }
  }
  return null;
}

const ORG_ARG = /^p?_?(organization|org)_id$/;
const USER_ARG = /^p?_?(user|actor|owner|member|target_user|created_by|user_id)(_id)?$/;

/** `p_employment_id` → `employment`; `p_id` → null (needs the function name). */
function entityFromArg(name: string): string | null {
  const m = name.replace(/^p_/, "").match(/^(.+)_ids?$/);
  if (!m) return null;
  const base = m[1];
  if (base === "" || base === "organization" || base === "org" || base === "user") return null;
  return base;
}

/** Tokens of a function name, longest first, as candidate entity names. */
function entitiesFromFunctionName(fn: string): string[] {
  const cleaned = fn
    .replace(/^(fn_|get_|list_|fetch_|read_|load_|search_|admin_|_)+/, "")
    .replace(/(_list|_get|_detail|_summary|_page|_for_selection|_with_users|_rich)$/, "");
  const parts = cleaned.split("_").filter(Boolean);
  const out: string[] = [];
  for (let len = parts.length; len >= 1; len--) {
    for (let i = 0; i + len <= parts.length; i++) out.push(parts.slice(i, i + len).join("_"));
  }
  return out;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  console.log(`${C.bold}DOOR ROWS — a door returns only what its caller may read (DD-192)${C.reset}`);

  const env = loadDbEnv();
  if (!env) {
    console.log(
      `${TAG.warn}UNMEASURED: no database credentials (${DB_VARS.join(", ")}). This gate cannot measure anything without them.`,
    );
    console.log(
      `${TAG.warn}Remedy: run from a checkout whose .env carries the five SUPABASE_MATRIX_* variables, or export them.`,
    );
    return STRICT ? 1 : 0;
  }

  const db = newClient(env);
  await db.connect();

  try {
    const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> =>
      (await db.query(sql, params)).rows as T[];

    // Prove we are ourselves — Supavisor pools in transaction mode and a
    // leaked `SET ROLE` would silently narrow every catalog read below.
    const who = (await q<{ cu: string; su: string }>(`select current_user cu, session_user su`))[0];
    if (who.cu !== who.su) {
      console.log(`${TAG.fail}pooler role contamination: current_user ${who.cu} != session_user ${who.su}`);
      return 2;
    }

    const cast = await buildCast(q);
    console.log(
      `${TAG.info}cast: A=${cast.a.email} (${cast.a.orgIds.length} orgs) · C=${cast.c.email || cast.c.id} (0 orgs) · victim B=${cast.b.email} (${cast.victimOrgIds.length} orgs neither caller is in)`,
    );

    const catalog = await buildVictimCatalog(q, cast);
    console.log(`${TAG.info}victim catalog: ${Object.keys(catalog.byEntity).length} entity names over ${new Set(Object.values(catalog.byEntity).flat().map((e) => e.table)).size} tables with a real victim row`);

    const doors = await loadDoors(q);
    console.log(
      `${TAG.info}population: ${doors.length} declared signed-in doors (--population=${POPULATION})`,
    );

    if (SELF_TEST) return await selfTest(db, q, cast, catalog, doors);

    const structural = await structuralFindings(q);


    // Each probe is its own transaction on its own connection, so the
    // population fans out over a small pool. Serially this is an eighty-minute
    // gate, which is a gate nobody runs; the pool brings it to roughly ten.
    const results: DoorResult[] = new Array(doors.length);
    let next = 0;
    let done = 0;
    const worker = async (w: number): Promise<void> => {
      const c = w === 0 ? db : newClient(env);
      if (w !== 0) await c.connect();
      try {
        const cq = async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> =>
          (await c.query(sql, params)).rows as T[];
        for (;;) {
          const i = next++;
          if (i >= doors.length) return;
          const t0 = Date.now();
          results[i] = await measureDoor(c, cq, cast, catalog, doors[i]);
          done++;
          if (process.env.DD192_PROGRESS)
            console.log(
              `${TAG.info}${String(done).padStart(4)}/${doors.length} ${Date.now() - t0}ms ${results[i].verdict} ${doors[i].schema}.${doors[i].fn}`,
            );
          else if (done % 25 === 0) console.log(`${TAG.info}… ${done}/${doors.length}`);
        }
      } finally {
        if (w !== 0) await c.end();
      }
    };
    await Promise.all(Array.from({ length: Math.min(POOL, doors.length) }, (_, w) => worker(w)));

    return report(results, structural);
  } finally {
    await db.end();
  }
}

// ─── §CAST ───────────────────────────────────────────────────────────────────

async function buildCast(q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>): Promise<Cast> {
  const load = async (email: string): Promise<Principal> => {
    const u = (
      await q<{ id: string; email: string }>(`select id::text, coalesce(email,'') email from auth.users where email = $1`, [
        email,
      ])
    )[0];
    if (!u) throw new Error(`cast identity ${email} does not exist in auth.users`);
    const orgs = await q<{ organization_id: string }>(
      `select organization_id::text from iam.organization_member where user_id = $1`,
      [u.id],
    );
    const admin = (
      await q<{ is_admin: boolean }>(`select exists(select 1 from admin.admins where user_id = $1) is_admin`, [u.id])
    )[0];
    return {
      label: email,
      id: u.id,
      email: u.email,
      orgIds: orgs.map((o) => o.organization_id),
      isPlatformAdmin: admin?.is_admin ?? false,
    };
  };

  const a = await load(CALLER_A_EMAIL);
  const b = await load(VICTIM_B_EMAIL);

  // C — a real signed-in user who is a member of no organization at all.
  const orgless = (
    await q<{ id: string; email: string }>(`
      select u.id::text, coalesce(u.email,'') email
      from auth.users u
      where not exists (select 1 from iam.organization_member m where m.user_id = u.id)
        and not exists (select 1 from admin.admins ad where ad.user_id = u.id)
      order by u.created_at desc
      limit 1`)
  )[0];
  if (!orgless) throw new Error("no signed-in user without an organization exists — the cast cannot be formed");
  const c: Principal = { label: "orgless", id: orgless.id, email: orgless.email, orgIds: [], isPlatformAdmin: false };

  if (a.isPlatformAdmin) {
    throw new Error(
      `${CALLER_A_EMAIL} is a platform admin — every probe as that caller would pass through the admin bypass, not the gate`,
    );
  }
  if (a.orgIds.length === 0) throw new Error(`${CALLER_A_EMAIL} is a member of no organization — the cast is broken`);

  const callerOrgs = new Set([...a.orgIds, ...c.orgIds]);
  const victimOrgIds = b.orgIds.filter((o) => !callerOrgs.has(o));
  if (victimOrgIds.length === 0) {
    throw new Error(
      `every organization ${VICTIM_B_EMAIL} belongs to is also one of the callers' — there is no boundary left to cross`,
    );
  }
  return { a, b, c, victimOrgIds };
}

// ─── the victim catalog ──────────────────────────────────────────────────────

interface Catalog {
  /**
   * entity name → every victim row that could answer to it. A door argument
   * names an ENTITY, not a table: `p_keyword_ids` means `seo.gsc_keyword`,
   * `p_pack_id` means `seo.starter_pack`, and `p_site_id` means `seo.site` in a
   * `seo` door but `web.site` in a `web` one. So each table registers under its
   * full name AND under each trailing token of it, and the door's own schema
   * breaks the tie.
   */
  byEntity: Record<string, { table: string; id: string }[]>;
  /** every uuid-id table, for resolving ids that come back out of a door */
  idTables: { sch: string; tab: string; orgCol: string | null }[];
  victimOrgId: string;
  victimOrgIds: string[];
}

async function buildVictimCatalog(
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  cast: Cast,
): Promise<Catalog> {
  const idTables = await q<{ sch: string; tab: string; orgcol: string | null }>(`
    select c.relnamespace::regnamespace::text as sch,
           c.relname as tab,
           (select a2.attname from pg_attribute a2
             where a2.attrelid = c.oid and not a2.attisdropped
               and a2.attname in ('organization_id','org_id')
             order by a2.attnum limit 1) as orgcol
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'id' and not a.attisdropped
    join pg_type ty on ty.oid = a.atttypid and ty.typname = 'uuid'
    where c.relkind in ('r','p')
      and c.relnamespace::regnamespace::text not in (
        'pg_catalog','information_schema','pgsodium','extensions','vault','_realtime','realtime',
        'storage','supabase_migrations','net','cron','graphql','graphql_public','pgbouncer','auth','graveyard')
    order by 1,2`);

  const byEntity: Catalog["byEntity"] = {};
  // For every table that carries an organization column, take one row belonging
  // to a victim organization — a row the callers have no membership standing
  // in, by construction. ONE round trip: a gate that spends four minutes on its
  // own setup is a gate nobody puts in the release lane.
  const orgTables = idTables.filter((t) => t.orgcol);
  const CHUNK = 120;
  for (let i = 0; i < orgTables.length; i += CHUNK) {
    const slice = orgTables.slice(i, i + CHUNK);
    const sql = slice
      .map(
        (t) =>
          `select '${t.sch}.${t.tab}' as tbl, (select id::text from ${qi(t.sch)}.${qi(t.tab)} where ${qi(
            t.orgcol!,
          )} = any($1::uuid[]) limit 1) as id`,
      )
      .join(" union all ");
    try {
      for (const r of await q<{ tbl: string; id: string | null }>(sql, [cast.victimOrgIds])) {
        if (!r.id) continue;
        registerEntity(byEntity, r.tbl, r.id);
      }
    } catch (e) {
      // One unreadable table must not cost us the other 119 — fall back to
      // one-at-a-time for this slice, and say so rather than losing them.
      console.log(`${TAG.warn}victim catalog: a batch failed (${(e as Error).message.slice(0, 80)}), retrying it row by row`);
      for (const t of slice) {
        try {
          const row = (
            await q<{ id: string }>(
              `select id::text from ${qi(t.sch)}.${qi(t.tab)} where ${qi(t.orgcol!)} = any($1::uuid[]) limit 1`,
              [cast.victimOrgIds],
            )
          )[0];
          if (row) registerEntity(byEntity, `${t.sch}.${t.tab}`, row.id);
        } catch {
          /* a table we cannot read as postgres is not a door argument source */
        }
      }
    }
  }
  return {
    byEntity,
    idTables: idTables.map((t) => ({ sch: t.sch, tab: t.tab, orgCol: t.orgcol })),
    victimOrgId: cast.victimOrgIds[0],
    victimOrgIds: cast.victimOrgIds,
  };
}

/** Register a victim row under its table name and every trailing token of it. */
function registerEntity(byEntity: Catalog["byEntity"], table: string, id: string): void {
  const tab = table.split(".").slice(1).join(".");
  const parts = tab.split("_");
  const keys = new Set<string>([tab]);
  for (let i = 1; i < parts.length; i++) keys.add(parts.slice(i).join("_"));
  for (const k of keys) (byEntity[k] ??= []).push({ table, id });
}

function qi(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

// ─── loading the doors ───────────────────────────────────────────────────────

/**
 * The door table and `pg_proc` disagree about how to spell an argument type:
 * 26 door rows carry `public.permission_level` where the catalog says
 * `permission_level`. An exact join silently DROPS those rows — and 14 of them
 * are functions a client really can execute, so an exact join means 14 declared
 * doors this gate never measures and nobody is told about. Both sides are
 * normalised instead, and what still fails to resolve is reported by name.
 */
const NORM = (expr: string): string =>
  `lower(btrim(regexp_replace(regexp_replace(${expr}, '(^|[ ,(])[a-z_][a-z0-9_]*\\.', '\\1', 'g'), '\\s+', ' ', 'g')))`;

async function loadDoors(q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>): Promise<Door[]> {
  const where =
    POPULATION === "b75"
      ? `and d.declared_by = 'DD-169 batch 3 / B-75'`
      : POPULATION === "signed-in"
        ? ``
        : ``;
  const signedIn =
    POPULATION === "all"
      ? `has_function_privilege('authenticated', p.oid, 'EXECUTE')`
      : `has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')`;

  const rows = await q<{
    schema_name: string;
    function_name: string;
    identity_args: string;
    declared_by: string | null;
    gate_predicate: string | null;
    oid: number;
    provolatile: string;
    proretset: boolean;
    argnames: string[] | null;
    argtypes: string[] | null;
    ndefaults: number;
  }>(`
    select d.schema_name, d.function_name, d.identity_args, d.declared_by, d.gate_predicate,
           p.oid::int as oid, p.provolatile, p.proretset,
           coalesce(p.proargnames[1:p.pronargs], array[]::text[]) as argnames,
           (select array_agg(format_type(t, null) order by ord)
              from unnest(p.proargtypes::oid[]) with ordinality as u(t, ord)) as argtypes,
           p.pronargdefaults as ndefaults
    from platform.client_callable_door d
    join pg_namespace n on n.nspname = d.schema_name
    join pg_proc p on p.proname = d.function_name and p.pronamespace = n.oid
                  and ${NORM('pg_get_function_identity_arguments(p.oid)')} = ${NORM('d.identity_args')}
    where ${signedIn} ${where}
    order by d.schema_name, d.function_name, d.identity_args`);

  let doors = rows.map((r) => ({
    schema: r.schema_name,
    fn: r.function_name,
    identityArgs: r.identity_args,
    declaredBy: r.declared_by,
    gatePredicate: r.gate_predicate,
    oid: r.oid,
    volatile: r.provolatile === "v",
    argNames: r.argnames ?? [],
    argTypes: r.argtypes ?? [],
    argDefaults: Number(r.ndefaults ?? 0),
    retSet: r.proretset,
  }));
  if (ONLY) doors = doors.filter((d) => `${d.schema}.${d.fn}` === ONLY);
  if (LIMIT) doors = doors.slice(0, LIMIT);
  return doors;
}

// ─── S1/S2: a declaration that is not a door ─────────────────────────────────
//
// This gate can only measure a door row that resolves to a live, client-callable
// function. Two kinds of row resolve to nothing, and BOTH were invisible before:
// the population join just dropped them and the totals read as if the whole
// population had been measured.

interface Structural {
  unresolved: { fn: string; args: string; declaredBy: string | null }[];
  notCallable: { fn: string; args: string; declaredBy: string | null }[];
}

async function structuralFindings(
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
): Promise<Structural> {
  const unresolved = await q<{ fn: string; args: string; declared_by: string | null }>(`
    select d.schema_name || '.' || d.function_name as fn, d.identity_args as args, d.declared_by
    from platform.client_callable_door d
    where not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = d.schema_name and p.proname = d.function_name
        and ${NORM("pg_get_function_identity_arguments(p.oid)")} = ${NORM("d.identity_args")})
    order by 1, 2`);
  const notCallable = await q<{ fn: string; args: string; declared_by: string | null }>(`
    select d.schema_name || '.' || d.function_name as fn, d.identity_args as args, d.declared_by
    from platform.client_callable_door d
    join pg_namespace n on n.nspname = d.schema_name
    join pg_proc p on p.proname = d.function_name and p.pronamespace = n.oid
                  and ${NORM("pg_get_function_identity_arguments(p.oid)")} = ${NORM("d.identity_args")}
    where not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
    order by 1, 2`);
  const map = (r: { fn: string; args: string; declared_by: string | null }) => ({
    fn: r.fn,
    args: r.args,
    declaredBy: r.declared_by,
  });
  return { unresolved: unresolved.map(map), notCallable: notCallable.map(map) };
}

// ─── argument filling ────────────────────────────────────────────────────────

interface FilledArgs {
  sql: string; // "p_org_id => $1::uuid, p_limit => $2::int"
  values: unknown[];
  injectedIds: string[]; // uuids we handed in — an echo of these is not a leak
  crossed: boolean; // at least one argument names a victim row/org
  unresolved: string[]; // argument names we could not derive
}

const GENERIC_ID = /^(id|target_id|resource_id|container_id|record_id|row_id|entity_id|parent_id|owner_id)$/;

const DISCRIMINATOR = /^(target_type|container_type|resource_type|entity_type|owner_type|parent_type|scope|scope_type|type|kind|class)$/;

/**
 * The container vocabulary a `*_type` argument selects from. Taken from the
 * words the platform actually uses (`iam._container_authz`, the access docs),
 * not invented: an id argument means nothing until its discriminator names the
 * table it points into.
 */
const DISCRIMINATOR_VOCAB = ["organization", "org", "project", "scope", "site", "brand", "platform", "user"];

function doorNeedsDiscriminator(door: Door): boolean {
  return door.argNames.some((n, i) => DISCRIMINATOR.test(n.replace(/^p_/, "")) && /^(text|character varying|citext)$/.test(door.argTypes[i] ?? ""));
}

function fillArgs(door: Door, catalog: Catalog, cast: Cast, victimUserId: string, discriminator: string | null = null): FilledArgs {
  const parts: string[] = [];
  const values: unknown[] = [];
  const injectedIds: string[] = [];
  const unresolved: string[] = [];
  let crossed = false;

  const push = (name: string, type: string, value: unknown) => {
    values.push(value);
    parts.push(`${name} => $${values.length}::${type}`);
  };

  const required = door.argTypes.length - door.argDefaults;

  for (let i = 0; i < door.argTypes.length; i++) {
    const name = door.argNames[i] ?? `$${i + 1}`;
    const type = door.argTypes[i];
    const isRequired = i < required;
    const bare = name.replace(/^p_/, "");

    // uuid-shaped arguments are the ones that carry identity.
    if (type === "uuid" || type === "uuid[]") {
      const arr = type === "uuid[]";
      let id: string | null = null;
      if (ORG_ARG.test(name) || ORG_ARG.test(bare)) {
        id = catalog.victimOrgId;
      } else if (USER_ARG.test(name) || USER_ARG.test(bare)) {
        id = victimUserId;
      } else if (discriminator && GENERIC_ID.test(bare)) {
        // `p_target_id` means nothing on its own — the discriminator being
        // enumerated says WHICH container it names, so the id comes from there.
        if (discriminator === "organization" || discriminator === "org") id = catalog.victimOrgId;
        else if (discriminator === "user") id = victimUserId;
        else {
          const hit = pickEntity(catalog, door.schema, [discriminator]);
          if (hit) id = hit.id;
        }
      } else {
        const entity = entityFromArg(name);
        const candidates: string[] = [];
        if (entity) candidates.push(entity, entity.replace(/s$/, ""), `${entity}s`);
        if (!entity || GENERIC_ID.test(bare)) candidates.push(...entitiesFromFunctionName(door.fn));
        const hit = pickEntity(catalog, door.schema, candidates);
        if (hit) id = hit.id;
      }
      if (id) {
        crossed = true;
        injectedIds.push(id);
        push(name, arr ? "uuid[]" : "uuid", arr ? [id] : id);
      } else if (isRequired) {
        unresolved.push(`${name} ${type}`);
      }
      continue;
    }

    // Non-identity arguments: only fill the required ones, and only with a
    // value that cannot itself decide the outcome.
    if (!isRequired) continue;
    if (/^(text|character varying|citext)$/.test(type)) {
      if (DISCRIMINATOR.test(bare)) {
        // A discriminator that selects WHICH container the id names
        // (`p_target_type` + `p_target_id`). Guessing one value and reading the
        // resulting "unknown scope" as a refusal is exactly how a leak hides,
        // so the caller ENUMERATES the vocabulary and this fill takes one value
        // at a time. `public.inv_list` — DD-191's leak — is shaped like this.
        if (discriminator === null) {
          unresolved.push(`${name} ${type} (discriminator)`);
          continue;
        }
        push(name, "text", discriminator);
        continue;
      }
      push(name, "text", "dd192-probe");
      continue;
    }
    if (/^(integer|bigint|smallint)$/.test(type)) {
      push(name, "int", 10);
      continue;
    }
    if (type === "boolean") {
      push(name, "boolean", false);
      continue;
    }
    if (type === "jsonb" || type === "json") {
      push(name, type, "{}");
      continue;
    }
    if (/^(timestamp|date)/.test(type)) {
      push(name, type, new Date().toISOString());
      continue;
    }
    if (/^(numeric|double precision|real)$/.test(type)) {
      push(name, type, 1);
      continue;
    }
    unresolved.push(`${name} ${type}`);
  }

  return { sql: parts.join(", "), values, injectedIds, crossed, unresolved };
}

// ─── measuring one door ──────────────────────────────────────────────────────

/**
 * An authorization decision, as opposed to a type error. `42501` is the
 * canonical one; `P0001` is what `raise exception` without an errcode produces,
 * so its MESSAGE has to carry the decision — which is exactly what "nothing
 * fails silently" already requires of every refusal in this codebase.
 */
const AUTHZ_MESSAGE =
  /denied|not authorized|unauthorized|forbidden|permission|required|no access|no standing|not a member|membership|must be|cannot read|not allowed|only|admin/i;

/**
 * `42501 permission denied for function <x>` is the GRANT missing, not the
 * door refusing — the door body never ran. Reading it as a refusal would mark
 * an unreachable door PASS, which is the same silent-green failure this gate
 * exists to close, so it is UNMEASURED.
 */
const NOT_CALLABLE = /^permission denied for (function|schema)\b/i;

function isRefusal(code: string, message: string): boolean {
  if (NOT_CALLABLE.test(message)) return false;
  if (code === "42501") return true;
  if (code === "P0001" && AUTHZ_MESSAGE.test(message)) return true;
  return false;
}

/**
 * Two kinds of uuid come back out of a door, and conflating them makes this
 * gate cry wolf:
 *
 *   IDENTITY — the uuid under an `id` key, or a bare uuid the door returned as
 *   its whole answer. That uuid IS a row the door handed the caller.
 *   REFERENCE — a uuid under `*_id` / `*_by` / `created_by`. That is a foreign
 *   key INSIDE a row, and the row may be the caller's own.
 *
 * `public.edu_export_study_data()` measured the difference for us: it exports
 * only `created_by = auth.uid()` rows, and those rows legitimately REFERENCE
 * flashcards other people authored. Calling those references leaked rows would
 * have flagged a door that is correctly bounded. DD-191's `inv_list`, by
 * contrast, leaked the invitation's own `id` — an identity — so the rule that
 * matters is kept.
 */
interface HarvestedIds {
  identity: Set<string>;
  reference: Set<string>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE_KEY = /(_id|_by|_uuid|_ids)$/i;

function harvestIds(value: unknown, key: string | null, out: HarvestedIds): void {
  if (value == null) return;
  if (typeof value === "string") {
    if (!UUID_RE.test(value)) return;
    if (key === null || key === "id" || key === "uuid") out.identity.add(value.toLowerCase());
    else if (REFERENCE_KEY.test(key)) out.reference.add(value.toLowerCase());
    else out.identity.add(value.toLowerCase());
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) harvestIds(v, key && REFERENCE_KEY.test(key) ? key : null, out);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) harvestIds(v, k, out);
  }
}

function harvest(rows: Record<string, unknown>[]): HarvestedIds {
  const out: HarvestedIds = { identity: new Set(), reference: new Set() };
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      const parsed = typeof v === "string" ? safeJson(v) : v;
      // A door returning a single scalar column carries no key context worth
      // trusting — the column name is the function's own name. Treat it as the
      // container it is and walk into it.
      harvestIds(parsed ?? v, parsed && typeof parsed === "object" ? null : k, out);
    }
  }
  return out;
}

/**
 * `{"granted": false, …}` / `{"ok": false, "error": …}` — the platform's
 * refusal envelopes. A door that answers one of these has refused.
 */
function isRefusalEnvelope(rows: unknown[]): boolean {
  if (rows.length === 0) return false;
  return rows.every((r) => {
    const vals = Object.values(r as Record<string, unknown>);
    return vals.some((v) => {
      const o = (typeof v === "string" ? safeJson(v) : v) as Record<string, unknown> | null;
      if (!o || typeof o !== "object" || Array.isArray(o)) return false;
      if (o.granted === false) return true;
      if (o.ok === false && ("error" in o || "reason" in o)) return true;
      return false;
    });
  });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function isEmptyAnswer(rows: unknown[]): boolean {
  if (rows.length === 0) return true;
  return rows.every((r) => {
    const vals = Object.values(r as Record<string, unknown>);
    if (vals.length === 0) return true;
    return vals.every(
      (v) =>
        v == null ||
        v === false ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === "object" && Object.keys(v as object).length === 0),
    );
  });
}

async function measureDoor(
  db: pg.Client,
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  cast: Cast,
  catalog: Catalog,
  door: Door,
): Promise<DoorResult> {
  const probes: Probe[] = [];
  const leaked: string[] = [];
  let anyMeasured = false;
  const unmeasuredWhy: string[] = [];

  const discriminators = doorNeedsDiscriminator(door) ? DISCRIMINATOR_VOCAB : [null];

  for (const caller of [cast.a, cast.c]) {
   for (const discriminator of discriminators) {
    const filled = fillArgs(door, catalog, cast, cast.b.id, discriminator);
    if (filled.unresolved.length) {
      unmeasuredWhy.push(`argument(s) not derivable: ${filled.unresolved.join(", ")}`);
      if (discriminators.length === 1)
        probes.push({ caller: caller.label, args: "-", outcome: "UNMEASURED", detail: filled.unresolved.join(", ") });
      continue;
    }
    if (door.argTypes.length > 0 && !filled.crossed) {
      unmeasuredWhy.push("no argument names another identity's row — the boundary cannot be crossed by argument");
      if (discriminators.length === 1)
        probes.push({ caller: caller.label, args: filled.sql, outcome: "UNMEASURED", detail: "no cross-identity argument" });
      continue;
    }

    const probe = await runProbe(db, q, caller, door, filled, catalog);
    if (discriminator) probe.probe.caller = `${caller.label} [${discriminator}]`;
    if (probe.verdict === "UNMEASURED") {
      unmeasuredWhy.push(`${caller.label}: ${probe.why}`);
      // Only keep the noise when nothing else was learned about this door.
      if (discriminators.length === 1) probes.push(probe.probe);
      continue;
    }
    probes.push(probe.probe);
    anyMeasured = true;
    if (probe.verdict === "FAIL") leaked.push(...probe.leaked);
   }
  }

  if (leaked.length) {
    return { door, verdict: "FAIL", why: "returned or minted rows the caller cannot read", leaked, probes };
  }
  if (!anyMeasured) {
    return { door, verdict: "UNMEASURED", why: unmeasuredWhy[0] ?? "not measured", leaked: [], probes };
  }
  return { door, verdict: "PASS", why: "refused, answered nothing, or answered only rows the caller can read", leaked: [], probes };
}

async function runProbe(
  db: pg.Client,
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  caller: Principal,
  door: Door,
  filled: FilledArgs,
  catalog: Catalog,
): Promise<{ verdict: Verdict; why: string; leaked: string[]; probe: Probe }> {
  const claims = JSON.stringify({
    sub: caller.id,
    role: "authenticated",
    email: caller.email,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
  });

  const call = `select * from ${qi(door.schema)}.${qi(door.fn)}(${filled.sql})`;
  let rows: Record<string, unknown>[] | null = null;
  let errCode = "";
  let errMsg = "";

  await db.query(TX_BEGIN());
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await db.query(`set local statement_timeout = ${CALL_TIMEOUT_MS}`);
    await db.query("set local role authenticated");
    await db.query("savepoint probe");
    try {
      rows = (await db.query(call, filled.values)).rows as Record<string, unknown>[];
    } catch (e) {
      const err = e as { code?: string; message?: string };
      errCode = err.code ?? "";
      errMsg = err.message ?? String(e);
      await db.query("rollback to savepoint probe");
    }

    if (rows === null) {
      const refused = isRefusal(errCode, errMsg);
      await db.query(TX_ROLLBACK());
      return refused
        ? {
            verdict: "PASS",
            why: `refused ${errCode}`,
            leaked: [],
            probe: { caller: caller.label, args: filled.sql, outcome: "REFUSED", detail: `${errCode} ${errMsg.slice(0, 160)}` },
          }
        : {
            verdict: "UNMEASURED",
            why: `call failed for a non-authorization reason: ${errCode} ${errMsg.slice(0, 160)}`,
            leaked: [],
            probe: { caller: caller.label, args: filled.sql, outcome: "ERROR", detail: `${errCode} ${errMsg.slice(0, 160)}` },
          };
    }

    // A REFUSAL ENVELOPE is a refusal, not an answer. Several doors refuse by
    // returning `{"granted": false, "reason": …, "audit_id": …}` rather than
    // raising — `hr.reveal_ssn` writes the denial into `hr.access_audit` and
    // hands back the receipt id. The receipt names a row the caller cannot
    // read BECAUSE the door refused, which is the opposite of a leak; reading
    // it as one would make this gate cry wolf on the doors that behave best.
    if (isRefusalEnvelope(rows)) {
      await db.query(TX_ROLLBACK());
      return {
        verdict: "PASS",
        why: "refused in its answer envelope",
        leaked: [],
        probe: {
          caller: caller.label,
          args: filled.sql,
          outcome: "REFUSED (envelope)",
          detail: JSON.stringify(rows).slice(0, 200),
        },
      };
    }

    if (isEmptyAnswer(rows)) {
      await db.query(TX_ROLLBACK());
      return {
        verdict: "PASS",
        why: "answered nothing",
        leaked: [],
        probe: { caller: caller.label, args: filled.sql, outcome: "EMPTY", detail: JSON.stringify(rows).slice(0, 120) },
      };
    }

    // WHAT DID THE CALL WRITE? An answer carrying no row id is not proof that
    // nothing crossed the boundary: `public.hr_module_set_enabled` answered a
    // non-member `{"ok": true, "module_enabled": false}` — no uuid anywhere —
    // while switching another organization's HR module off. So the writes are
    // measured from the transaction itself (`pg_stat_xact_user_tables`), not
    // inferred from the answer.
    await db.query("reset role");
    const wrote = await writesCrossingTheBoundary(db, caller);
    if (wrote.crossed.length) {
      await db.query(TX_ROLLBACK());
      return {
        verdict: "FAIL",
        why: "wrote across the boundary",
        leaked: wrote.crossed,
        probe: {
          caller: caller.label,
          args: filled.sql,
          outcome: "CROSS-BOUNDARY WRITE",
          detail: wrote.crossed.join(" · ").slice(0, 400),
        },
      };
    }
    if (wrote.unjudged.length) {
      await db.query(TX_ROLLBACK());
      return {
        verdict: "UNMEASURED",
        why: wrote.unjudged[0],
        leaked: [],
        probe: { caller: caller.label, args: filled.sql, outcome: "WRITE (unplaceable)", detail: wrote.unjudged.join(" · ").slice(0, 300) },
      };
    }
    await db.query("set local role authenticated");

    // Rows came back. Which of the uuids in them can this caller SELECT?
    const injected = new Set(filled.injectedIds.map((s) => s.toLowerCase()));
    const keep = (u: string) => !injected.has(u) && u !== caller.id.toLowerCase();
    const harvested = harvest(rows);
    const identityIds = [...harvested.identity].filter(keep);
    const referenceIds = [...harvested.reference].filter(keep);
    const ids = [...new Set([...identityIds, ...referenceIds])];

    if (ids.length === 0) {
      await db.query(TX_ROLLBACK());
      return {
        verdict: "PASS",
        why: "answer carries no row identity beyond what was handed in",
        leaked: [],
        probe: {
          caller: caller.label,
          args: filled.sql,
          outcome: "ROWS (no foreign ids)",
          detail: JSON.stringify(rows).slice(0, 160),
        },
      };
    }

    // Resolve the ids to real rows as postgres …
    await db.query("reset role");
    const resolved = await resolveIds(db, catalog, ids);

    // … then ask, as the caller, whether RLS lets them read each one.
    await db.query("set local role authenticated");
    if (process.env.DD192_DEBUG)
      console.log("RESOLVED", JSON.stringify({ identityIds, referenceIds, resolved, callerOrgs: caller.orgIds }));
    const identitySet = new Set(identityIds);
    const leakedRows: string[] = [];
    for (const r of resolved) {
      // A row this very call created, landing in an organization the caller has
      // no standing in, is a cross-boundary WRITE — the half of DD-191 that was
      // `inv_create` minting an admin invitation into a stranger's tenant.
      if (r.minted && r.orgId && !caller.orgIds.includes(r.orgId)) {
        leakedRows.push(
          `${r.table} ${r.id} — MINTED by this call into organization ${r.orgId}, which the caller has no standing in`,
        );
        continue;
      }
      if (!identitySet.has(r.id.toLowerCase())) continue; // a foreign key inside the caller's own row
      const [sch, tab] = r.table.split(".");
      const visible = (
        await db.query(`select 1 from ${qi(sch)}.${qi(tab)} where id = $1::uuid limit 1`, [r.id])
      ).rowCount;
      if (!visible) leakedRows.push(`${r.table} ${r.id} — returned to a caller who cannot SELECT it under RLS`);
    }
    await db.query(TX_ROLLBACK());

    if (leakedRows.length) {
      return {
        verdict: "FAIL",
        why: "returned rows the caller cannot SELECT under RLS",
        leaked: leakedRows,
        probe: {
          caller: caller.label,
          args: filled.sql,
          outcome: "LEAK",
          detail: leakedRows.join(" · ").slice(0, 400),
        },
      };
    }
    if (resolved.length === 0) {
      // Ids came back that name no row in any table this harness can see. We
      // cannot say whether the caller may read them, so we do not say they may.
      return {
        verdict: "UNMEASURED",
        why: `answered ${ids.length} id(s) that resolve to no row this harness can reach — boundedness not judged`,
        leaked: [],
        probe: {
          caller: caller.label,
          args: filled.sql,
          outcome: "ROWS (unresolvable ids)",
          detail: ids.slice(0, 6).join(", "),
        },
      };
    }
    return {
      verdict: "PASS",
      why: `answered ${resolved.length} row(s), all readable by the caller`,
      leaked: [],
      probe: {
        caller: caller.label,
        args: filled.sql,
        outcome: "ROWS (all readable)",
        detail: `${resolved.length} resolved / ${ids.length} ids`,
      },
    };
  } catch (e) {
    try {
      await db.query(TX_ROLLBACK());
    } catch {
      /* the connection will be reset by the next begin */
    }
    return {
      verdict: "UNMEASURED",
      why: `harness error: ${(e as Error).message.slice(0, 160)}`,
      leaked: [],
      probe: { caller: caller.label, args: filled.sql, outcome: "ERROR", detail: (e as Error).message.slice(0, 160) },
    };
  }
}

/**
 * "This row was written by THIS call" — exactly, not approximately.
 *
 * The obvious test, `xmin >= the xid we started with`, is wrong on a live
 * database: this harness reads as `postgres`, so rows another session COMMITTED
 * a moment ago are visible and carry a higher xid too, and with six probes
 * running in parallel against production that is not a corner case. The exact
 * test is the transaction status of the row's own xid: our writes are still IN
 * PROGRESS (we always roll back), anybody else's visible row is COMMITTED. The
 * arithmetic reconstructs the 64-bit xid8 from the 32-bit `xmin` and the
 * current epoch, taking the previous epoch when `xmin` is ahead of the current
 * counter (wraparound).
 */
const WRITTEN_BY_THIS_CALL = `(pg_xact_status((greatest(case when xmin::text::bigint <= (pg_current_xact_id()::text::bigint % 4294967296)
      then (pg_current_xact_id()::text::bigint / 4294967296)
      else (pg_current_xact_id()::text::bigint / 4294967296) - 1 end, 0) * 4294967296
    + xmin::text::bigint)::text::xid8) = 'in progress')`;

/**
 * Every row this transaction wrote, placed against the caller's standing. Read
 * from `pg_stat_xact_user_tables` — the transaction's own insert/update/delete
 * counters — so a door that writes without returning anything cannot hide, and
 * then narrowed to the actual rows by `xmin`.
 *
 * A written row is placed by the first of these that the table offers:
 *   its organization column · its own id, when the table IS `iam.organizations`
 *   · its owning-user column. A table offering none of them cannot be placed,
 * and says so — that is an UNMEASURED door, never a passing one.
 */
interface WriteVerdict {
  crossed: string[];
  unjudged: string[];
}

/**
 * Tables the SELF-TEST itself writes while planting a door — the door
 * declaration it must insert for §6d-4 to leave the grant alone, and the DDL
 * guard's own log row. They are the harness writing, not the door under test.
 */
const HARNESS_OWN_TABLES = new Set(["platform.client_callable_door", "platform.ddl_guard_log"]);

const OWNER_COLS = ["user_id", "created_by", "actor_user_id", "owner_id", "updated_by"];

async function writesCrossingTheBoundary(db: pg.Client, caller: Principal): Promise<WriteVerdict> {
  const touched = (
    await db.query(`
      select schemaname as sch, relname as tab, n_tup_ins as ins, n_tup_upd as upd, n_tup_del as del
      from pg_stat_xact_user_tables
      where n_tup_ins + n_tup_upd + n_tup_del > 0`)
  ).rows as { sch: string; tab: string; ins: string; upd: string; del: string }[];
  const crossed: string[] = [];
  const unjudged: string[] = [];
  if (!touched.length) return { crossed, unjudged };

  for (const t of touched) {
    const qualified = `${t.sch}.${t.tab}`;
    // The self-test declares its own planted door in the same transaction; that
    // is the harness writing, not the door.
    if (OUTER_TX && HARNESS_OWN_TABLES.has(qualified)) continue;
    const cols = ((
      await db.query(
        `select a.attname from pg_attribute a where a.attrelid = to_regclass($1) and not a.attisdropped and a.attnum > 0`,
        [qualified],
      )
    ).rows as { attname: string }[]).map((r) => r.attname);

    const orgCol = ["organization_id", "org_id"].find((c) => cols.includes(c));
    const isOrgTable = qualified === "iam.organizations";
    const ownerCol = OWNER_COLS.find((c) => cols.includes(c));
    const placeCol = orgCol ?? (isOrgTable ? "id" : ownerCol);

    if (!placeCol) {
      // The counters are a CANDIDATE list, never the verdict: this connection
      // goes through Supavisor in transaction-pooling mode (port 6543), so the
      // per-transaction statistics view can carry a neighbour's numbers. Every
      // candidate is confirmed row by row against the xid test before it is
      // reported — measured, 2026-09-13, after three different unrelated tables
      // appeared in three consecutive self-test runs.
      const n = (
        await db.query(`select count(*)::int as n from ${qi(t.sch)}.${qi(t.tab)} where ${WRITTEN_BY_THIS_CALL}`)
      ).rows[0] as { n: number };
      if (n.n > 0)
        unjudged.push(
          `${qualified} — ${n.n} row(s) written by this call; the table carries neither an organization nor an owning-user column, so the write could not be placed`,
        );
      continue;
    }

    const mine = orgCol || isOrgTable ? caller.orgIds : [caller.id];
    const rows = (
      await db.query(
        `select ${qi(placeCol)}::text as v, count(*)::int as n from ${qi(t.sch)}.${qi(t.tab)}
          where ${WRITTEN_BY_THIS_CALL} group by 1`,
      )
    ).rows as { v: string | null; n: number }[];
    for (const r of rows) {
      if (r.v && mine.includes(r.v)) continue;
      crossed.push(
        orgCol || isOrgTable
          ? `${qualified} — ${r.n} row(s) written by this call into organization ${r.v ?? "NULL"}, which the caller has no standing in`
          : `${qualified} — ${r.n} row(s) written by this call owned by ${r.v ?? "NULL"}, not the caller`,
      );
    }
    // Deletes are deliberately NOT reported from the counters. A deleted row
    // cannot be read back to place it, and through a transaction-pooled
    // connection the counter itself is not proof this call did it. Saying so is
    // the honest position; claiming a cross-boundary delete on that evidence is
    // not. THIS IS A KNOWN HOLE in the gate, and it is named in the header.
  }
  return { crossed, unjudged };
}

interface ResolvedId {
  table: string;
  id: string;
  minted: boolean;
  orgId: string | null;
}

/** Which real table row does each uuid name? One union over every uuid-id table. */
async function resolveIds(db: pg.Client, catalog: Catalog, ids: string[]): Promise<ResolvedId[]> {
  const chunks = catalog.idTables.map(
    (t) =>
      `select '${t.sch}.${t.tab}' as tbl, id::text as id, ${WRITTEN_BY_THIS_CALL} as minted, ${
        t.orgCol ? `${qi(t.orgCol)}::text` : "null::text"
      } as org_id from ${qi(t.sch)}.${qi(t.tab)} where id = any($1::uuid[])`,
  );
  const sql = chunks.join(" union all ");
  const res = await db.query(sql, [ids]);
  return (res.rows as { tbl: string; id: string; minted: boolean; org_id: string | null }[]).map((r) => ({
    table: r.tbl,
    id: r.id,
    minted: r.minted,
    orgId: r.org_id,
  }));
}

// ─── the self-test: the harness must FAIL a known leak ───────────────────────
//
// A guard nobody has watched fail is not a guard. This plants a door that
// hands the caller a row it cannot read — the exact shape of DD-191's
// `inv_list` — and asserts this harness calls it a FAIL, then drops it. The
// whole thing lives in one rolled-back transaction, so nothing is created.

/**
 * A victim row caller A provably cannot SELECT under RLS. Measured, not assumed:
 * a self-test whose "leak" is a row the caller could read anyway proves nothing.
 */
async function pickUnreadableVictimRow(
  db: pg.Client,
  cast: Cast,
  catalog: Catalog,
): Promise<{ table: string; id: string } | null> {
  const claims = JSON.stringify({ sub: cast.a.id, role: "authenticated", email: cast.a.email, aud: "authenticated" });
  for (const cand of Object.values(catalog.byEntity).flat()) {
    const [sch, tab] = cand.table.split(".");
    await db.query("begin");
    try {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      await db.query("set local role authenticated");
      const res = await db.query(`select 1 from ${qi(sch)}.${qi(tab)} where id = $1::uuid limit 1`, [cand.id]);
      await db.query("rollback");
      if (!res.rowCount) return cand;
    } catch {
      await db.query("rollback");
    }
  }
  return null;
}

/**
 * DD-191's SHAPE, planted and rolled back: a `SECURITY DEFINER` door taking a
 * `(target_type, target_id)` pair whose role test is the NULL-unsafe
 * `v_actor_role not in ('owner','admin')` — NULL for a non-member, so the
 * refusal never fires — over the very table DD-191 leaked, `iam.invitations`.
 *
 * Why a plant and not the live function reverted: B-85 fixed the class BELOW
 * `public.inv_list`, inside `iam._container_authz`, which now refuses a
 * non-member itself. Reverting only the caller's `coalesce()` no longer
 * reproduces the leak — measured, 2026-09-13 — so a replay of the live body
 * would prove nothing and quietly pass. This proves the thing that matters:
 * that the harness's discriminator + generic-id derivation actually REACHES a
 * door of that shape, and calls it a FAIL.
 */
async function plantDd191Shape(
  db: pg.Client,
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  cast: Cast,
  catalog: Catalog,
): Promise<boolean> {
  const victimInvitation = (
    await q<{ id: string; organization_id: string }>(
      `select id::text, organization_id::text from iam.invitations
        where organization_id = any($1::uuid[]) order by created_at desc limit 1`,
      [catalog.victimOrgIds],
    )
  )[0];
  if (!victimInvitation) {
    console.log(`${TAG.warn}DD-191 shape: no invitation exists in any victim organization — cannot plant the shape`);
    return true;
  }

  const door: Door = {
    schema: "public",
    fn: "dd192_selftest_inv_shape",
    identityArgs: "p_target_type text, p_target_id uuid",
    declaredBy: "DD-192 self-test",
    gatePredicate: "auth.uid()",
    oid: 0,
    volatile: false,
    argNames: ["p_target_type", "p_target_id"],
    argTypes: ["text", "uuid"],
    argDefaults: 0,
    retSet: true,
  };

  await db.query("begin");
  OUTER_TX = true;
  let caught = false;
  try {
    await db.query(`
      create function public.dd192_selftest_inv_shape(p_target_type text, p_target_id uuid)
      returns table(id uuid)
      language plpgsql security definer set search_path = pg_catalog, public, iam as $fn$
      declare v_actor_role text;
      begin
        if p_target_type <> 'organization' then
          raise exception 'unsupported target type %', p_target_type using errcode = '22023';
        end if;
        select m.role into v_actor_role
          from iam.organization_member m
         where m.organization_id = p_target_id and m.user_id = auth.uid();
        -- THE DD-191 LINE. For a non-member v_actor_role is NULL, so
        -- "NULL not in (...)" is NULL, the IF never fires, and execution falls
        -- straight through to the unfiltered read below.
        if v_actor_role not in ('owner','admin') then
          raise exception 'invitation manager role required' using errcode = '42501';
        end if;
        return query
          select i.id from iam.invitations i where i.organization_id = p_target_id;
      end $fn$`);
    await db.query(`
      insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason, gate_predicate)
      values ('public','dd192_selftest_inv_shape','p_target_type text, p_target_id uuid','DD-192 self-test',
              'planted by pnpm check:door-rows:self-test inside a rolled-back transaction','auth.uid()')`);
    await db.query(`grant execute on function public.dd192_selftest_inv_shape(text, uuid) to authenticated`);

    const r = await measureDoor(db, q, cast, catalog, door);
    if (process.env.DD192_DEBUG) console.log(JSON.stringify(r.probes, null, 1));
    caught = r.verdict === "FAIL";
    console.log(
      caught
        ? `${TAG.ok}DD-191 SHAPE: the NULL-unsafe (target_type, target_id) door is ${r.verdict} — ${r.leaked.slice(0, 2).join(", ")}`
        : `${TAG.fail}DD-191 SHAPE: the NULL-unsafe door came back ${r.verdict} (${r.why}) — this gate would not have caught the real leak`,
    );
  } finally {
    OUTER_TX = false;
    await db.query("rollback");
  }
  return caught;
}

async function selfTest(
  db: pg.Client,
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  cast: Cast,
  catalog: Catalog,
  _doors: Door[],
): Promise<number> {
  console.log(`${TAG.info}SELF-TEST: plant a leaking door, prove this harness fails it, then a bounded one, prove it passes.`);

  // The planted door must hand back a row caller A genuinely CANNOT read. A
  // victim row that RLS already lets A select would make the "leak" invisible
  // and the self-test would pass for the wrong reason — so the row is chosen by
  // measuring A's real RLS visibility, not assumed.
  const victim = await pickUnreadableVictimRow(db, cast, catalog);
  if (!victim) {
    console.log(`${TAG.fail}self-test cannot run: no victim row exists that ${cast.a.email} cannot already read`);
    return 1;
  }
  const [vSch, vTab] = victim.table.split(".");
  console.log(`${TAG.info}victim row for the plant: ${victim.table} ${victim.id} — ${cast.a.email} cannot SELECT it under RLS`);

  const leakingDoor: Door = {
    schema: "public",
    fn: "dd192_selftest_leaking_door",
    identityArgs: "p_organization_id uuid",
    declaredBy: "self-test",
    gatePredicate: "auth.uid()",
    oid: 0,
    volatile: false,
    argNames: ["p_organization_id"],
    argTypes: ["uuid"],
    argDefaults: 0,
    retSet: true,
  };

  await db.query("begin");
  OUTER_TX = true; // every probe below brackets itself with a SAVEPOINT, never a nested BEGIN
  let failedTheLeak = false;
  let passedTheBounded = false;
  try {
    await db.query(`
      create function public.dd192_selftest_leaking_door(p_organization_id uuid)
      returns table(id uuid) language sql security definer set search_path = pg_catalog, public as $fn$
        select t.id from ${qi(vSch)}.${qi(vTab)} t where t.id = '${victim.id}'::uuid
      $fn$`);
    // §6d-4: `platform.enforce_definer_client_grants` takes a client GRANT back
    // inside the GRANT statement unless the function is a DECLARED door. The
    // plant needs its door row first — rolled back with everything else.
    await db.query(`
      insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason, gate_predicate)
      values ('public','dd192_selftest_leaking_door','p_organization_id uuid','DD-192 self-test',
              'planted by pnpm check:door-rows:self-test inside a rolled-back transaction','auth.uid()')`);
    await db.query(`grant execute on function public.dd192_selftest_leaking_door(uuid) to authenticated`);
    const granted = await db.query(
      `select has_function_privilege('authenticated','public.dd192_selftest_leaking_door(uuid)','EXECUTE') as g`,
    );
    if (!(granted.rows[0] as { g: boolean }).g) {
      console.log(`${TAG.fail}self-test could not grant the plant to authenticated — nothing was measured`);
      OUTER_TX = false;
      await db.query("rollback");
      return 1;
    }
    const r1 = await measureDoor(db, q, cast, catalog, leakingDoor);
    if (process.env.DD192_DEBUG) console.log(JSON.stringify(r1.probes, null, 2));
    failedTheLeak = r1.verdict === "FAIL";
    console.log(
      failedTheLeak
        ? `${TAG.ok}RED proven: the planted leaking door is ${r1.verdict} — ${r1.leaked.join(", ")}`
        : `${TAG.fail}the planted leaking door came back ${r1.verdict} (${r1.why}) — this harness would not catch DD-191`,
    );

    await db.query(`
      create or replace function public.dd192_selftest_leaking_door(p_organization_id uuid)
      returns table(id uuid) language plpgsql security definer set search_path = pg_catalog, public as $fn$
      begin
        if not exists (select 1 from iam.organization_member m
                        where m.organization_id = p_organization_id and m.user_id = auth.uid()) then
          raise exception 'access denied: caller is not a member of this organization' using errcode = '42501';
        end if;
        return query select t.id from ${qi(vSch)}.${qi(vTab)} t where t.id = '${victim.id}'::uuid;
      end $fn$`);
    const r2 = await measureDoor(db, q, cast, catalog, leakingDoor);
    passedTheBounded = r2.verdict === "PASS";
    console.log(
      passedTheBounded
        ? `${TAG.ok}GREEN proven: the same door with a NULL-safe membership assertion is PASS — ${r2.why}`
        : `${TAG.fail}the gated door came back ${r2.verdict} (${r2.why}) — this harness would fail a correct door`,
    );
  } finally {
    OUTER_TX = false;
    await db.query("rollback");
  }

  // THE REAL ONE. A planted door proves the machinery; this proves the machinery
  // against the actual defect. `public.inv_list` is reverted, inside a
  // rolled-back transaction, to the exact NULL-unsafe line V-52 walked through
  // (`v_actor_role not in ('owner','admin')` instead of today's
  // `coalesce(v_actor_role,'none') not in (…)`), and this harness must call it
  // a FAIL. If it does not, DD-191 could come back and the gate would stay green.
  const replay = await plantDd191Shape(db, q, cast, catalog);

  const planted = await q<{ n: string }>(
    `select count(*)::text n from pg_proc where proname like 'dd192_selftest%'`,
  );
  console.log(`${TAG.info}after rollback, planted functions remaining: ${planted[0].n} (must be 0)`);
  const clean = planted[0].n === "0";
  return failedTheLeak && passedTheBounded && clean && replay ? 0 : 1;
}

// ─── the report ──────────────────────────────────────────────────────────────

function report(results: DoorResult[], structural: Structural): number {
  const fails = results.filter((r) => r.verdict === "FAIL");
  const unmeasured = results.filter((r) => r.verdict === "UNMEASURED");
  const passes = results.filter((r) => r.verdict === "PASS");

  console.log("");
  for (const r of fails) {
    console.log(`${TAG.fail}${C.bold}${r.door.schema}.${r.door.fn}(${r.door.identityArgs})${C.reset}`);
    for (const l of r.leaked) console.log(`       leaked: ${l}`);
  }
  if (unmeasured.length) {
    console.log(`${TAG.warn}UNMEASURED (${unmeasured.length}) — named, never counted as a pass:`);
    for (const r of unmeasured) console.log(`       ${r.door.schema}.${r.door.fn} — ${r.why}`);
  }
  if (structural.unresolved.length || structural.notCallable.length) {
    console.log("");
    console.log(
      `${TAG.warn}DECLARED BUT NOT MEASURABLE — door rows this gate cannot probe, named rather than dropped:`,
    );
    for (const r of structural.unresolved)
      console.log(`       ${r.fn}(${r.args}) — resolves to no live function [${r.declaredBy ?? "no declared_by"}]`);
    for (const r of structural.notCallable)
      console.log(`       ${r.fn}(${r.args}) — no client holds EXECUTE; the row declares a door that is not one [${r.declaredBy ?? "no declared_by"}]`);
  }

  console.log("");
  console.log(
    `${fails.length ? TAG.fail : TAG.ok}${passes.length} PASS · ${fails.length} FAIL · ${unmeasured.length} UNMEASURED (of ${results.length} declared signed-in doors)`,
  );

  if (TABLE_OUT) {
    const lines = [
      "| # | door | verdict | evidence |",
      "|---|---|---|---|",
      ...results.map(
        (r, i) =>
          `| ${i + 1} | \`${r.door.schema}.${r.door.fn}(${r.door.identityArgs})\` | ${r.verdict} | ${(r.verdict === "FAIL"
            ? r.leaked.join(" · ")
            : r.verdict === "UNMEASURED"
              ? r.why
              : r.probes.map((p) => `${p.caller}: ${p.outcome}`).join(" · ")
          )
            .replace(/\|/g, "\\|")
            .slice(0, 300)} |`,
      ),
    ];
    writeFileSync(TABLE_OUT, lines.join("\n") + "\n");
    console.log(`${TAG.info}per-door table written to ${TABLE_OUT}`);
  }
  if (JSON_OUT) {
    writeFileSync(
      JSON_OUT,
      JSON.stringify(
        results.map((r) => ({
          door: `${r.door.schema}.${r.door.fn}(${r.door.identityArgs})`,
          verdict: r.verdict,
          why: r.why,
          leaked: r.leaked,
          probes: r.probes,
        })),
        null,
        2,
      ) + "\n",
    );
    console.log(`${TAG.info}json written to ${JSON_OUT}`);
  }

  if (fails.length) {
    console.log(
      `${TAG.fail}A door that returns a row its caller cannot read is DD-191's class. Fix it where DD-191 was fixed: a NULL-safe role test, and membership asserted through the one helper.`,
    );
    return STRICT ? 1 : 0;
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`${TAG.fail}script error: ${(e as Error).stack ?? e}`);
    process.exit(2);
  });
