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
 *               directly under RLS — AND wrote nothing across the boundary.
 *   FAIL        the door answered with a row the caller cannot SELECT under
 *               RLS, or minted a row into a victim organization. 🚨 DD-213: a
 *               REFUSAL IS NOT A CLEAN BILL. Every probe now measures what the
 *               call wrote on EVERY outcome, refusals included — a door that
 *               says no and writes a row into a stranger's organization anyway
 *               is a FAIL, and was scored PASS by this gate until 2026-09-14.
 *   UNMEASURED  the arguments could not be derived, the door answers only a
 *               boolean (no row exists to place against the caller's standing,
 *               so this method has no oracle — `iam.is_discoverable`), or the
 *               call failed for a reason that is not an authorization decision
 *               (a type error, a missing required payload, a timeout). Named,
 *               with the reason. NEVER counted as a pass.
 *
 *   pnpm check:door-rows            # loud, non-blocking (exit 0)
 *   pnpm check:door-rows:strict     # the b75 lane (477 doors). exit 1 on any
 *                                   #   FAIL or on UNMEASURED credentials. NO
 *                                   #   allowlist, ever.
 *   pnpm check:door-rows:wide:strict # DD-208: all 892 declared signed-in doors,
 *                                   #   BLOCKING. The handful of doors that cross
 *                                   #   the organization boundary ON PURPOSE carry
 *                                   #   a written reason and a named owner in
 *                                   #   `scripts/door-rows/by-design-allowlist.json`
 *                                   #   and print as ALLOWED BY DESIGN — never
 *                                   #   silent, never a PASS. An entry whose door
 *                                   #   has stopped failing is STALE and fails.
 *   pnpm check:door-rows:self-test  # proves the harness FAILS a known leak
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

import { exitAfterDrain } from "./lib/exit-after-drain";

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
/**
 * DD-209. `--offset=N` with `--limit=M` runs the population in SLICES. V-73 had
 * to fork a scratch copy of this script to do that, because the wide lane takes
 * longer than a single synchronous call is allowed to run and a forked harness
 * is a harness nobody can trust. The slicing belongs here.
 */
const OFFSET = Number(flag("offset") ?? "0") || 0;
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
  retType: string; // pg_get_function_result, e.g. "boolean", "jsonb", "TABLE(id uuid)"
  probeArgs: ProbeRecipe | null; // DD-209: the declared argument recipe, if the row carries one
}

/**
 * 🚨 DD-213. A door that can only ever answer `true` or `false` cannot be judged
 * by a method whose oracle is "which rows came back". `iam.is_discoverable`
 * returns a boolean, so its probe is recorded as EMPTY and it scored PASS
 * fourteen times over — while it happily answers questions about ANOTHER
 * person's `p_user_id`, which is the identity-swap shape this harness has no way
 * to see. A PASS that is true by construction is worse than no reading at all,
 * so a boolean-only door is UNMEASURED BY NAME. It is still measured for WRITES:
 * a boolean door that writes across the boundary is a FAIL like any other.
 */
const BOOLEAN_ONLY = (door: Door): boolean => /^(setof\s+)?boolean$/i.test(door.retType.trim());

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
  /** DD-209: writes into the SYSTEM organization — platform-shared content, printed by name on every run. */
  shared: string[];
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

/**
 * 🚨 DD-214. This used to require the `_id` suffix — `p_organization_id`, `org_id` —
 * so the FOUR live billing doors that spell the argument `p_org` fell straight
 * through it. Three went UNMEASURED BY NAME (which is at least honest, and is why
 * DD-208 had to be found by hand), and the fourth was WORSE: `billing.plan_status`
 * has no other argument, so derivation fell back to the function name, found an
 * entity called `plan`, and handed the door a `billing.plan` id where an
 * ORGANIZATION was wanted. The door answered "not found", the probe came back
 * empty, and the gate printed PASS over a door that was disclosing any
 * organization's plan to any signed-in stranger. A name the harness cannot read is
 * not a door the harness may score. `p_org` is the same argument by a shorter
 * name, so the suffix is optional here.
 */
const ORG_ARG = /^p?_?(organization|org)(_id)?$/;
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

    await loadColumnPresence(q);
    const resolved = await resolveDoorRows(q);
    const byCatalogKey = resolved.filter((r) => r.how === "catalog-key" || r.how === "argtypes-column").length;
    const byText = resolved.filter((r) => r.how === "rendered-text").length;
    const doors = await loadDoors(q, resolved);
    console.log(
      `${TAG.info}population: ${doors.length} declared signed-in doors (--population=${POPULATION})`,
    );
    console.log(
      `${TAG.info}door identity (DD-223): ${byCatalogKey} row(s) matched on the catalog key (schema, name, argument type OIDs)${
        COLUMN_PRESENT.identity_argtypes ? " — reading platform.client_callable_door.identity_argtypes" : ""
      }, ${byText} on the rendered identity text only, ${resolved.length - byCatalogKey - byText} unresolved`,
    );

    const warm = await warmRecipes(q, catalog, cast, doors);
    if (warm.withRecipes)
      console.log(
        `${TAG.info}probe_args (DD-209): ${warm.withRecipes} door(s) in this population carry an argument recipe${
          warm.unresolvable.length
            ? `; ${warm.unresolvable.length} recipe row verb(s) resolved to NO live row and will leave their doors UNMEASURED by name: ${warm.unresolvable.join(", ")}`
            : ""
        }`,
      );

    if (SELF_TEST) return await selfTest(db, q, cast, catalog, doors);

    const structural = structuralFindings(resolved);


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
  /**
   * 🚨 DD-209. THE SYSTEM ORGANIZATION IS NOT A TENANT. `iam.organizations`
   * flags it (`is_system`), seven tables DEFAULT their `organization_id` to it
   * (`seo.keyword`, `seo.topic`, `education.learn_doc`, …), and the platform's
   * shared vocabularies live there on purpose — `seo.fn_upsert_keyword`'s own
   * body says so: "this writes the shared keyword vocabulary every site reads."
   * A row written there is not a row written into somebody else's tenant, and
   * calling it one would make this gate cry wolf on the doors behaving as
   * designed. It is still never silent: such writes are reported by name on
   * every run, and a write into the system organization that the caller CANNOT
   * read back under RLS stays a FAIL — that is the DD-213 shape (a stranger
   * writing rows nobody can see) and it does not become safe here.
   */
  systemOrgIds: string[];
  /** column names and types per `schema.table`, for the recipe resolver's liveness tests */
  columnsOf: Record<string, { cols: string[]; types: Record<string, string> }>;
  /** DD-209 recipe cache: `other_row:seo.topic` → the id it resolved to, or null */
  recipeRows: Map<string, string | null>;
}

/**
 * 🚨 DD-209. A SOFT-DELETED VICTIM ROW IS NOT A VICTIM ROW.
 *
 * The catalog used to take `limit 1` with no liveness test, so `web.site`
 * registered a row whose `deleted_at` is set — and `seo.gsc_assert_site_editor`
 * answers `P0002 gsc_site_not_found` for a deleted site before it has decided
 * anything about the caller. TWENTY-FOUR seo doors went UNMEASURED on that one
 * bad row, every one of them printed as "the call failed for a non-authorization
 * reason", when the truth was "this harness handed the door a tombstone".
 * (Measured 2026-09-14: `web.site 2462b0aa-362b-452d-a126-079fe9abfaf9` has
 * `deleted_at` set, and that exact id is in the `gsc_site_not_found` text of all
 * 24.) So every victim row is now taken LIVE, using the platform's own archival
 * vocabulary and nothing invented.
 */
const LIVENESS_COLS = ["deleted_at", "archived_at", "deactivated_at", "revoked_at"] as const;

function livenessTerms(cols: string[], types: Record<string, string>): string[] {
  const parts: string[] = [];
  for (const c of LIVENESS_COLS) if (cols.includes(c)) parts.push(`${qi(c)} is null`);
  if (cols.includes("is_active") && types.is_active === "boolean") parts.push(`${qi("is_active")} is not false`);
  if (cols.includes("is_deleted") && types.is_deleted === "boolean") parts.push(`${qi("is_deleted")} is not true`);
  return parts;
}

/**
 * PREFER a live row, never REQUIRE one: a table whose every victim row is
 * archived would otherwise lose its entry in the catalog altogether and take
 * its doors from "measured" to "no argument could be derived", which trades one
 * blind spot for another. So liveness sorts, it does not filter.
 */
function livenessOrder(cols: string[], types: Record<string, string>): string {
  const parts = livenessTerms(cols, types);
  return parts.length ? ` order by (${parts.join(" and ")}) desc nulls last` : "";
}

async function buildVictimCatalog(
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  cast: Cast,
): Promise<Catalog> {
  const idTables = await q<{
    sch: string;
    tab: string;
    orgcol: string | null;
    cols: string[] | null;
    types: string[] | null;
  }>(`
    select c.relnamespace::regnamespace::text as sch,
           c.relname as tab,
           (select a2.attname from pg_attribute a2
             where a2.attrelid = c.oid and not a2.attisdropped
               and a2.attname in ('organization_id','org_id')
             order by a2.attnum limit 1) as orgcol,
           (select array_agg(a3.attname::text order by a3.attnum) from pg_attribute a3
             where a3.attrelid = c.oid and not a3.attisdropped and a3.attnum > 0) as cols,
           (select array_agg(format_type(a3.atttypid, null) order by a3.attnum) from pg_attribute a3
             where a3.attrelid = c.oid and not a3.attisdropped and a3.attnum > 0) as types
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'id' and not a.attisdropped
    join pg_type ty on ty.oid = a.atttypid and ty.typname = 'uuid'
    where c.relkind in ('r','p')
      and c.relnamespace::regnamespace::text not in (
        'pg_catalog','information_schema','pgsodium','extensions','vault','_realtime','realtime',
        'storage','supabase_migrations','net','cron','graphql','graphql_public','pgbouncer','auth','graveyard')
    order by 1,2`);

  const columnsOf: Record<string, { cols: string[]; types: Record<string, string> }> = {};
  for (const t of idTables) {
    const types: Record<string, string> = {};
    (t.cols ?? []).forEach((c, i) => (types[c] = (t.types ?? [])[i] ?? ""));
    columnsOf[`${t.sch}.${t.tab}`] = { cols: t.cols ?? [], types };
  }

  const byEntity: Catalog["byEntity"] = {};
  // For every table that carries an organization column, take one LIVE row
  // belonging to a victim organization — a row the callers have no membership
  // standing in, by construction. ONE round trip: a gate that spends four
  // minutes on its own setup is a gate nobody puts in the release lane.
  const orgTables = idTables.filter((t) => t.orgcol);
  const CHUNK = 120;
  for (let i = 0; i < orgTables.length; i += CHUNK) {
    const slice = orgTables.slice(i, i + CHUNK);
    const sql = slice
      .map(
        (t) =>
          `select '${t.sch}.${t.tab}' as tbl, (select id::text from ${qi(t.sch)}.${qi(t.tab)} where ${qi(
            t.orgcol!,
          )} = any($1::uuid[])${livenessOrder(
            columnsOf[`${t.sch}.${t.tab}`].cols,
            columnsOf[`${t.sch}.${t.tab}`].types,
          )} limit 1) as id`,
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
              `select id::text from ${qi(t.sch)}.${qi(t.tab)} where ${qi(
                t.orgcol!,
              )} = any($1::uuid[])${livenessOrder(
                columnsOf[`${t.sch}.${t.tab}`].cols,
                columnsOf[`${t.sch}.${t.tab}`].types,
              )} limit 1`,
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
    systemOrgIds: (
      await q<{ id: string }>(`select id::text from iam.organizations where is_system`)
    ).map((r) => r.id),
    columnsOf,
    recipeRows: new Map(),
  };
}

// ─── DD-209: the argument recipes ────────────────────────────────────────────
//
// Derivation guesses from a NAME. A recipe is a person saying, on the door row
// itself, WHICH row this argument wants — the half the harness cannot read off
// `pg_proc`. Seventy-four doors in the blocking lane had an argument nothing
// could derive (`p_table_id`, `p_store_id`, `p_pack_id`, `p_class`, an enum, a
// status word), and every one of them was UNMEASURED BY NAME: honest, and blind.
//
// The recipe lives in `platform.client_callable_door.probe_args`, beside the
// reason and the owner, because the person who declares a door is the person who
// knows what its arguments mean. Its shape:
//
//   { "args": { "p_store_id": "other_row:rag.data_store",
//               "p_audience": "literal:organization" },
//     "boolean_oracle": "<sentence>",          -- see BOOLEAN_ONLY
//     "note": "<why these values>" }
//
// The verbs, and nothing else — an unknown verb is an ERROR, never a silent skip:
//
//   other_org              an organization neither caller has standing in
//   own_org                the caller's own first organization
//   victim_user            the victim identity's user id
//   self                   the caller's own user id
//   pending_invitation     a LIVE pending invitation in a victim organization
//   other_row:<sch.table>  a live row of that table in a victim organization
//                            (or, for a table with no organization column, one
//                             the victim identity owns)
//   own_row:<sch.table>    a live row of that table the CALLER owns
//   literal:<value>        a fixed value — an enum label, a registered token, a
//                            status word the door's own validator accepts
//   omit                   leave an optional argument out entirely
//
// `other_org`, `other_row:*`, `victim_user` and `pending_invitation` CROSS the
// boundary; `own_org`, `own_row:*`, `self`, `literal:*` and `omit` do not. A
// recipe that crosses nowhere is still a recipe — it gets the door past its own
// validator so the benign-argument row-diff (below) can do its work.

interface ProbeRecipe {
  args?: Record<string, string>;
  boolean_oracle?: string;
  note?: string;
}

const CROSSING_VERBS = /^(other_org|victim_user|pending_invitation|other_row:)/;

/**
 * The row a `other_row:` / `own_row:` verb names, taken LIVE and cached. Runs as
 * `postgres`, outside any probe transaction, so it can see rows RLS hides — that
 * is the whole point: the victim row must be one the caller genuinely cannot read.
 */
async function resolveRecipeRow(
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  catalog: Catalog,
  cast: Cast,
  verb: string,
): Promise<string | null> {
  if (catalog.recipeRows.has(verb)) return catalog.recipeRows.get(verb) ?? null;
  let id: string | null = null;
  try {
    if (verb === "pending_invitation") {
      const r = await q<{ id: string }>(
        `select id::text from iam.invitations
          where organization_id = any($1::uuid[]) and status = 'pending'
            and (expires_at is null or expires_at > now())
          order by created_at desc limit 1`,
        [catalog.victimOrgIds],
      );
      id = r[0]?.id ?? null;
    } else {
      const own = verb.startsWith("own_row:");
      const table = verb.slice(verb.indexOf(":") + 1);
      const meta = catalog.columnsOf[table];
      if (!meta) throw new Error(`no such table in the id catalog: ${table}`);
      const [sch, tab] = table.split(".");
      const live = livenessOrder(meta.cols, meta.types);
      const orgCol = ["organization_id", "org_id"].find((c) => meta.cols.includes(c));
      const ownerCol = ["user_id", "created_by", "owner_id", "actor_user_id"].find((c) => meta.cols.includes(c));
      const who = own ? cast.a : cast.b;
      let where: string;
      let params: unknown[];
      if (orgCol && own && cast.a.orgIds.length) {
        where = `${qi(orgCol)} = any($1::uuid[])`;
        params = [cast.a.orgIds];
      } else if (orgCol && !own) {
        // 🚨 DD-209 (V-102 F2). ACROSS THE BOUNDARY IS NOT "ONE OF THE VICTIM'S
        // ORGANIZATIONS". This used to look only in the 12 organizations
        // admin@admin.com belongs to, so a table whose rows live in OTHER tenants
        // looked empty and six doors were shipped with a declared note saying
        // "0 rows across the boundary" that was simply false: `canvas.canvas_items`
        // holds 872, `workbench.udt_datasets` 144, `seo.starter_pack` 7,
        // `rag.data_stores` 6 (counted 2026-09-14, excluding both callers' and the
        // system organization). A row in a third tenant is exactly as far across
        // the boundary as one of the victim's, and the callers have no standing
        // there by construction.
        //
        // The victim's own organizations still come FIRST, so a recipe written
        // against the old behaviour keeps the row it had; the system organization
        // is excluded because it is shared content, not a tenant (see
        // Catalog.systemOrgIds).
        where = `${qi(orgCol)} is not null and ${qi(orgCol)} <> all($1::uuid[])`;
        params = [[...cast.a.orgIds, ...cast.c.orgIds, ...catalog.systemOrgIds]];
      } else if (ownerCol) {
        where = `${qi(ownerCol)} = $1::uuid`;
        params = [who.id];
      } else {
        throw new Error(
          `${table} carries neither an organization column nor an owning-user column, so no row of it can be placed on one side of the boundary`,
        );
      }
      const preferVictim =
        orgCol && !own && catalog.victimOrgIds.length
          ? `, (${qi(orgCol)} = any($2::uuid[])) desc`
          : "";
      if (preferVictim) params = [...(params as unknown[]), catalog.victimOrgIds];
      const r = await q<{ id: string }>(
        `select id::text from ${qi(sch)}.${qi(tab)} where ${where}${
          live ? live + preferVictim : preferVictim ? ` order by 1 = 1${preferVictim}` : ""
        } limit 1`,
        params,
      );
      id = r[0]?.id ?? null;
    }
  } catch (e) {
    console.log(`${TAG.warn}recipe ${verb}: ${(e as Error).message.slice(0, 140)}`);
    id = null;
  }
  catalog.recipeRows.set(verb, id);
  return id;
}

/**
 * Pre-resolve every row verb every recipe in the population names, once, as
 * `postgres`, before any probe starts. Doing it inside a probe transaction would
 * read as the caller and find nothing.
 */
async function warmRecipes(
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  catalog: Catalog,
  cast: Cast,
  doors: Door[],
): Promise<{ withRecipes: number; unresolvable: string[] }> {
  const verbs = new Set<string>();
  let withRecipes = 0;
  for (const d of doors) {
    if (!d.probeArgs?.args) continue;
    withRecipes++;
    for (const v of Object.values(d.probeArgs.args)) {
      if (v === "pending_invitation" || v.startsWith("other_row:") || v.startsWith("own_row:")) verbs.add(v);
    }
  }
  const unresolvable: string[] = [];
  for (const v of verbs) if ((await resolveRecipeRow(q, catalog, cast, v)) === null) unresolvable.push(v);
  return { withRecipes, unresolvable };
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

/** The same normalisation, in this process, so the match can be made here. */
const normJs = (s: string): string =>
  s
    .replace(/(^|[ ,(])[a-z_][a-z0-9_]*\./g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * 🚨 DD-223 (B-108 §9.4, V-83 item 7). `identity_args` IS RENDERED TEXT, AND THE
 * RENDERING MOVES. `pg_get_function_identity_arguments` spells a type through
 * the CURRENT search_path, so `web.create_site` reads `p_visibility visibility`
 * under the §6d-4 guard's own path and `p_visibility platform.visibility` under
 * the default one. A door row written under one path and matched under the other
 * resolves to NO function — and a door this gate cannot resolve is a door it
 * never probes and nobody is told about, which is the exact silent-green shape
 * DD-192 exists to close.
 *
 * So the match is made on the CATALOG KEY — (schema, name, argument type OIDs) —
 * and the rendered text is only a fallback for a row whose types this process
 * cannot resolve. A parallel lane (B-118) is adding `identity_argtypes` to the
 * door table straight from `pg_proc.proargtypes`; the moment that column exists
 * this reads it instead of parsing, with no change here.
 *
 * Parsing rule, applied to each `, `-separated token of the identity list:
 * try the WHOLE token as a type name (an unnamed argument), then the token with
 * its first word removed (`p_id uuid`), then with two removed (`VARIADIC p_x
 * text[]`). A token nothing resolves leaves the row on the text fallback, which
 * is where it was before — never worse.
 */
interface TypeIndex {
  byName: Map<string, Set<number>>;
}

async function loadTypeIndex(
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
): Promise<TypeIndex> {
  const rows = await q<{ oid: number; bare: string; qualified: string; rendered: string }>(`
    select t.oid::int as oid,
           lower(t.typname::text) as bare,
           lower(n.nspname::text || '.' || t.typname::text) as qualified,
           lower(format_type(t.oid, null)) as rendered
    from pg_type t join pg_namespace n on n.oid = t.typnamespace`);
  const byName = new Map<string, Set<number>>();
  const add = (k: string, oid: number) => {
    const s = byName.get(k) ?? new Set<number>();
    s.add(oid);
    byName.set(k, s);
  };
  for (const r of rows) {
    add(r.bare, r.oid);
    add(r.qualified, r.oid);
    add(r.rendered, r.oid);
    // `_uuid` is how the catalog spells `uuid[]`; format_type already gives the
    // readable spelling, and the bare name would collide with nothing else.
  }
  return { byName };
}

/** The argument-type OID candidates for one rendered identity list, or null. */
function argTypeKey(identityArgs: string, types: TypeIndex): Set<number>[] | null {
  const text = identityArgs.trim();
  if (text === "") return [];
  const out: Set<number>[] = [];
  for (const raw of text.split(",")) {
    const tok = raw.trim().replace(/^(variadic|in|inout|out)\s+/i, "");
    const tries = [tok, tok.replace(/^\S+\s+/, ""), tok.replace(/^\S+\s+\S+\s+/, "")];
    let hit: Set<number> | null = null;
    for (const t of tries) {
      const s = types.byName.get(t.trim().toLowerCase());
      if (s && s.size) {
        hit = s;
        break;
      }
    }
    if (!hit) return null;
    out.push(hit);
  }
  return out;
}

interface ProcRow {
  oid: number;
  schema: string;
  name: string;
  identityArgs: string;
  argTypeOids: number[];
  argNames: string[];
  argTypes: string[];
  ndefaults: number;
  retSet: boolean;
  retType: string;
  volatile: boolean;
  execAuth: boolean;
  execAnon: boolean;
}

interface DoorRowRaw {
  schema_name: string;
  function_name: string;
  identity_args: string;
  identity_argtypes: number[] | null;
  declared_by: string | null;
  gate_predicate: string | null;
  non_client_lane: string | null;
  probe_args: unknown;
}

interface ResolvedDoorRow {
  row: DoorRowRaw;
  proc: ProcRow | null;
  how: "argtypes-column" | "catalog-key" | "rendered-text" | null;
}

let COLUMN_PRESENT: Record<string, boolean> = {};

async function loadColumnPresence(
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
): Promise<void> {
  const rows = await q<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'platform' and table_name = 'client_callable_door'`,
  );
  COLUMN_PRESENT = Object.fromEntries(rows.map((r) => [r.column_name, true]));
}

/**
 * Every door row, resolved to at most one live function, by the catalog key
 * first and the rendered text only as a fallback. One resolution, used by BOTH
 * the population and the structural findings, so a row can never be "measured"
 * by one and "resolves to no function" by the other.
 */
async function resolveDoorRows(
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
): Promise<ResolvedDoorRow[]> {
  const hasArgtypes = COLUMN_PRESENT.identity_argtypes === true;
  const hasProbeArgs = COLUMN_PRESENT.probe_args === true;
  const doorRows = await q<DoorRowRaw>(`
    select d.schema_name, d.function_name, d.identity_args,
           ${hasArgtypes ? "d.identity_argtypes::int[]" : "null::int[]"} as identity_argtypes,
           d.declared_by, d.gate_predicate, d.non_client_lane,
           ${hasProbeArgs ? "d.probe_args" : "null::jsonb"} as probe_args
      from platform.client_callable_door d
     order by d.schema_name, d.function_name, d.identity_args`);

  const procs = await q<{
    oid: number;
    sch: string;
    nm: string;
    identity_args: string;
    argtype_oids: number[] | null;
    argnames: string[] | null;
    argtypes: string[] | null;
    ndefaults: number;
    proretset: boolean;
    rettype: string;
    provolatile: string;
    exec_auth: boolean;
    exec_anon: boolean;
  }>(`
    select p.oid::int as oid, n.nspname::text as sch, p.proname::text as nm,
           pg_get_function_identity_arguments(p.oid) as identity_args,
           (select array_agg(t::int order by ord) from unnest(p.proargtypes::oid[]) with ordinality as u(t, ord)) as argtype_oids,
           coalesce(p.proargnames[1:p.pronargs], array[]::text[]) as argnames,
           (select array_agg(format_type(t, null) order by ord)
              from unnest(p.proargtypes::oid[]) with ordinality as u(t, ord)) as argtypes,
           p.pronargdefaults as ndefaults, p.proretset, pg_get_function_result(p.oid) as rettype,
           p.provolatile,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as exec_auth,
           has_function_privilege('anon', p.oid, 'EXECUTE') as exec_anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname, p.proname) in (
       select distinct schema_name, function_name from platform.client_callable_door)`);

  const byQualified = new Map<string, ProcRow[]>();
  for (const p of procs) {
    const rec: ProcRow = {
      oid: p.oid,
      schema: p.sch,
      name: p.nm,
      identityArgs: p.identity_args ?? "",
      argTypeOids: p.argtype_oids ?? [],
      argNames: p.argnames ?? [],
      argTypes: p.argtypes ?? [],
      ndefaults: Number(p.ndefaults ?? 0),
      retSet: p.proretset,
      retType: p.rettype ?? "",
      volatile: p.provolatile === "v",
      execAuth: p.exec_auth,
      execAnon: p.exec_anon,
    };
    const k = `${p.sch}.${p.nm}`;
    byQualified.set(k, [...(byQualified.get(k) ?? []), rec]);
  }

  const types = await loadTypeIndex(q);
  const sameKey = (a: Set<number>[], b: number[]): boolean =>
    a.length === b.length && a.every((s, i) => s.has(b[i]));

  return doorRows.map((row) => {
    const candidates = byQualified.get(`${row.schema_name}.${row.function_name}`) ?? [];
    if (row.identity_argtypes) {
      const want = row.identity_argtypes;
      const hit = candidates.find(
        (c) => c.argTypeOids.length === want.length && c.argTypeOids.every((o, i) => o === want[i]),
      );
      if (hit) return { row, proc: hit, how: "argtypes-column" as const };
    }
    const key = argTypeKey(row.identity_args, types);
    if (key) {
      const hit = candidates.find((c) => sameKey(key, c.argTypeOids));
      if (hit) return { row, proc: hit, how: "catalog-key" as const };
    }
    const want = normJs(row.identity_args);
    const hit = candidates.find((c) => normJs(c.identityArgs) === want);
    if (hit) return { row, proc: hit, how: "rendered-text" as const };
    return { row, proc: null, how: null };
  });
}

async function loadDoors(
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  resolved: ResolvedDoorRow[],
): Promise<Door[]> {
  // 🚨 DD-213c. The blocking lane was "the 477 doors DD-169 batch 3 declared" and
  // nothing else — so `iam.emergency_door_open`, `iam.emergency_door_approve` and
  // `iam.emergency_door_deny`, declared under their own `declared_by`, were never
  // probed by the gate that blocks. The first of them handed a stranger a refusal
  // AND a row in another organization's `iam.access_audit`, and `0 FAIL` was honest
  // about what it measured and silent about them. A door family that writes into an
  // access log belongs in the lane that blocks, so the population is the B-75 set
  // PLUS every declaration named here. Adding a row here is how a family joins the
  // blocking lane; it is never a way to take one out.
  const ALWAYS_PROBED = ["iam_emergency_door_dd137a"];
  const inPopulation = (declaredBy: string | null): boolean =>
    POPULATION === "b75" ? declaredBy === "DD-169 batch 3 / B-75" || ALWAYS_PROBED.includes(declaredBy ?? "") : true;

  let doors: Door[] = resolved
    .filter((r) => r.proc !== null)
    .filter((r) => (POPULATION === "all" ? r.proc!.execAuth : r.proc!.execAuth && !r.proc!.execAnon))
    .filter((r) => inPopulation(r.row.declared_by))
    .map((r) => ({
      schema: r.row.schema_name,
      fn: r.row.function_name,
      identityArgs: r.row.identity_args,
      declaredBy: r.row.declared_by,
      gatePredicate: r.row.gate_predicate,
      oid: r.proc!.oid,
      volatile: r.proc!.volatile,
      argNames: r.proc!.argNames,
      argTypes: r.proc!.argTypes,
      argDefaults: r.proc!.ndefaults,
      retSet: r.proc!.retSet,
      retType: r.proc!.retType,
      probeArgs: parseRecipe(`${r.row.schema_name}.${r.row.function_name}`, r.row.probe_args),
    }));
  doors.sort((a, b) =>
    `${a.schema}.${a.fn}.${a.identityArgs}`.localeCompare(`${b.schema}.${b.fn}.${b.identityArgs}`),
  );
  if (ONLY) doors = doors.filter((d) => `${d.schema}.${d.fn}` === ONLY);
  if (OFFSET || LIMIT) doors = doors.slice(OFFSET, LIMIT ? OFFSET + LIMIT : undefined);
  return doors;
}

/**
 * A recipe nobody can read is worse than no recipe. A malformed `probe_args`, or
 * a verb this harness does not know, THROWS — it never degrades to "no recipe",
 * because that would put a door back into UNMEASURED while its row claims it is
 * covered, and nobody would be told.
 */
const KNOWN_VERB = /^(own_org|other_org|victim_user|self|pending_invitation|omit|own_row:.+|other_row:.+|literal:.*)$/;

function parseRecipe(door: string, raw: unknown): ProbeRecipe | null {
  if (raw === null || raw === undefined) return null;
  const r = (typeof raw === "string" ? safeJson(raw) : raw) as ProbeRecipe | null;
  if (!r || typeof r !== "object" || Array.isArray(r)) {
    throw new Error(`probe_args on ${door} is not a JSON object`);
  }
  for (const [arg, verb] of Object.entries(r.args ?? {})) {
    if (typeof verb !== "string" || !KNOWN_VERB.test(verb)) {
      throw new Error(
        `probe_args on ${door}: argument ${arg} names the verb ${JSON.stringify(verb)}, which this harness does not know. ` +
          `Known verbs: own_org, other_org, victim_user, self, pending_invitation, omit, own_row:<schema.table>, other_row:<schema.table>, literal:<value>.`,
      );
    }
  }
  if (r.note !== undefined && (typeof r.note !== "string" || r.note.trim().length < 40)) {
    throw new Error(
      `probe_args on ${door}: note must be a sentence of at least 40 characters saying why this door cannot be reached by a recipe.`,
    );
  }
  if (r.boolean_oracle !== undefined && (typeof r.boolean_oracle !== "string" || r.boolean_oracle.trim().length < 40)) {
    throw new Error(
      `probe_args on ${door}: boolean_oracle must be a sentence of at least 40 characters saying what a TRUE answer about the victim's row would mean.`,
    );
  }
  return r;
}

// ─── S1/S2: a declaration that is not a door ─────────────────────────────────
//
// This gate can only measure a door row that resolves to a live, client-callable
// function. Two kinds of row resolve to nothing, and BOTH were invisible before:
// the population join just dropped them and the totals read as if the whole
// population had been measured.

interface Structural {
  unresolved: { fn: string; args: string; declaredBy: string | null; serviceLane: boolean }[];
  notCallable: { fn: string; args: string; declaredBy: string | null; serviceLane: boolean }[];
}

function structuralFindings(resolved: ResolvedDoorRow[]): Structural {
  const unresolved = resolved
    .filter((r) => r.proc === null)
    .map((r) => ({
      fn: `${r.row.schema_name}.${r.row.function_name}`,
      args: r.row.identity_args,
      declaredBy: r.row.declared_by,
      serviceLane: false,
    }));
  // 🚨 DD-210 (B-108). A row carrying `non_client_lane` is a SERVICE-LANE door —
  // reached with the service key, never by a browser — so "no client holds EXECUTE"
  // is its declared shape, not a discrepancy. The COLUMN is the flag (it holds the
  // reason, so non-null means declared); the harness never infers the lane from a
  // name, and never from a word in the free-text `reason`.
  const notCallable = resolved
    .filter((r) => r.proc !== null && !r.proc.execAuth && !r.proc.execAnon)
    .map((r) => ({
      fn: `${r.row.schema_name}.${r.row.function_name}`,
      args: r.row.identity_args,
      declaredBy: r.row.declared_by,
      serviceLane: r.row.non_client_lane !== null,
    }));
  const by = (a: { fn: string; args: string }, b: { fn: string; args: string }) =>
    `${a.fn}${a.args}`.localeCompare(`${b.fn}${b.args}`);
  return { unresolved: unresolved.sort(by), notCallable: notCallable.sort(by) };
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
const DISCRIMINATOR_VOCAB = [
  "organization",
  "org",
  "project",
  "scope",
  "site",
  "brand",
  "platform",
  "user",
  // 🚨 DD-209. `file`, `folder` and `web_site` are the three words
  // `iam.fn_list_resource_permissions` accepts and nothing else, and the
  // AccessGate family speaks the same vocabulary. Leaving them out meant a
  // resource-type door was probed only on the containers it does NOT share, so
  // "it stopped failing" could mean "we stopped asking it the question it
  // answers" — which is how a by-design excuse goes stale for the wrong reason.
  "file",
  "folder",
  "web_site",
];

/**
 * The emergency-door argument shape, by SHAPE and not by name, so a fifth door
 * of the same family is measured the day it is declared.
 */
const EMERGENCY_DOOR_SHAPE = (door: Door): boolean =>
  door.argNames.length === 4 &&
  ["p_token", "p_id", "p_purpose", "p_justification"].every((n, i) => door.argNames[i] === n);

/**
 * A victim row for the emergency-door recipe, paired with the table whose token
 * names it. HR rows first: they are the tier these doors exist for, and the
 * catalog's victim rows are in organizations neither caller has standing in by
 * construction.
 */
function emergencyDoorVictim(catalog: Catalog, schema: string): { table: string; id: string } | null {
  for (const name of ["location", "employee", "employment", "incident", "department"]) {
    const hit = pickEntity(catalog, "hr", [name]) ?? pickEntity(catalog, schema, [name]);
    if (hit) return hit;
  }
  return null;
}

function doorNeedsDiscriminator(door: Door): boolean {
  return door.argNames.some((n, i) => DISCRIMINATOR.test(n.replace(/^p_/, "")) && /^(text|character varying|citext)$/.test(door.argTypes[i] ?? ""));
}

function fillArgs(
  door: Door,
  catalog: Catalog,
  cast: Cast,
  victimUserId: string,
  discriminator: string | null = null,
  caller: Principal | null = null,
): FilledArgs {
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
  const recipe = door.probeArgs?.args ?? null;

  for (let i = 0; i < door.argTypes.length; i++) {
    const name = door.argNames[i] ?? `$${i + 1}`;
    const type = door.argTypes[i];
    const isRequired = i < required;
    const bare = name.replace(/^p_/, "");

    // 🚨 DD-209. A DECLARED RECIPE OUTRANKS EVERY GUESS BELOW. The person who
    // declared the door said what this argument wants; derivation from the NAME
    // is what the harness does when nobody has.
    const verb = recipe ? (recipe[name] ?? recipe[bare]) : undefined;
    if (verb) {
      if (verb === "omit") {
        if (isRequired) unresolved.push(`${name} ${type} (the recipe says omit, but the argument is required)`);
        continue;
      }
      if (verb.startsWith("literal:")) {
        const lit = verb.slice("literal:".length);
        // An array argument takes a one-element array of the literal; passing the
        // bare text would be a type error, which this gate must never read as a
        // refusal.
        push(name, type, type.endsWith("[]") ? [lit] : lit);
        continue;
      }
      let id: string | null = null;
      let crosses = CROSSING_VERBS.test(verb);
      if (verb === "other_org") id = catalog.victimOrgId;
      else if (verb === "own_org") id = (caller?.orgIds ?? cast.a.orgIds)[0] ?? null;
      else if (verb === "victim_user") id = victimUserId;
      else if (verb === "self") id = caller?.id ?? cast.a.id;
      else id = catalog.recipeRows.get(verb) ?? null;
      // `own_org` for the org-less caller C names nothing; that is not a failure
      // of the recipe, it is the caller having no own organization to name.
      if (!id) {
        unresolved.push(`${name} ${type} (the recipe verb ${verb} names no live row for this caller)`);
        continue;
      }
      if (crosses) {
        crossed = true;
        injectedIds.push(id);
      } else if (type === "uuid" || type === "uuid[]") {
        injectedIds.push(id);
      }
      push(name, type === "uuid[]" ? "uuid[]" : type, type === "uuid[]" ? [id] : id);
      continue;
    }

    // The inventory RPC takes a column name plus a generic container UUID.
    // Neither parameter names its entity in isolation, so ordinary derivation
    // correctly refuses to guess.  Its fixed, documented contract does: use a
    // victim project with the matching project_id discriminator.  This gives
    // the door guard a real cross-container authorization probe instead of
    // permanently leaving the RPC unmeasured.
    if (door.schema === "public" && door.fn === "container_resource_counts") {
      if (name === "p_column" && /^(text|character varying|citext)$/.test(type)) {
        push(name, "text", "project_id");
        continue;
      }
      if (name === "p_container_id" && type === "uuid") {
        const hit = pickEntity(catalog, door.schema, ["project"]);
        if (hit) {
          crossed = true;
          injectedIds.push(hit.id);
          push(name, "uuid", hit.id);
        } else if (isRequired) {
          unresolved.push(`${name} ${type}`);
        }
        continue;
      }
    }

    // 🚨 DD-213c. THE EMERGENCY-DOOR SHAPE: `(p_token, p_id, p_purpose, p_justification)`.
    // `p_token` is an entity-type token and `p_id` a row of the table that token
    // names — neither means anything without the other, so ordinary derivation
    // correctly refused to guess and `iam.emergency_door_open` / `public.hr_break_glass`
    // sat UNMEASURED while the first of them handed a stranger a refusal AND a row
    // in another organization's `iam.access_audit` (V-77 §9, proven live). The
    // recipe pairs a victim row with ITS OWN token, so the door gets a real
    // cross-boundary probe instead of a type error read as a refusal.
    if (EMERGENCY_DOOR_SHAPE(door)) {
      if (bare === "token" && /^(text|character varying|citext)$/.test(type)) {
        const hit = emergencyDoorVictim(catalog, door.schema);
        if (hit) {
          push(name, "text", hit.table.replace(".", "_"));
        } else if (isRequired) {
          unresolved.push(`${name} ${type} (no victim row exists for any token this recipe knows)`);
        }
        continue;
      }
      if (bare === "id" && type === "uuid") {
        const hit = emergencyDoorVictim(catalog, door.schema);
        if (hit) {
          crossed = true;
          injectedIds.push(hit.id);
          push(name, "uuid", hit.id);
        } else if (isRequired) {
          unresolved.push(`${name} ${type} (no victim row exists for any token this recipe knows)`);
        }
        continue;
      }
      if (bare === "purpose" && /^(text|character varying|citext)$/.test(type)) {
        // A purpose the door recognises reaches its DEEPEST refusal (the admin
        // check). An unregistered one is refused earlier — and wrote a row there
        // too, before DD-213c — so either value measures the door; this one
        // measures more of it.
        push(name, "text", "support_investigation");
        continue;
      }
      if (bare === "justification" && /^(text|character varying|citext)$/.test(type)) {
        // Long enough to clear the door's own minimum-length refusal.
        push(
          name,
          "text",
          "check:door-rows (DD-213c) is probing this emergency door from an account with no standing in the organization that owns the row; this call is inside a transaction that is always rolled back.",
        );
        continue;
      }
    }

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


// ─── DD-209 (V-102 F1): the DISCLOSURE oracle ────────────────────────────────
//
// The row oracle is UUID-ONLY: it harvests row identities out of an answer and
// asks whether the caller can SELECT them. A NAME, a title, an email address or
// a phone number belonging to a row the caller cannot read is invisible to it.
// `public.agx_get_access_level` sat PASS in the blocking lane while telling any
// signed-in caller the name of an agent they cannot SELECT and the email address
// of its owner, in the same answer that said `access_level: "none"` (V-102 F1,
// proven live). The platform already treats this shape as dangerous —
// `public.access_denied_context` is in the by-design allowlist PRECISELY because
// it returns "a DISPLAY NAME of a row the caller cannot SELECT" — so the gate
// that could not see it was the problem.
//
// THE ORACLE. Any descriptive value in the answer that is EQUAL to a field of a
// row this caller cannot SELECT is a FAIL, named with the field and the row. The
// rows examined are the ones the door was handed (the injected ids — a door given
// an id it may not read and answering with that row's name is the whole shape)
// plus every row id that came back.
//
// Deliberately narrow, because a gate that cries wolf gets switched off:
//   * only DESCRIPTIVE keys in the answer (name / title / label / email / slug /
//     handle / display_name / subject / phrase / headline / first_name / last_name),
//   * only values of 3 characters or more, never a value this harness injected,
//   * exact match only — no substring, no fuzziness,
//   * and only against rows PROVEN unreadable by this caller under RLS, in this
//     transaction, one `select 1 … where id = $1` at a time.
const DESCRIPTIVE_KEY =
  /(^|_)(name|title|label|email|slug|handle|display_name|subject|phrase|headline|first_name|last_name)$/i;

const DESCRIPTIVE_COLS = [
  "name",
  "title",
  "label",
  "slug",
  "display_name",
  "handle",
  "email",
  "subject",
  "phrase",
  "headline",
  "first_name",
  "last_name",
];

/** Every descriptive string the answer carries, by the key it arrived under. */
function harvestDescriptive(value: unknown, key: string | null, out: Map<string, string>): void {
  if (value == null) return;
  if (typeof value === "string") {
    const parsed = safeJson(value);
    if (parsed && typeof parsed === "object") {
      harvestDescriptive(parsed, null, out);
      return;
    }
    if (!key || !DESCRIPTIVE_KEY.test(key)) return;
    const v = value.trim();
    if (v.length < 3 || UUID_RE.test(v)) return;
    out.set(`${key}=${v}`, v);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) harvestDescriptive(v, key, out);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) harvestDescriptive(v, k, out);
  }
}

/**
 * The descriptive values a row carries, read as `postgres`: its own descriptive
 * columns, plus the email address of whoever owns it — because "the owner's
 * email" is a disclosure ABOUT that row even though it lives in `auth.users`,
 * and that is exactly what `agx_get_access_level` handed over.
 */
async function descriptiveValuesOf(
  db: pg.Client,
  catalog: Catalog,
  table: string,
  id: string,
): Promise<{ field: string; value: string }[]> {
  const meta = catalog.columnsOf[table];
  if (!meta) return [];
  const [sch, tab] = table.split(".");
  const cols = DESCRIPTIVE_COLS.filter((c) => meta.cols.includes(c));
  const ownerCol = ["created_by", "user_id", "owner_id", "actor_user_id"].find((c) => meta.cols.includes(c));
  if (!cols.length && !ownerCol) return [];
  const selects = [
    ...cols.map((c) => `${qi(c)}::text as ${qi(c)}`),
    ...(ownerCol
      ? [`(select u.email::text from auth.users u where u.id = t.${qi(ownerCol)}) as "owner_email"`]
      : []),
  ];
  try {
    const r = await db.query(
      `select ${selects.join(", ")} from ${qi(sch)}.${qi(tab)} t where t.id = $1::uuid limit 1`,
      [id],
    );
    const row = (r.rows[0] ?? {}) as Record<string, string | null>;
    return Object.entries(row)
      .filter(([, v]) => typeof v === "string" && v.trim().length >= 3)
      .map(([field, v]) => ({ field, value: (v as string).trim() }));
  } catch {
    return [];
  }
}



/**
 * Does any row the caller CAN read, returned in this same answer, point at this
 * row by id? Runs as `postgres` (the readable set was already established under
 * the caller's own RLS above), one narrow lookup per candidate row.
 */
async function referencedByAReadableRow(
  db: pg.Client,
  catalog: Catalog,
  readableHere: { table: string; id: string }[],
  id: string,
): Promise<boolean> {
  for (const src of readableHere) {
    if (src.id.toLowerCase() === id.toLowerCase()) continue;
    const meta = catalog.columnsOf[src.table];
    if (!meta) continue;
    const uuidCols = meta.cols.filter((c) => meta.types[c] === "uuid" && c !== "id");
    if (!uuidCols.length) continue;
    const [sch, tab] = src.table.split(".");
    try {
      const r = await db.query(
        `select 1 from ${qi(sch)}.${qi(tab)} where id = $1::uuid and $2::uuid in (${uuidCols
          .map((c) => qi(c))
          .join(", ")}) limit 1`,
        [src.id, id],
      );
      if ((r.rowCount ?? 0) > 0) return true;
    } catch {
      /* a column shape we cannot compare tells us nothing */
    }
  }
  return false;
}

/**
 * Under the CALLER's own RLS: is there any row of this table they can read that
 * already carries this value in this field? If so, the door named something they
 * could have learned legitimately and there is nothing to report. `owner_email`
 * is synthesised from `auth.users` rather than being a column, so it is asked
 * through the owning-user column instead.
 */
async function callerAlreadyKnows(
  db: pg.Client,
  catalog: Catalog,
  table: string,
  field: string,
  value: string,
): Promise<boolean> {
  const meta = catalog.columnsOf[table];
  if (!meta) return false;
  const [sch, tab] = table.split(".");
  await db.query("savepoint already_knows");
  try {
    if (field === "owner_email") {
      const ownerCol = ["created_by", "user_id", "owner_id", "actor_user_id"].find((c) => meta.cols.includes(c));
      if (!ownerCol) return false;
      const r = await db.query(
        `select 1 from ${qi(sch)}.${qi(tab)} t
          where (select u.email::text from auth.users u where u.id = t.${qi(ownerCol)}) = $1 limit 1`,
        [value],
      );
      return (r.rowCount ?? 0) > 0;
    }
    if (!meta.cols.includes(field)) return false;
    const r = await db.query(
      `select 1 from ${qi(sch)}.${qi(tab)} where ${qi(field)}::text = $1 limit 1`,
      [value],
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    // A read the caller cannot take at all proves nothing either way; the safe
    // answer for a GATE is "they did not already know it", so the finding stands.
    return false;
  } finally {
    try {
      await db.query("release savepoint already_knows");
    } catch {
      try {
        await db.query("rollback to savepoint already_knows");
      } catch {
        /* the probe rollback ends the transaction anyway */
      }
    }
  }
}

/**
 * Compare what the answer said against what the rows the caller cannot read
 * actually hold. Runs with the connection in the CALLER's transaction; it flips
 * roles itself and always puts the role back.
 */
async function disclosureFindings(
  db: pg.Client,
  catalog: Catalog,
  caller: Principal,
  rows: Record<string, unknown>[],
  candidateIds: string[],
  doorName: string,
): Promise<string[]> {
  const said = new Map<string, string>();
  for (const r of rows) harvestDescriptive(r, null, said);
  if (!said.size || !candidateIds.length) return [];

  await db.query("reset role");
  const resolved = await resolveIds(db, catalog, candidateIds);
  const findings: string[] = [];
  await db.query("set local role authenticated");

  // 🚨 WHICH OF THE ROWS IN THIS ANSWER CAN THE CALLER ACTUALLY READ? A row they
  // CAN read, returned in the same answer, is allowed to name what it points at:
  // `public.agx_get_shortcuts_initial` returns a shortcut in the caller's OWN
  // organization together with `agent_name`, the name of the agent that shortcut
  // runs. The caller holds the shortcut and can execute it; a control that cannot
  // name what it runs is a dead control, and the harness's own uuid rule already
  // says a foreign key inside the caller's own row is not a leak. So the text axis
  // follows the same rule: a descriptive value is a disclosure unless some row the
  // caller can read, in this very answer, REFERENCES the row it belongs to.
  const readableHere: { table: string; id: string }[] = [];
  for (const r of resolved) {
    try {
      const [sch, tab] = r.table.split(".");
      const seen =
        (await db.query(`select 1 from ${qi(sch)}.${qi(tab)} where id = $1::uuid limit 1`, [r.id])).rowCount ?? 0;
      if (seen) readableHere.push(r);
    } catch {
      /* a table the caller holds no grant on is not a row they can read */
    }
  }

  for (const r of resolved) {
    const [sch, tab] = r.table.split(".");
    let visible = 0;
    try {
      visible =
        (await db.query(`select 1 from ${qi(sch)}.${qi(tab)} where id = $1::uuid limit 1`, [r.id])).rowCount ?? 0;
    } catch {
      continue; // a table the caller holds no grant on at all: nothing to compare
    }
    if (visible) continue; // the caller can read this row; naming it discloses nothing
    await db.query("reset role");
    if (await referencedByAReadableRow(db, catalog, readableHere, r.id)) {
      await db.query("set local role authenticated");
      continue;
    }
    const values = await descriptiveValuesOf(db, catalog, r.table, r.id);
    await db.query("set local role authenticated");
    for (const v of values) {
      for (const [saidKey, saidValue] of said) {
        if (saidValue !== v.value) continue;
        // 🚨 A VALUE THE CALLER COULD HAVE LEARNED LEGITIMATELY IS NOT A DISCLOSURE.
        // Two `agent.definition` rows are named "NER Scope Slot Filler" and the
        // caller can SELECT one of them, so `public.agx_get_list_full` naming it
        // tells them nothing they did not already have — and an oracle that
        // reports that is an oracle somebody switches off. Before a finding is
        // made, the caller is asked, under their own RLS, whether ANY row of that
        // table carries this value in this field. Only a value that exists ONLY
        // behind the boundary is a disclosure.
        if (await callerAlreadyKnows(db, catalog, r.table, v.field, saidValue)) continue;
        findings.push(
          `${doorName} answered ${saidKey.split("=")[0]} = ${JSON.stringify(saidValue)}, which is ${r.table} ${r.id}'s ${v.field} — a row this caller cannot SELECT under RLS, and no row of ${r.table} they CAN read carries that value`,
        );
      }
    }
  }
  return findings;
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
  const shared: string[] = [];
  let anyMeasured = false;
  const unmeasuredWhy: string[] = [];

  const discriminators = doorNeedsDiscriminator(door) ? DISCRIMINATOR_VOCAB : [null];

  for (const caller of [cast.a, cast.c]) {
   for (const discriminator of discriminators) {
    const filled = fillArgs(door, catalog, cast, cast.b.id, discriminator, caller);
    if (filled.unresolved.length) {
      unmeasuredWhy.push(`argument(s) not derivable: ${filled.unresolved.join(", ")}`);
      if (discriminators.length === 1)
        probes.push({ caller: caller.label, args: "-", outcome: "UNMEASURED", detail: filled.unresolved.join(", ") });
      continue;
    }
    // 🚨 DD-209. A DOOR WHOSE ARGUMENTS CANNOT CROSS THE BOUNDARY IS STILL CALLED.
    //
    // This is where V-73's finding lived. The gate used to `continue` here —
    // skipping a door BEFORE calling it whenever no argument could name a victim
    // row — on the reasoning that a probe which cannot cross proves nothing. But
    // the boundary is not crossed only by arguments: `public.get_agents_for_chat`
    // (p_limit, p_cursor) OVER-READ in its own body, with entirely benign
    // arguments, and this gate never called it once. `public.agx_get_list_full`
    // was caught by the same class of leak ONLY because it happens to take zero
    // arguments and so slipped past this test.
    //
    // The measurability test was argument-driven; the leak was not. So the door
    // is now called with whatever benign values derivation produced, and its
    // answer is row-diffed exactly like any other: the oracle is "did it hand
    // back a row this caller cannot SELECT", which needs no crossing argument at
    // all. The probe is labelled so nobody mistakes it for a cross-boundary one.
    const benign = door.argTypes.length > 0 && !filled.crossed;

    const probe = await runProbe(db, q, caller, door, filled, catalog, cast, benign);
    if (discriminator) probe.probe.caller = `${caller.label} [${discriminator}]`;
    if (benign) probe.probe.outcome = `${probe.probe.outcome} [benign args]`;
    for (const w of probe.shared) if (!shared.includes(w)) shared.push(w);
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
    return { door, verdict: "FAIL", why: "returned or minted rows the caller cannot read", leaked, probes, shared };
  }
  if (!anyMeasured) {
    // 🚨 DD-209. A DECLARED REASON RIDES THE FINDING. When a door row carries a
    // `note`, the person who declared it has written down WHY no recipe can reach
    // it — "the only education class on this database is in caller A's own
    // organization", "rag.data_stores holds no row across the boundary". That
    // sentence is the difference between an anonymous UNMEASURED and a measured
    // fact about why, so it is printed with the finding, every run.
    const note = door.probeArgs?.note;
    return {
      door,
      verdict: "UNMEASURED",
      why: `${unmeasuredWhy[0] ?? "not measured"}${note ? ` — declared on the door row: ${note}` : ""}`,
      leaked: [],
      probes,
      shared,
    };
  }
  return {
    door,
    verdict: "PASS",
    why: shared.length
      ? "answered only rows the caller can read; its writes landed in the SYSTEM organization (platform-shared content) and the caller can read them back"
      : "refused, answered nothing, or answered only rows the caller can read",
    leaked: [],
    probes,
    shared,
  };
}

async function runProbe(
  db: pg.Client,
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  caller: Principal,
  door: Door,
  filled: FilledArgs,
  catalog: Catalog,
  cast: Cast,
  benign: boolean,
): Promise<{ verdict: Verdict; why: string; leaked: string[]; probe: Probe; shared: string[] }> {
  const shared: string[] = [];
  const r = await runProbeCore(db, q, caller, door, filled, catalog, cast, benign, shared);
  return { ...r, shared };
}

async function runProbeCore(
  db: pg.Client,
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  caller: Principal,
  door: Door,
  filled: FilledArgs,
  catalog: Catalog,
  cast: Cast,
  benign: boolean,
  shared: string[],
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

    // ── WHAT DID THE CALL WRITE? ────────────────────────────────────────────
    //
    // 🚨 DD-213. THIS RUNS ON EVERY OUTCOME, INCLUDING A REFUSAL. Until
    // 2026-09-14 the write arm below sat AFTER the three early returns, so a
    // door that refused — by raising, by a refusal envelope, or by answering
    // nothing — was scored PASS without its writes ever being looked at. That
    // is precisely how DD-213 hid in plain sight: five doors handed a stranger
    // a refusal envelope AND wrote a row into an organization's `hr.access_audit`
    // that the stranger has no standing in, and all five were PASS in a blocking
    // gate. A refusal is a statement about the ANSWER; it says nothing about the
    // side effects, and this gate must never again read one as the other.
    //
    // An answer carrying no row id is not proof either:
    // `public.hr_module_set_enabled` answered a non-member
    // `{"ok": true, "module_enabled": false}` — no uuid anywhere — while
    // switching another organization's HR module off. So the writes are measured
    // from the transaction itself (`pg_stat_xact_user_tables`, narrowed row by
    // row by xid), never inferred from the answer.
    //
    // On the raised path the call was already rolled back to its savepoint, so
    // its rows are gone and the xid confirmation reports nothing — which is the
    // truth: a door that raises leaves nothing behind.
    await db.query("reset role");
    const wrote = await writesCrossingTheBoundary(db, caller, catalog);
    shared.push(...wrote.sharedVocabulary);
    await db.query("set local role authenticated");

    const answerShape =
      rows === null
        ? isRefusal(errCode, errMsg)
          ? "REFUSED"
          : "ERROR"
        : isRefusalEnvelope(rows)
          ? "REFUSED (envelope)"
          : isEmptyAnswer(rows)
            ? "EMPTY"
            : "ROWS";

    if (wrote.crossed.length) {
      await db.query(TX_ROLLBACK());
      return {
        verdict: "FAIL",
        why: `wrote across the boundary (the answer was ${answerShape})`,
        leaked: wrote.crossed,
        probe: {
          caller: caller.label,
          args: filled.sql,
          outcome: `${answerShape} + CROSS-BOUNDARY WRITE`,
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

    if (rows === null) {
      const refused = isRefusal(errCode, errMsg);
      if (refused) {
        await db.query(TX_ROLLBACK());
        return {
          verdict: "PASS",
          why: `refused ${errCode}, and wrote nothing`,
          leaked: [],
          probe: { caller: caller.label, args: filled.sql, outcome: "REFUSED", detail: `${errCode} ${errMsg.slice(0, 160)}` },
        };
      }
      // 🚨 DD-209. THE CONTROL PROBE — which of the two sentences is true?
      //
      // "the argument was wrong" and "the door refused by not seeing the row"
      // arrive wearing the same clothes. `seo.gsc_assert_site_editor` raises
      // `P0002 gsc_site_not_found` both when the harness handed it a tombstone
      // and when RLS hid a live site from the caller — 58 doors sat in the
      // UNMEASURED bucket under one flat sentence, "the call failed for a
      // non-authorization reason", and nobody could tell which was which
      // without opening each body by hand. A hand classification also goes
      // stale the day a door changes.
      //
      // So the harness asks. The IDENTICAL call is repeated as the VICTIM —
      // the identity that really does own the rows — inside the same
      // always-rolled-back transaction. If the victim's own call fails the same
      // way, the value was wrong and no identity could have made it right:
      // that door needs a probe_args recipe, and the finding says so by name.
      // If the victim gets further, the stranger's "not found" WAS the
      // authorization decision — the door declined to see a row it may not see,
      // returned nothing and (measured above) wrote nothing. That is a bounded
      // door, and calling it UNMEASURED would understate what was proven.
      const control = await controlProbe(db, call, filled.values, cast.b);
      const sameShape = control.code === errCode && ERROR_SHAPE(control.message) === ERROR_SHAPE(errMsg);
      await db.query(TX_ROLLBACK());
      // 🚨 DD-209 (V-102 F3). "THE VICTIM GOT FURTHER" IS NOT ENOUGH ON ITS OWN.
      //
      // The first cut of this rule read: if the victim's identical call gets
      // further, the stranger's error WAS the authorization decision. That is
      // sound for a not-found — the door declined to see a row it may not see —
      // and false for a CRASH. `public.hr_pay_group_upsert('{}')` fails for a
      // stranger with `23502 null value in column "organization_id" of relation
      // "access_audit"`: the door ran on, reached the point of writing an audit
      // row for somebody with no organization context, and a NOT NULL constraint
      // stopped it. The victim gets further because the victim HAS an
      // organization, not because the stranger was refused. Scoring that PASS
      // converts an unmeasured door into a claimed measurement, which is the one
      // error this whole gate exists to prevent.
      //
      // So the SQLSTATE decides. A not-found (`P0002` / `02000`) can be a refusal
      // by invisibility; everything else — a constraint violation, a type error,
      // a missing relation, a raise with no authorization text — is UNMEASURED
      // with the error named, whatever the victim's call did.
      const NOT_FOUND_STATE = /^(P0002|02000)$/;
      const authzShaped = errCode === "42501" || (errCode === "P0001" && AUTHZ_MESSAGE.test(errMsg));
      if (!sameShape && !authzShaped && !NOT_FOUND_STATE.test(errCode)) {
        return {
          verdict: "UNMEASURED",
          why:
            `the call failed for a reason that is not an authorization decision: ${errCode} ${errMsg.slice(0, 140)}. ` +
            `The victim's identical call gets further (${control.outcome}), but ${errCode} is not a refusal — a constraint violation or a crash is not a decision about this caller.`,
          leaked: [],
          probe: { caller: caller.label, args: filled.sql, outcome: "ERROR (not a decision)", detail: `${errCode} ${errMsg.slice(0, 160)}` },
        };
      }
      // A not-found from a door no argument of which crossed the boundary is not
      // "you may not see that row" — it is "you have no row of your own". The two
      // `creator_*` doors are exactly that: self-scoped, acting on the caller's
      // own profile. The verdict is the same; the SENTENCE has to be true.
      if (!sameShape && !filled.crossed) {
        return {
          verdict: "PASS",
          why:
            `no row of your own: ${errCode} ${errMsg.slice(0, 120)} — no argument of this call named a row across the boundary, so the door is self-scoped and this caller simply has none. ` +
            `It returned nothing and wrote nothing. (The victim's identical call ${control.outcome}.)`,
          leaked: [],
          probe: {
            caller: caller.label,
            args: filled.sql,
            outcome: "EMPTY (no row of your own)",
            detail: `${errCode} ${errMsg.slice(0, 120)} | victim: ${control.outcome}`,
          },
        };
      }
      if (sameShape) {
        return {
          verdict: "UNMEASURED",
          why:
            `the argument is wrong, not the caller: ${errCode} ${errMsg.slice(0, 120)} — the victim's own identical call fails the same way ` +
            `(${control.code} ${control.message.slice(0, 80)}), so no identity makes this value work. Declare a probe_args recipe on the door row.`,
          leaked: [],
          probe: { caller: caller.label, args: filled.sql, outcome: "ERROR (argument)", detail: `${errCode} ${errMsg.slice(0, 160)}` },
        };
      }
      return {
        verdict: "PASS",
        why:
          `refused by not seeing the row: ${errCode} ${errMsg.slice(0, 120)} — the victim's identical call gets further ` +
          `(${control.outcome}), so this error IS the authorization decision. The door returned nothing and wrote nothing.`,
        leaked: [],
        probe: {
          caller: caller.label,
          args: filled.sql,
          outcome: "REFUSED (row invisible)",
          detail: `${errCode} ${errMsg.slice(0, 120)} | victim: ${control.outcome}`,
        },
      };
    }

    // A boolean door can never be judged by the row oracle — unless somebody has
    // declared what a TRUE answer about the victim's row would MEAN. DD-209: with
    // a `boolean_oracle` on the door row and a probe that really did cross the
    // boundary, the ANSWER is the measurement, not the rows.
    if (BOOLEAN_ONLY(door)) {
      const oracle = door.probeArgs?.boolean_oracle;
      if (oracle && !benign) {
        const said = rows.some((r) => Object.values(r).some((v) => v === true));
        await db.query(TX_ROLLBACK());
        return said
          ? {
              verdict: "FAIL",
              why: "answered TRUE about a row across the boundary",
              leaked: [
                `${door.schema}.${door.fn} answered TRUE for arguments naming a row the caller has no standing in — ${oracle}`,
              ],
              probe: {
                caller: caller.label,
                args: filled.sql,
                outcome: "BOOLEAN TRUE ACROSS THE BOUNDARY",
                detail: JSON.stringify(rows).slice(0, 200),
              },
            }
          : {
              verdict: "PASS",
              why: `answered false about a row across the boundary, and wrote nothing — ${oracle}`,
              leaked: [],
              probe: {
                caller: caller.label,
                args: filled.sql,
                outcome: "BOOLEAN false (measured)",
                detail: JSON.stringify(rows).slice(0, 120),
              },
            };
      }
      await db.query(TX_ROLLBACK());
      return {
        verdict: "UNMEASURED",
        why: oracle
          ? `the door returns ${door.retType.trim()} and carries a boolean_oracle, but this probe crossed no boundary, so its answer proves nothing`
          : `the door returns ${door.retType.trim()} and wrote nothing — a true/false answer carries no row to place against the caller's standing, so its boundedness is NOT measured by this method. Declare a probe_args boolean_oracle if a recipe can make its answer differ across the boundary.`,
        leaked: [],
        probe: {
          caller: caller.label,
          args: filled.sql,
          outcome: "BOOLEAN (unmeasurable)",
          detail: JSON.stringify(rows).slice(0, 120),
        },
      };
    }

    // A REFUSAL ENVELOPE is a refusal, not an answer. Several doors refuse by
    // returning `{"granted": false, "reason": …, "audit_id": …}` rather than
    // raising — `hr.reveal_ssn` writes the denial into `hr.access_audit` and
    // hands back the receipt id. The receipt names a row the caller cannot
    // read BECAUSE the door refused, which is the opposite of a leak; reading
    // it as one would make this gate cry wolf on the doors that behave best.
    // (Its SIDE EFFECTS were measured above, before we got here.)
    if (isRefusalEnvelope(rows)) {
      await db.query(TX_ROLLBACK());
      return {
        verdict: "PASS",
        why: "refused in its answer envelope, and wrote nothing",
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
        why: "answered nothing, and wrote nothing",
        leaked: [],
        probe: { caller: caller.label, args: filled.sql, outcome: "EMPTY", detail: JSON.stringify(rows).slice(0, 120) },
      };
    }

    // Rows came back. Which of the uuids in them can this caller SELECT?
    const injected = new Set(filled.injectedIds.map((s) => s.toLowerCase()));
    const keep = (u: string) => !injected.has(u) && u !== caller.id.toLowerCase();
    const harvested = harvest(rows);
    const identityIds = [...harvested.identity].filter(keep);
    const referenceIds = [...harvested.reference].filter(keep);
    const ids = [...new Set([...identityIds, ...referenceIds])];

    // 🚨 DD-209 (V-102 F1). THE DISCLOSURE ORACLE, BEFORE THE UUID DIFF — because
    // the shape it catches leaves NO foreign uuid behind. The ids examined include
    // the ones this harness INJECTED: a door handed an id it may not read, which
    // answers with that row's name, is the whole defect, and those ids are dropped
    // from the identity diff by design.
    const disclosureIds = [...new Set([...ids, ...filled.injectedIds.map((u) => u.toLowerCase())])];
    const disclosed = await disclosureFindings(
      db,
      catalog,
      caller,
      rows,
      disclosureIds,
      `${door.schema}.${door.fn}`,
    );
    if (disclosed.length) {
      await db.query(TX_ROLLBACK());
      return {
        verdict: "FAIL",
        why: "disclosed a field of a row the caller cannot read",
        leaked: disclosed,
        probe: {
          caller: caller.label,
          args: filled.sql,
          outcome: "DISCLOSURE",
          detail: disclosed.join(" · ").slice(0, 400),
        },
      };
    }

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
    // 🚨 DD-209. ONE STANDING RULE FOR BOTH ARMS. DD-208 taught the WRITE arm that
    // a personal organization this very call minted FOR THE CALLER is the caller's
    // own — and the ROWS arm below was left comparing against the stale snapshot.
    // So `public.league_set_opt_in(p_opted_in, p_display_name)`, whose only
    // arguments are benign and which calls `iam.personal_org_id(auth.uid())`,
    // came back a FAIL for the org-less caller: it returned the membership row it
    // had just minted into that caller's OWN brand-new personal organization
    // (measured 2026-09-14: created_by = the caller, membership role = owner).
    // Two arms judging standing two ways is how a gate cries wolf, so they now ask
    // the same question.
    const callerOrgsNow = [...caller.orgIds, ...(await orgsMintedForTheCallerByThisCall(db, caller))];

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
      if (r.minted && r.orgId && !callerOrgsNow.includes(r.orgId)) {
        // 🚨 DD-209. The SYSTEM organization is not a tenant. A row minted there
        // is platform-shared content (`seo.keyword`, `seo.topic`,
        // `education.learn_doc` and four more DEFAULT their organization_id to
        // it), so it is not judged here — it falls through to the ordinary RLS
        // test below, which FAILS it if the caller cannot read what it was just
        // handed, and the write arm has already named it on this run.
        if (!catalog.systemOrgIds.includes(r.orgId)) {
          leakedRows.push(
            `${r.table} ${r.id} — MINTED by this call into organization ${r.orgId}, which the caller has no standing in`,
          );
          continue;
        }
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
 * DD-209's control probe. The identical call, as the victim identity, inside its
 * own savepoint so nothing it does survives and the caller's probe transaction
 * is never poisoned. The comparison is on the error SHAPE, not the text: uuids,
 * numbers and quoted values are blanked, because `class <id> not found` and
 * `class <other id> not found` are the same sentence about different rows.
 */
const ERROR_SHAPE = (msg: string): string =>
  msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/"[^"]*"/g, "<q>")
    .replace(/\d+/g, "<n>")
    .trim()
    .toLowerCase();

async function controlProbe(
  db: pg.Client,
  call: string,
  values: unknown[],
  victim: Principal,
): Promise<{ code: string; message: string; outcome: string }> {
  const claims = JSON.stringify({
    sub: victim.id,
    role: "authenticated",
    email: victim.email,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
  });
  await db.query("savepoint control_probe");
  try {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await db.query("set local role authenticated");
    const r = await db.query(call, values);
    return { code: "", message: "", outcome: `answered ${r.rowCount ?? 0} row(s)` };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return {
      code: err.code ?? "",
      message: err.message ?? String(e),
      outcome: `${err.code ?? ""} ${(err.message ?? "").slice(0, 80)}`,
    };
  } finally {
    try {
      await db.query("rollback to savepoint control_probe");
    } catch {
      /* the caller's rollback ends the transaction anyway */
    }
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
  /** DD-209: writes into the SYSTEM organization the caller can read back — shared platform content, named on every run, never silent and never a tenant crossing. */
  sharedVocabulary: string[];
}

/**
 * Tables the SELF-TEST itself writes while planting a door — the door
 * declaration it must insert for §6d-4 to leave the grant alone, and the DDL
 * guard's own log row. They are the harness writing, not the door under test.
 */
const HARNESS_OWN_TABLES = new Set(["platform.client_callable_door", "platform.ddl_guard_log"]);

const OWNER_COLS = ["user_id", "created_by", "actor_user_id", "owner_id", "updated_by"];

/**
 * 🚨 DD-208. The caller's standing is a SNAPSHOT taken before the probe, and one
 * legitimate door class moves it: a door that calls
 * `public.ensure_personal_organization(auth.uid())` creates the caller's OWN
 * personal organization inside the probe transaction, then writes the caller's
 * own row into it. Against the stale snapshot that reads as "an organization the
 * caller has no standing in" — and `billing.entitlement_consume` was FAILED for
 * exactly that, on an organization id that never existed outside a rolled-back
 * transaction. Measured live 2026-09-13: the ledger row it writes carries the
 * caller's `user_id`, the organization was `created_by` the caller with the
 * caller as its `owner`, and the caller CAN `select` the row under
 * `billing.usage_ledger.std_select` (`user_id = auth.uid()`).
 *
 * So an organization also counts as the caller's when this very call MINTED it
 * WITH the caller as its creator and owner. That is the personal-org shape and
 * nothing else: a door writing into a pre-existing victim organization cannot
 * reach this arm, because the victim's organization row was not written by this
 * call. Re-reading membership alone would NOT be safe — a door that enrolled the
 * caller into the victim's organization and then wrote there would go green.
 */
async function orgsMintedForTheCallerByThisCall(db: pg.Client, caller: Principal): Promise<string[]> {
  try {
    const r = await db.query(
      `select o.id::text as id
         from iam.organizations o
         join iam.organization_member m
           on m.organization_id = o.id and m.user_id = $1 and m.role = 'owner'
        where o.created_by = $1
          and ${WRITTEN_BY_THIS_CALL.replace(/xmin/g, "o.xmin")}`,
      [caller.id],
    );
    return (r.rows as { id: string }[]).map((x) => x.id);
  } catch {
    // A failure here must never manufacture standing the caller does not have.
    return [];
  }
}

/**
 * The same written rows, counted a second time as the CALLER — the JWT claims are
 * already set `local` on this transaction, so `set local role authenticated` puts
 * us back in their seat. Returns null when the caller's view cannot be taken at
 * all (a table they hold no SELECT grant on); never an exception, and never a
 * number that could be mistaken for "nothing was written".
 */
async function rowsVisibleToTheCaller(
  db: pg.Client,
  sch: string,
  tab: string,
  placeCol: string,
  placeVal: string | null,
): Promise<number | null> {
  // A failed read here must never poison the probe transaction, so it is taken
  // inside its own savepoint.
  await db.query("savepoint caller_view");
  try {
    await db.query("set local role authenticated");
    const r = await db.query(
      `select count(*)::int as n from ${qi(sch)}.${qi(tab)}
        where ${WRITTEN_BY_THIS_CALL} and ${
          placeVal === null ? `${qi(placeCol)} is null` : `${qi(placeCol)}::text = $1`
        }`,
      placeVal === null ? [] : [placeVal],
    );
    await db.query("release savepoint caller_view");
    return (r.rows[0] as { n: number }).n;
  } catch {
    try {
      await db.query("rollback to savepoint caller_view");
    } catch {
      /* nothing left to roll back to */
    }
    return null;
  } finally {
    try {
      await db.query("reset role");
    } catch {
      /* the caller's next statement resets it */
    }
  }
}

async function writesCrossingTheBoundary(
  db: pg.Client,
  caller: Principal,
  catalog: Catalog,
): Promise<WriteVerdict> {
  const touched = (
    await db.query(`
      select schemaname as sch, relname as tab, n_tup_ins as ins, n_tup_upd as upd, n_tup_del as del
      from pg_stat_xact_user_tables
      where n_tup_ins + n_tup_upd + n_tup_del > 0`)
  ).rows as { sch: string; tab: string; ins: string; upd: string; del: string }[];
  const crossed: string[] = [];
  const unjudged: string[] = [];
  const sharedVocabulary: string[] = [];
  if (!touched.length) return { crossed, unjudged, sharedVocabulary };

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

    const mine =
      orgCol || isOrgTable ? [...caller.orgIds, ...(await orgsMintedForTheCallerByThisCall(db, caller))] : [caller.id];
    const rows = (
      await db.query(
        `select ${qi(placeCol)}::text as v, count(*)::int as n from ${qi(t.sch)}.${qi(t.tab)}
          where ${WRITTEN_BY_THIS_CALL} group by 1`,
      )
    ).rows as { v: string | null; n: number }[];
    for (const r of rows) {
      if (r.v && mine.includes(r.v)) continue;
      // 🚨 DD-213: A WRITE THE CALLER CANNOT SEE IS STILL A WRITE. The same rows
      // are counted a second time under the CALLER's own RLS, and the finding
      // says which it was. The rows this gate was built for are exactly the
      // invisible kind — a stranger's knock written into an organization's
      // `hr.access_audit`, a log that stranger can never read back — so a
      // measurement taken only as the caller would have seen nothing at all.
      const seen = await rowsVisibleToTheCaller(db, t.sch, t.tab, placeCol, r.v);
      // 🚨 DD-209. The SYSTEM organization is not a tenant (see Catalog.systemOrgIds).
      // A row written there that the caller can read back IS the shared platform
      // vocabulary doing its job; it is named on every run and never counted as a
      // crossing. A row written there the caller CANNOT read back is still a FAIL —
      // that is the DD-213 shape, and being shared content does not excuse it.
      if ((orgCol || isOrgTable) && r.v && catalog.systemOrgIds.includes(r.v) && seen !== null && seen >= r.n) {
        sharedVocabulary.push(
          `${qualified} — ${r.n} row(s) written by this call into the SYSTEM organization ${r.v} (platform-shared content, not a tenant), all ${seen} readable back by the caller under RLS`,
        );
        continue;
      }
      const lens =
        seen === null
          ? "" // the caller's own view could not be taken; the postgres count stands alone
          : seen === 0
            ? ", and the caller cannot see a single one of them under RLS"
            : `, of which the caller can see ${seen} under RLS`;
      crossed.push(
        orgCol || isOrgTable
          ? `${qualified} — ${r.n} row(s) written by this call into organization ${r.v ?? "NULL"}, which the caller has no standing in${lens}`
          : `${qualified} — ${r.n} row(s) written by this call owned by ${r.v ?? "NULL"}, not the caller${lens}`,
      );
    }
    // Deletes are deliberately NOT reported from the counters. A deleted row
    // cannot be read back to place it, and through a transaction-pooled
    // connection the counter itself is not proof this call did it. Saying so is
    // the honest position; claiming a cross-boundary delete on that evidence is
    // not. THIS IS A KNOWN HOLE in the gate, and it is named in the header.
  }
  return { crossed, unjudged, sharedVocabulary };
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
    retType: "TABLE(id uuid)",
    probeArgs: null,
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

/**
 * 🚨 DD-209, RED then GREEN: A DOOR WITH ONLY BENIGN ARGUMENTS.
 *
 * V-73 found the gap by reading one line: the gate used to `continue` before
 * calling a door whose arguments could not name a victim row, so
 * `public.get_agents_for_chat(p_limit, p_cursor)` — which over-read inside its
 * own body — was never called once, while `public.agx_get_list_full()` was caught
 * by the same class of leak only because it takes ZERO arguments and slipped past
 * the test. The boundary is not crossed only by arguments.
 *
 * This plants exactly that shape: a `SECURITY DEFINER` door whose only argument is
 * a page size — nothing in it can name anybody — returning a row measured to be
 * unreadable by caller A. It must be a FAIL. Then the same door, bounded to the
 * caller's own organizations, must be a PASS: a gate that fails a correct door is
 * as useless as one that passes a leak.
 */
async function plantBenignArgumentShape(
  db: pg.Client,
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  cast: Cast,
  catalog: Catalog,
  victim: { table: string; id: string },
): Promise<boolean> {
  const [vSch, vTab] = victim.table.split(".");
  const door: Door = {
    schema: "public",
    fn: "dd209_selftest_benign_args_door",
    identityArgs: "p_limit integer",
    declaredBy: "DD-209 self-test",
    gatePredicate: "auth.uid()",
    oid: 0,
    volatile: false,
    argNames: ["p_limit"],
    argTypes: ["integer"],
    argDefaults: 0,
    retSet: true,
    retType: "TABLE(id uuid)",
    probeArgs: null,
  };

  await db.query("begin");
  OUTER_TX = true;
  let red = false;
  let green = false;
  try {
    await db.query(`
      create function public.dd209_selftest_benign_args_door(p_limit integer)
      returns table(id uuid) language sql security definer set search_path = pg_catalog, public as $fn$
        select t.id from ${qi(vSch)}.${qi(vTab)} t where t.id = '${victim.id}'::uuid limit p_limit
      $fn$`);
    await db.query(`
      insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason, gate_predicate)
      values ('public','dd209_selftest_benign_args_door','p_limit integer','DD-209 self-test',
              'planted by pnpm check:door-rows:self-test inside a rolled-back transaction','auth.uid()')`);
    await db.query(`grant execute on function public.dd209_selftest_benign_args_door(integer) to authenticated`);

    const r1 = await measureDoor(db, q, cast, catalog, door);
    red = r1.verdict === "FAIL";
    console.log(
      red
        ? `${TAG.ok}DD-209 BENIGN-ARGUMENT RED proven: a door whose only argument is a page size is ${r1.verdict} — ${r1.leaked.slice(0, 1).join(", ")}`
        : `${TAG.fail}DD-209 BENIGN-ARGUMENT RED: the planted over-reading door came back ${r1.verdict} (${r1.why}) — this gate is still skipping doors it cannot cross by argument, and V-73's class is open`,
    );

    await db.query(`
      create or replace function public.dd209_selftest_benign_args_door(p_limit integer)
      returns table(id uuid) language sql security definer set search_path = pg_catalog, public as $fn$
        select t.id from ${qi(vSch)}.${qi(vTab)} t
         where t.id = '${victim.id}'::uuid
           and exists (select 1 from iam.organization_member m
                        where m.user_id = auth.uid() and m.organization_id = t.organization_id)
         limit p_limit
      $fn$`);
    const r2 = await measureDoor(db, q, cast, catalog, door);
    green = r2.verdict === "PASS";
    console.log(
      green
        ? `${TAG.ok}DD-209 BENIGN-ARGUMENT GREEN proven: the same door bounded to the caller's own organizations is PASS — ${r2.why}`
        : `${TAG.fail}DD-209 BENIGN-ARGUMENT GREEN: the bounded door came back ${r2.verdict} (${r2.why}) — this gate would fail a correct door`,
    );
  } catch (e) {
    console.log(`${TAG.fail}DD-209 BENIGN-ARGUMENT arm could not run: ${(e as Error).message.slice(0, 200)}`);
  } finally {
    OUTER_TX = false;
    await db.query("rollback");
  }
  return red && green;
}

/**
 * DD-213, RED then GREEN, on a REAL door and the REAL defect.
 *
 * The DD-191 replay above proves the gate reaches a leaking SHAPE. This proves
 * the half that was missing: that a door which REFUSES and writes anyway is a
 * FAIL. `hr._record_access_audit` — the one insert of record behind 74
 * client-callable HR doors — is restored to its pre-DD-213 body from the bytes
 * kept at `scripts/door-rows/dd213-pre-fix-record-access-audit.sql`, and the live
 * door `public.hr_my_compensation` is probed with the harness's own cast. Before
 * DD-213 that call handed a stranger `{"granted": false, "reason": "not_self"}`
 * AND a row in an organization's `hr.access_audit`, and this gate scored it PASS.
 * It must now be a FAIL, naming the row. Then the live body is put back (by the
 * rollback, never by a second CREATE OR REPLACE) and the same door must be PASS.
 *
 * Everything happens inside ONE transaction that is always rolled back, and the
 * live body is re-read afterwards to prove the DD-213 guard is still there.
 */
async function replayDd213(
  db: pg.Client,
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  cast: Cast,
  catalog: Catalog,
  doors: Door[],
): Promise<boolean> {
  const door = doors.find((d) => d.schema === "public" && d.fn === "hr_my_compensation");
  if (!door) {
    console.log(
      `${TAG.warn}DD-213 WRITE ARM: public.hr_my_compensation is not in this population (--population=${POPULATION}) — the write arm was NOT proven on this run`,
    );
    return true;
  }
  const fixture = resolve(ROOT, "scripts/door-rows/dd213-pre-fix-record-access-audit.sql");
  if (!existsSync(fixture)) {
    console.log(`${TAG.fail}DD-213 WRITE ARM: the pre-fix fixture is missing at ${fixture} — nothing was proven`);
    return false;
  }
  const preFix = readFileSync(fixture, "utf8");

  let red = false;
  let green = false;
  await db.query("begin");
  OUTER_TX = true;
  try {
    // GREEN FIRST, on the live body, so the comparison is like for like.
    const after = await measureDoor(db, q, cast, catalog, door);
    green = after.verdict === "PASS";
    console.log(
      green
        ? `${TAG.ok}DD-213 WRITE ARM (live body): public.hr_my_compensation is PASS — ${after.why}`
        : `${TAG.fail}DD-213 WRITE ARM (live body): public.hr_my_compensation came back ${after.verdict} (${after.why})`,
    );

    await db.query(preFix);
    const before = await measureDoor(db, q, cast, catalog, door);
    red = before.verdict === "FAIL";
    console.log(
      red
        ? `${TAG.ok}DD-213 RED proven: with the pre-fix recorder restored, public.hr_my_compensation is ${before.verdict} — ${before.leaked.slice(0, 2).join(", ")}`
        : `${TAG.fail}DD-213 RED: the pre-fix recorder came back ${before.verdict} (${before.why}) — this gate is not measuring what a REFUSING door writes, and DD-213 can come back`,
    );
  } finally {
    OUTER_TX = false;
    await db.query("rollback");
  }

  // The live body must still carry the DD-213 guard after the rollback.
  const live = await q<{ src: string }>(
    `select prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'hr' and p.proname = '_record_access_audit'`,
  );
  const guarded = live.every((r) => /_has_audit_standing/.test(r.src));
  console.log(
    guarded
      ? `${TAG.info}after rollback, hr._record_access_audit still consults hr._has_audit_standing (the live body is intact)`
      : `${TAG.fail}after rollback, hr._record_access_audit NO LONGER consults hr._has_audit_standing — the fixture was left behind`,
  );
  return red && green && guarded;
}

/**
 * DD-213c, RED then GREEN, on the SECOND access log.
 *
 * `iam.access_audit` is written by four functions, three of which bypass its
 * recorder, so the rule lives on the table as a BEFORE INSERT trigger as well as
 * in `iam._record_access_audit`. This replay takes BOTH away — the fixture
 * `scripts/door-rows/dd213c-pre-fix-iam-record-access-audit.sql` restores the
 * pre-fix recorder and replaces the trigger's FUNCTION with a pass-through (never
 * DROP TRIGGER: that needs an ACCESS EXCLUSIVE lock on a busy audit table and
 * killed this proof on its first run) — inside one rolled-back transaction, and
 * asserts that `iam.emergency_door_open` is then a FAIL naming the row it wrote
 * into an organization the caller has no standing in. That door was not even in
 * this gate's population until DD-213c; it is now, and this is what keeps it
 * measured rather than hand-proven.
 */
async function replayDd213c(
  db: pg.Client,
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  cast: Cast,
  catalog: Catalog,
  doors: Door[],
): Promise<boolean> {
  const door = doors.find((d) => d.schema === "iam" && d.fn === "emergency_door_open");
  if (!door) {
    console.log(
      `${TAG.fail}DD-213c WRITE ARM: iam.emergency_door_open is not in this population — the door family DD-213c added is missing and nothing was proven`,
    );
    return false;
  }
  const fixture = resolve(ROOT, "scripts/door-rows/dd213c-pre-fix-iam-record-access-audit.sql");
  if (!existsSync(fixture)) {
    console.log(`${TAG.fail}DD-213c WRITE ARM: the pre-fix fixture is missing at ${fixture} — nothing was proven`);
    return false;
  }
  const preFix = readFileSync(fixture, "utf8");

  let red = false;
  let green = false;
  await db.query("begin");
  OUTER_TX = true;
  try {
    const after = await measureDoor(db, q, cast, catalog, door);
    green = after.verdict === "PASS";
    console.log(
      green
        ? `${TAG.ok}DD-213c WRITE ARM (live body): iam.emergency_door_open is PASS — ${after.why}`
        : `${TAG.fail}DD-213c WRITE ARM (live body): iam.emergency_door_open came back ${after.verdict} (${after.why})`,
    );

    await db.query(preFix);
    const before = await measureDoor(db, q, cast, catalog, door);
    red = before.verdict === "FAIL";
    console.log(
      red
        ? `${TAG.ok}DD-213c RED proven: with the pre-fix iam recorder and a pass-through trigger restored, iam.emergency_door_open is ${before.verdict} — ${before.leaked.slice(0, 1).join(", ")}`
        : `${TAG.fail}DD-213c RED: the pre-fix iam recorder came back ${before.verdict} (${before.why}) — the second access log is not being measured`,
    );
  } finally {
    OUTER_TX = false;
    await db.query("rollback");
  }

  // Bound AND still carrying the rule — a trigger left pointing at the fixture's
  // pass-through body would be a trigger that guards nothing.
  const live = await q<{ n: string }>(
    `select count(*)::text n from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'iam' and c.relname = 'access_audit'
        and t.tgname = 'access_audit_records_its_own_people' and not t.tgisinternal
        and t.tgenabled <> 'D'
        and p.prosrc like '%_has_audit_standing%'`,
  );
  const bound = live[0]?.n === "1";
  console.log(
    bound
      ? `${TAG.info}after rollback, the DD-213c trigger on iam.access_audit is bound, enabled and still asks hr._has_audit_standing (the live guard is intact)`
      : `${TAG.fail}after rollback, the DD-213c trigger on iam.access_audit is missing, disabled, or no longer asks hr._has_audit_standing — the fixture was left behind`,
  );
  return red && green && bound;
}

/**
 * DD-209 (V-102 F1), RED then GREEN, on a REAL door and the REAL defect.
 *
 * The plants above all leak a ROW. This one leaks a NAME and an EMAIL ADDRESS
 * and no foreign row id at all — the shape the uuid oracle cannot see, and the
 * reason `public.agx_get_access_level` sat PASS in the blocking lane while
 * telling any signed-in caller the name of an agent they cannot SELECT and its
 * owner's email. The pre-fix body is restored from its shipped bytes inside a
 * rolled-back transaction; the disclosure oracle must call it a FAIL, and the
 * live body must be PASS.
 */
async function replayDd209Disclosure(
  db: pg.Client,
  q: <T = Record<string, unknown>>(s: string, p?: unknown[]) => Promise<T[]>,
  cast: Cast,
  catalog: Catalog,
  doors: Door[],
): Promise<boolean> {
  const door = doors.find((d) => d.schema === "public" && d.fn === "agx_get_access_level");
  if (!door) {
    console.log(
      `${TAG.warn}DD-209 DISCLOSURE ARM: public.agx_get_access_level is not in this population (--population=${POPULATION}) — the disclosure oracle was NOT proven on this run`,
    );
    return true;
  }
  const fixture = resolve(ROOT, "scripts/door-rows/dd209-pre-fix-agx-get-access-level.sql");
  if (!existsSync(fixture)) {
    console.log(`${TAG.fail}DD-209 DISCLOSURE ARM: the pre-fix fixture is missing at ${fixture} — nothing was proven`);
    return false;
  }
  const preFix = readFileSync(fixture, "utf8");

  let red = false;
  let green = false;
  await db.query("begin");
  OUTER_TX = true;
  try {
    const after = await measureDoor(db, q, cast, catalog, door);
    green = after.verdict === "PASS";
    console.log(
      green
        ? `${TAG.ok}DD-209 DISCLOSURE ARM (live body): public.agx_get_access_level is PASS — ${after.why}`
        : `${TAG.fail}DD-209 DISCLOSURE ARM (live body): public.agx_get_access_level came back ${after.verdict} (${after.why})`,
    );

    await db.query(preFix);
    const before = await measureDoor(db, q, cast, catalog, door);
    red = before.verdict === "FAIL";
    console.log(
      red
        ? `${TAG.ok}DD-209 DISCLOSURE RED proven: with the pre-fix body restored, public.agx_get_access_level is ${before.verdict} — ${before.leaked.slice(0, 1).join(", ")}`
        : `${TAG.fail}DD-209 DISCLOSURE RED: the pre-fix body came back ${before.verdict} (${before.why}) — a door that hands over a foreign row's NAME or EMAIL is still invisible to this gate`,
    );
  } finally {
    OUTER_TX = false;
    await db.query("rollback");
  }

  const live = await q<{ src: string }>(
    `select prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'agx_get_access_level'`,
  );
  const guarded = live.every((r) => /v_may_read/.test(r.src));
  console.log(
    guarded
      ? `${TAG.info}after rollback, public.agx_get_access_level still gates its descriptive fields on v_may_read (the live body is intact)`
      : `${TAG.fail}after rollback, public.agx_get_access_level NO LONGER gates its descriptive fields — the fixture was left behind`,
  );
  return red && green && guarded;
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
    retType: "TABLE(id uuid)",
    probeArgs: null,
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

  // THE BENIGN-ARGUMENT ARM (DD-209). The plants above all cross the boundary by
  // ARGUMENT. This one cannot: its only argument is a page size, which is exactly
  // the shape V-73 proved the gate was skipping without calling.
  const benignArm = await plantBenignArgumentShape(db, q, cast, catalog, victim);

  // THE WRITE ARM. DD-213's defect was not a leaked row — it was a row this gate
  // never looked for, because the door refused. This replays it on the REAL door
  // `public.hr_my_compensation` with the REAL pre-fix recorder restored from its
  // shipped bytes, inside a rolled-back transaction, and asserts FAIL.
  const writeArm = await replayDd213(db, q, cast, catalog, _doors);

  // THE SAME PROOF ON THE SECOND ACCESS LOG. `iam.access_audit` has four writers,
  // three of which never call its recorder, so DD-213c put the rule on the table
  // as a trigger AND in the recorder. This drops the trigger and restores the
  // pre-fix recorder from ITS shipped bytes, then probes `iam.emergency_door_open`.
  const writeArmIam = await replayDd213c(db, q, cast, catalog, _doors);

  // THE DISCLOSURE ARM (DD-209 / V-102 F1). Not a leaked row — a leaked NAME and
  // EMAIL, with no foreign row id anywhere in the answer.
  const disclosureArm = await replayDd209Disclosure(db, q, cast, catalog, _doors);

  const planted = await q<{ n: string }>(
    `select count(*)::text n from pg_proc where proname like 'dd192_selftest%' or proname like 'dd209_selftest%'`,
  );
  console.log(`${TAG.info}after rollback, planted functions remaining: ${planted[0].n} (must be 0)`);
  const clean = planted[0].n === "0";
  return failedTheLeak && passedTheBounded && clean && replay && benignArm && writeArm && writeArmIam && disclosureArm
    ? 0
    : 1;
}

// ─── the by-design allowlist (DD-208) ────────────────────────────────────────
//
// The b75 lane (477 doors) has NO allowlist and never will: it blocks at FAIL = 0.
// The wider `--population=signed-in` lane could not block at all, because a
// handful of doors cross the organization boundary ON PURPOSE — a whistleblower
// report into an organization you are not in, an access request that has to write
// into the owner's organization, the AccessGate whose job is to NAME the thing you
// were denied. No fix makes this harness read those as anything but a leak, so
// without a way to say so the wide lane stays advisory forever and every real leak
// in the other 888 doors goes unblocked.
//
// An allowlisted door that FAILs is reported as ALLOWED BY DESIGN, printed by name
// on every run, and does not block. It is never silent and never a PASS.
//
// The list can only SHRINK. An entry whose door is no longer failing is STALE and
// FAILS the gate by itself — so tightening a door forces the excuse to be removed,
// and an excuse can never outlive the thing it excused.

interface ByDesignEntry {
  door: string;
  owner: string;
  reason: string;
}

const BY_DESIGN_PATH = resolve(ROOT, "scripts/door-rows/by-design-allowlist.json");

function loadByDesign(): ByDesignEntry[] {
  if (!existsSync(BY_DESIGN_PATH)) return [];
  const parsed = JSON.parse(readFileSync(BY_DESIGN_PATH, "utf8")) as { entries?: ByDesignEntry[] };
  const entries = parsed.entries ?? [];
  for (const e of entries) {
    // A reason nobody wrote is not a reason. An owner nobody named is not an owner.
    if (!e.door || !e.owner || (e.reason ?? "").trim().length < 60) {
      throw new Error(
        `by-design allowlist: the entry for ${e.door ?? "(unnamed door)"} is missing an owner or a reason of at least 60 characters. ` +
          `A door that crosses a tenant boundary on purpose is the most dangerous shape on this platform; it does not get a one-word excuse.`,
      );
    }
  }
  return entries;
}

// ─── the report ──────────────────────────────────────────────────────────────

function report(results: DoorResult[], structural: Structural): number {
  // Only the WIDE lane consults the allowlist. b75 blocks at FAIL = 0, always.
  const byDesign = POPULATION === "b75" ? [] : loadByDesign();
  const byDesignFor = (r: DoorResult) =>
    byDesign.find((e) => e.door === `${r.door.schema}.${r.door.fn}(${r.door.identityArgs})`);
  const allowed = results.filter((r) => r.verdict === "FAIL" && byDesignFor(r));
  // 🚨 DD-209. A SLICE CANNOT JUDGE THE ALLOWLIST. `--only` / `--offset` /
  // `--limit` run part of the population, so an allowlisted door outside the
  // slice looks "no longer failing" and the stale rule fails the run for an
  // artifact of the slicing — which is exactly what V-73 hit and had to explain
  // away by hand. The stale rule now applies only to a whole-population run,
  // and a sliced run SAYS it did not judge the list.
  const sliced = Boolean(ONLY || OFFSET || LIMIT);
  const stale = sliced
    ? []
    : byDesign.filter(
        (e) => !results.some((r) => r.verdict === "FAIL" && `${r.door.schema}.${r.door.fn}(${r.door.identityArgs})` === e.door),
      );
  if (sliced && byDesign.length)
    console.log(
      `${TAG.warn}this run is a SLICE (--only/--offset/--limit), so the by-design allowlist was NOT checked for stale entries; only a whole-population run judges it.`,
    );
  const fails = results.filter((r) => r.verdict === "FAIL" && !byDesignFor(r));
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
      console.log(
        r.serviceLane
          ? `       ${r.fn}(${r.args}) — service-lane door, not client-callable (declared non_client_lane); this gate probes browser callers, so it is out of scope by design, not a suspect [${r.declaredBy ?? "no declared_by"}]`
          : `       ${r.fn}(${r.args}) — no client holds EXECUTE; the row declares a door that is not one [${r.declaredBy ?? "no declared_by"}]`,
      );
  }

  const sharedWriters = results.filter((r) => r.shared.length);
  if (sharedWriters.length) {
    console.log("");
    console.log(
      `${TAG.warn}WROTE INTO THE SYSTEM ORGANIZATION (${sharedWriters.length}) — platform-shared content, not a tenant crossing. Named here on every run, because "a signed-in stranger may add to the shared vocabulary" is a real decision somebody made and it should never be invisible:`,
    );
    for (const r of sharedWriters) {
      console.log(`       ${r.door.schema}.${r.door.fn}`);
      for (const w of r.shared) console.log(`         ${w}`);
    }
  }

  if (allowed.length) {
    console.log("");
    console.log(
      `${TAG.warn}ALLOWED BY DESIGN (${allowed.length}) — these doors DO cross the boundary and a person said so in writing:`,
    );
    for (const r of allowed) {
      const e = byDesignFor(r)!;
      console.log(`       ${r.door.schema}.${r.door.fn} — owner: ${e.owner}`);
      console.log(`         ${e.reason}`);
    }
  }
  if (stale.length) {
    console.log("");
    console.log(
      `${TAG.fail}STALE BY-DESIGN ENTRIES (${stale.length}) — the door is no longer failing, so the excuse must go. Delete it from scripts/door-rows/by-design-allowlist.json:`,
    );
    for (const e of stale) console.log(`       ${e.door} — owner: ${e.owner}`);
  }

  console.log("");
  console.log(
    `${fails.length || stale.length ? TAG.fail : TAG.ok}${passes.length} PASS · ${fails.length} FAIL · ${allowed.length} ALLOWED BY DESIGN · ${unmeasured.length} UNMEASURED (of ${results.length} declared signed-in doors)`,
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
          sharedVocabularyWrites: r.shared,
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
  if (stale.length) return STRICT ? 1 : 0;
  return 0;
}

main()
  .then((code) => exitAfterDrain(code))
  .catch((e) => {
    console.error(`${TAG.fail}script error: ${(e as Error).stack ?? e}`);
    exitAfterDrain(2);
  });
