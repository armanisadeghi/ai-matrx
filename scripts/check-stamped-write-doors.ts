#!/usr/bin/env npx tsx
/**
 * THE STAMPED-WRITE GUARD — a table whose rows name their author is reachable by
 * exactly ONE code path, and that path derives the name from the caller. (DD-248)
 *
 * WHY THIS EXISTS
 * ---------------
 * `context.context_item_values` holds every scope cell in the platform, append-only,
 * one row per version, and `authored_by` is who the platform names when somebody asks
 * who filled a cell. Measured live on 2026-09-15 (THE PLAN v2 §9 D-5, B-139), a
 * signed-in caller with editor rights on a scope had THREE ways in, and only one of
 * them was a door anybody had declared:
 *
 *   1. `public.set_context_value(jsonb)`         declared door, stamps auth.uid()
 *   2. `public.set_scope_context_value(...)`     declared door, stamps auth.uid()
 *   3. `context.write_context_value(...)`        SECURITY INVOKER, EXECUTE held by
 *      `authenticated`, `context` in `pgrst.db_schemas` — so it was an HTTP endpoint —
 *      and BOTH `p_actor` and `p_source_type` are its arguments. Whatever the caller
 *      typed became `authored_by`, including somebody else's user id, or null.
 *   4. …and no function at all: `authenticated` held INSERT, UPDATE and DELETE on the
 *      table itself, with an RLS `std_insert` policy that admits any scope editor. A
 *      plain PostgREST insert set every column, stamps included.
 *
 * Nothing was stolen and RLS was never wrong: all four paths refuse a caller who is not
 * an editor of the scope. The hole is PROVENANCE. On paths 3 and 4 the row records what
 * the writer CHOSE to say about itself, so "who changed this cell" and "was this an AI
 * enrichment or a person" are decoration on a column anyone could write.
 *
 * DD-197 closed this class for `anon` on 66 invoker writers and re-granted all of them
 * to `authenticated`, which was right for its own axis and is the reason this one stayed
 * open. 102 SECURITY INVOKER writers in PostgREST-exposed schemas still carry
 * `authenticated` EXECUTE (measured here, 2026-09-15); this guard does not judge them.
 * It judges the tables that have declared, in `platform.stamped_write_table`, that their
 * writes carry a stamp — and for those the correct number of undeclared paths is zero.
 *
 * WHAT IT FAILS ON, per registered table — FIVE ARMS, because closing four is closing none
 * ---------------------------------------------------------------------------------------
 *   grant   a client role (`anon`, `authenticated`, or PUBLIC, which reaches both) can
 *           INSERT, UPDATE, DELETE or TRUNCATE the table. Measured with
 *           `has_table_privilege` and `has_column_privilege`, never by reading role names
 *           out of `relacl`: a privilege held through PUBLIC or through role membership
 *           does not appear there, and a `revoke … from authenticated` that misses it is
 *           a no-op that reads like a fix (DD-194).
 *   variant `platform.entity_types.rls_variant` no longer says what the register says.
 *           The grants are generated: `iam.apply_table_grants(schema, table, variant)`
 *           grants SELECT only for `ledger` and full DML for `component`. Revoking the
 *           privilege without correcting the declaration leaves the next regeneration to
 *           re-open it, and nothing would say so.
 *   door    a function a client role can EXECUTE writes the table and holds no row in
 *           `platform.client_callable_door`. That is arm 3 above.
 *   stamper the table's OWN stamping trigger — the mechanism that makes the exemption below
 *           honest. `platform._stamp_actor()` runs BEFORE INSERT OR UPDATE FOR EACH ROW and
 *           sets the stamp from `auth.uid()` (or the server-side `app.user_id` GUC, which no
 *           client-callable function anywhere sets — measured 2026-09-21, zero
 *           `set_config('app.user_id'…)` in any body). It is verified by VALUE, never by
 *           name: row-level, BEFORE INSERT, ENABLED, and a body that assigns
 *           `NEW.<stamp_column>` from `auth.uid()`. A table whose doors lean on it and
 *           whose trigger is missing or disabled is a finding, and every door that leaned
 *           on it becomes a `stamp` finding in the same run.
 *   stamp   a DECLARED door that writes the table and cannot be deriving the stamp from the
 *           caller. TWO honest ways to stamp, and the guard checks which one is in force:
 *             a. the door's own body reaches `auth.uid()` — it stamps for itself; or
 *             b. the table carries a verified `stamper` AND the door's body never ASSIGNS
 *                the stamp column, so the trigger's value is the only one that can land.
 *                `_stamp_actor` is `NEW.created_by := coalesce(NEW.created_by, uid)`: a
 *                value the door supplies WINS. So "never assigns it" is not a courtesy —
 *                it is the whole of the exemption, and it is read off the body, not off a
 *                name allowlist and not off a declaration anybody can write.
 *           A door that assigns the stamp column from an argument it never checked is arm 3
 *           wearing a declaration, and it still fails.
 *   probe   the live proof, as a real signed-in caller (test@test.com, `role authenticated`
 *           with that user's JWT claims): a WELL-FORMED direct INSERT — built from the
 *           table's OWN declared stamp column, so it parses on every registered table —
 *           and a direct call of every undeclared writer, must both come back `42501` — refused at the privilege
 *           check, before any row logic. A refusal for any OTHER reason is reported as a
 *           finding, not a pass: "not found" means the caller got PAST the privilege check
 *           and was stopped by an accident of the data. Every probe runs inside a
 *           transaction that is rolled back; nothing is written.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS — with no database credentials, with no register
 * table, or with a register row naming a table that does not exist, it exits 1 and says so.
 *
 *   pnpm check:stamped-write-doors              # the census
 *   pnpm check:stamped-write-doors --self-test  # RED then GREEN against the real database
 */
import { exitAfterDrain } from "./lib/exit-after-drain";
import { connectDirect, loadDbEnv, DB_VARS } from "./lib/direct-db";
import type { Client } from "pg";

const SELF_TEST = process.argv.includes("--self-test");
const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };
const FAIL = `${C.r}FAIL${C.x}`;
const OK = `${C.g} OK ${C.x}`;
const INFO = `${C.b}[INFO]${C.x}`;

/** The roles a browser can actually be. `authenticator` may become anon and authenticated. */
const CLIENT_ROLES = ["anon", "authenticated"] as const;
const WRITE_PRIVS = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"] as const;
const PROBE_EMAIL = "test@test.com";

/**
 * Every arm that has to TRY something wraps it and throws it away. Inside the self-test
 * a transaction is already open (that is where the planted violation lives), and a bare
 * `rollback` there would roll back the PLANT as well — the guard would then measure the
 * closed surface and report that it cannot see the defect. So the brackets are
 * savepoints whenever a transaction is already open.
 */
let OUTER_TX = false;
const TX_BEGIN = () => (OUTER_TX ? "savepoint stamped_probe" : "begin");
const TX_ROLLBACK = () => (OUTER_TX ? "rollback to savepoint stamped_probe" : "rollback");

interface Registered {
  schema_name: string;
  table_name: string;
  stamp_column: string;
  rls_variant: string;
  declared_by: string;
}
interface Finding {
  arm: string;
  target: string;
  detail: string;
}

async function registeredTables(db: Client): Promise<Registered[]> {
  const { rows } = await db.query<Registered>(
    `select schema_name, table_name, stamp_column, rls_variant, declared_by
       from platform.stamped_write_table order by schema_name, table_name`,
  );
  return rows;
}

/** arm `grant` — table AND column privileges, asked the way the server answers them. */
async function grantArm(db: Client, t: Registered): Promise<Finding[]> {
  const rel = `${t.schema_name}.${t.table_name}`;
  const out: Finding[] = [];
  for (const role of [...CLIENT_ROLES, "public"]) {
    for (const priv of WRITE_PRIVS) {
      const { rows } = await db.query<{ held: boolean }>(
        `select has_table_privilege($1, $2::regclass, $3) as held`,
        [role, rel, priv],
      );
      if (rows[0]?.held) {
        out.push({
          arm: "grant",
          target: `${rel}`,
          detail: `${role} holds ${priv} on the table — a write with no function, so nothing stamps ${t.stamp_column}`,
        });
      }
    }
    // A column privilege survives `revoke … on <table>` (DD-193 arm 1).
    const { rows: cols } = await db.query<{ attname: string; priv: string }>(
      `select a.attname, p.priv
         from pg_attribute a
         cross join unnest(array['INSERT','UPDATE']) as p(priv)
        where a.attrelid = $2::regclass and a.attnum > 0 and not a.attisdropped
          and a.attacl is not null
          and has_column_privilege($1, a.attrelid, a.attname, p.priv)
          and not has_table_privilege($1, a.attrelid, p.priv)`,
      [role, rel],
    );
    for (const c of cols) {
      out.push({
        arm: "grant",
        target: `${rel}.${c.attname}`,
        detail: `${role} holds a COLUMN ${c.priv} grant — a table-level revoke does not remove it`,
      });
    }
  }
  return out;
}

/**
 * arm `generator` — the grants are GENERATED, so the question is not what they are
 * today but what the generator would produce if it ran again.
 *
 * Two halves. First the declaration in `platform.entity_types` still matches what the
 * register recorded, so a change to the table's access-lane shape is never silent.
 * Then the forcing half: `iam.apply_table_grants` is actually RUN, with that declared
 * variant, inside a transaction that is rolled back — and the client must still hold no
 * write afterwards. A generator that has forgotten the register re-opens the table in
 * front of this guard instead of a month later in front of nobody.
 */
async function generatorArm(db: Client, t: Registered): Promise<Finding[]> {
  const rel = `${t.schema_name}.${t.table_name}`;
  const { rows } = await db.query<{ rls_variant: string | null }>(
    `select rls_variant from platform.entity_types
      where schema_name = $1 and table_name = $2 limit 1`,
    [t.schema_name, t.table_name],
  );
  if (rows.length === 0) {
    return [
      {
        arm: "generator",
        target: rel,
        detail: `no platform.entity_types row — the grant generator has no declaration to read for this table`,
      },
    ];
  }
  const live = rows[0]?.rls_variant ?? null;
  const out: Finding[] = [];
  if (live !== t.rls_variant) {
    out.push({
      arm: "generator",
      target: rel,
      detail:
        `entity_types.rls_variant is ${JSON.stringify(live)}, the register recorded ${JSON.stringify(t.rls_variant)} — ` +
        `the table's access-lane shape changed and nobody told the register`,
    });
  }

  await db.query(TX_BEGIN());
  try {
    await db.query(`select iam.apply_table_grants($1, $2, $3)`, [
      t.schema_name,
      t.table_name,
      live ?? t.rls_variant,
    ]);
    const { rows: reopened } = await db.query<{ role_name: string; priv: string }>(
      `select r as role_name, p as priv
         from unnest($1::text[]) r
         cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p
        where has_table_privilege(r, $2::regclass, p)`,
      [[...CLIENT_ROLES, "public"], rel],
    );
    for (const r of reopened) {
      out.push({
        arm: "generator",
        target: rel,
        detail:
          `iam.apply_table_grants(${t.schema_name}, ${t.table_name}, ${live}) GRANTS ${r.priv} back to ${r.role_name} — ` +
          `the generator does not honour platform.stamped_write_table, so the next regeneration re-opens this table (rolled back)`,
      });
    }
  } finally {
    await db.query(TX_ROLLBACK());
  }
  return out;
}

interface WriterRow {
  oid: string;
  sig: string;
  schema_name: string;
  function_name: string;
  identity_args: string;
  arg_types: string[];
  is_trigger: boolean;
  secdef: boolean;
  has_door: boolean;
  stamps: boolean;
  client_roles: string | null;
  src: string;
}

/**
 * Every function that writes the registered table, TRANSITIVELY.
 *
 * Level 0 is a real write statement against the table — `insert into <table>`,
 * `update <table>`, `delete from <table>` — not the table's name appearing anywhere in
 * a body, which matches every reader that selects from it. Level N is a function whose
 * body names a level-<N writer: a `perform write_context_value(...)` is a write to this
 * table exactly as much as the insert inside it, and a test that only reads statements
 * would miss every door (DD-197 found three of that shape).
 *
 * TRIGGER functions are collected, because the level-0 write may live in one, and then
 * dropped from the client surface: a trigger function has no callable form, so it is
 * machinery rather than a door.
 */
async function writers(db: Client, t: Registered): Promise<WriterRow[]> {
  const { rows } = await db.query<WriterRow>(
    `select p.oid::text as oid,
            n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
            n.nspname as schema_name, p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as identity_args,
            coalesce(
              (select array_agg(format_type(t2.oid, null) order by o.ord)
                 from unnest(p.proargtypes) with ordinality as o(t, ord)
                 join pg_type t2 on t2.oid = o.t),
              '{}'::text[]) as arg_types,
            (p.prorettype = 'trigger'::regtype) as is_trigger,
            p.prosecdef as secdef,
            exists (
              select 1 from platform.client_callable_door d
               where d.schema_name = n.nspname and d.function_name = p.proname
            ) as has_door,
            (p.prosrc ~* 'auth\\.uid\\(\\)') as stamps,
            (select string_agg(r, ', ') from unnest($1::text[]) r
              where has_function_privilege(r, p.oid, 'EXECUTE')) as client_roles,
            p.prosrc as src
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where p.prokind = 'f'
        and p.prolang in (select oid from pg_language where lanname in ('plpgsql','sql'))
        -- A pg_temp_N function belongs to ONE other backend's session and dies with it.
        -- has_function_privilege('authenticated', ...) says true (temp functions are
        -- EXECUTE-to-PUBLIC by birth), but no other session can even resolve the name, so
        -- it is a peer suite's scratch object and never a door anybody can reach.
        and n.nspname not like 'pg\\_temp%'
        and n.nspname not like 'pg\\_toast%'
      order by 2`,
    [[...CLIENT_ROLES]],
  );

  const qualified = `(?:${t.schema_name}\\.)?${t.table_name}`;
  const writeStatement = new RegExp(
    `(?:insert\\s+into|update|delete\\s+from)\\s+(?:only\\s+)?${qualified}\\b`,
    "i",
  );

  const isWriter = new Map<string, boolean>();
  for (const r of rows) isWriter.set(r.oid, writeStatement.test(r.src));

  // Transitive closure: a body that names a writer is a writer.
  for (let pass = 0; pass < 8; pass++) {
    let grew = false;
    const names = rows
      .filter((r) => isWriter.get(r.oid))
      .map((r) => r.function_name);
    if (names.length === 0) break;
    const calls = new RegExp(`\\b(?:${[...new Set(names)].join("|")})\\s*\\(`, "i");
    for (const r of rows) {
      if (isWriter.get(r.oid)) continue;
      if (calls.test(r.src)) {
        isWriter.set(r.oid, true);
        grew = true;
      }
    }
    if (!grew) break;
  }

  return rows.filter(
    (r) => isWriter.get(r.oid) && !r.is_trigger && (r.client_roles?.length ?? 0) > 0,
  );
}

interface Stamper {
  /** The trigger that derives the stamp from the caller, or null if there is none. */
  trigger: string | null;
  fn: string | null;
  /** Everything a leaning door needs to be true, each measured, never assumed. */
  rowLevel: boolean;
  beforeInsert: boolean;
  enabled: boolean;
  derivesFromCaller: boolean;
}

/**
 * arm `stamper` — is there a table-level mechanism a door may honestly lean on?
 *
 * Read by VALUE. The trigger's NAME is not evidence: a trigger called `_stamp_actor`
 * that COPIES an argument is the hole this guard exists for. What counts is a
 * row-level, BEFORE INSERT, ENABLED trigger whose function assigns `NEW.<stamp_column>`
 * AND reaches `auth.uid()` in the same body.
 */
async function stamperFor(db: Client, t: Registered): Promise<{ s: Stamper; findings: Finding[] }> {
  const rel = `${t.schema_name}.${t.table_name}`;
  const { rows } = await db.query<{
    tgname: string;
    fn: string;
    src: string;
    tgtype: number;
    tgenabled: string;
  }>(
    `select tg.tgname, pr.oid::regprocedure::text as fn, pr.prosrc as src,
            tg.tgtype::int as tgtype, tg.tgenabled::text as tgenabled
       from pg_trigger tg join pg_proc pr on pr.oid = tg.tgfoid
      where tg.tgrelid = $1::regclass and not tg.tgisinternal`,
    [rel],
  );
  const assigns = new RegExp(`\\bnew\\.${t.stamp_column}\\s*:=`, "i");
  const fromCaller = /auth\.uid\s*\(\s*\)/i;
  const empty: Stamper = {
    trigger: null,
    fn: null,
    rowLevel: false,
    beforeInsert: false,
    enabled: false,
    derivesFromCaller: false,
  };

  // Every candidate: a trigger whose body actually assigns this table's stamp column.
  const candidates = rows.filter((r) => assigns.test(r.src));
  if (candidates.length === 0) return { s: empty, findings: [] };

  let best: Stamper = empty;
  const findings: Finding[] = [];
  for (const r of candidates) {
    const s: Stamper = {
      trigger: r.tgname,
      fn: r.fn,
      rowLevel: (r.tgtype & 1) === 1,
      beforeInsert: (r.tgtype & 2) === 2 && (r.tgtype & 4) === 4,
      enabled: r.tgenabled === "O" || r.tgenabled === "A",
      derivesFromCaller: fromCaller.test(r.src),
    };
    const sound = s.rowLevel && s.beforeInsert && s.enabled && s.derivesFromCaller;
    if (sound) return { s, findings: [] };
    if (best.trigger === null) best = s;
  }
  // A candidate exists and none of them is sound — say exactly which promise it breaks,
  // because every door leaning on it is about to be reported too.
  const broken: string[] = [];
  if (!best.rowLevel) broken.push("it is a STATEMENT trigger, so it never sees a row to stamp");
  if (!best.beforeInsert) broken.push("it is not BEFORE INSERT, so the row is already written when it runs");
  if (!best.enabled) broken.push("it is DISABLED");
  if (!best.derivesFromCaller)
    broken.push(`its body never reaches auth.uid(), so ${t.stamp_column} is whatever it was handed`);
  findings.push({
    arm: "stamper",
    target: `${rel} → ${best.trigger} (${best.fn})`,
    detail:
      `the only trigger that assigns ${t.stamp_column} cannot be deriving it from the caller: ` +
      broken.join("; ") +
      `. Every door on this table that does not stamp for itself is now unstamped.`,
  });
  return { s: empty, findings };
}

/** Does this body put a value of its OWN into the stamp column? Then the trigger loses. */
function bodyAssignsStamp(t: Registered, src: string): boolean {
  const stamp = t.stamp_column;
  // `update … set created_by = …`, `new.created_by := …`, `v.created_by = …`
  if (new RegExp(`\\b${stamp}\\s*(?::=|=[^=])`, "i").test(src)) return true;
  // `insert into <rel> (…, created_by, …)` — the column list of a write to THIS table.
  const qualified = `(?:${t.schema_name}\\.)?${t.table_name}`;
  const lists = src.matchAll(
    new RegExp(`insert\\s+into\\s+(?:only\\s+)?${qualified}\\s*\\(([^)]*)\\)`, "gi"),
  );
  for (const m of lists) {
    if (new RegExp(`(?:^|[,\\s])${stamp}(?:$|[,\\s])`, "i").test(m[1] ?? "")) return true;
  }
  return false;
}

/** arms `door` and `stamp`. */
function doorAndStampArms(t: Registered, ws: WriterRow[], s: Stamper): Finding[] {
  const rel = `${t.schema_name}.${t.table_name}`;
  const leanable = s.rowLevel && s.beforeInsert && s.enabled && s.derivesFromCaller;
  const out: Finding[] = [];
  for (const w of ws) {
    if (!w.has_door) {
      out.push({
        arm: "door",
        target: w.sig,
        detail:
          `${w.client_roles} can EXECUTE it and it writes ${rel}, and no platform.client_callable_door row declares it` +
          (w.secdef ? "" : " — SECURITY INVOKER, so it is not a door at any width"),
      });
      continue;
    }
    if (w.stamps) continue; // (a) the door stamps for itself.
    if (leanable && !bodyAssignsStamp(t, w.src)) continue; // (b) the trigger stamps, unopposed.
    out.push({
      arm: "stamp",
      target: w.sig,
      detail: leanable
        ? `declared door writing ${rel} that ASSIGNS ${t.stamp_column} itself and never mentions auth.uid() — ` +
          `${s.trigger} only fills ${t.stamp_column} when it is left null, so the value this door supplies WINS ` +
          `and the row names whoever the caller named`
        : `declared door writing ${rel} whose body never mentions auth.uid(), and ${rel} has no trigger that ` +
          `derives ${t.stamp_column} from the caller — so nothing on this path stamps it`,
    });
  }
  return out;
}

/**
 * arm `probe` — the live refusal, as a real signed-in caller, inside a rolled-back
 * transaction. Everything undeclared must answer 42501: refused at the privilege check,
 * before any row logic runs.
 */
async function probeArm(db: Client, t: Registered, ws: WriterRow[]): Promise<Finding[]> {
  const rel = `${t.schema_name}.${t.table_name}`;
  const { rows: users } = await db.query<{ id: string }>(
    `select id::text from auth.users where email = $1 limit 1`,
    [PROBE_EMAIL],
  );
  const uid = users[0]?.id;
  if (!uid) {
    throw new Error(
      `the probe caller ${PROBE_EMAIL} does not exist on this database — unmeasured is a failure, never a pass`,
    );
  }
  const claims = JSON.stringify({
    sub: uid,
    role: "authenticated",
    email: PROBE_EMAIL,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
  });

  const attempts: { what: string; sql: string; args: unknown[] }[] = [
    {
      // Built from the table's OWN declared stamp column. The first version of this probe
      // carried `context_item_values`' column list on every table, so five of the six
      // answered `42703 column does not exist` — a PARSE error, which fires BEFORE the
      // privilege check, and the guard reported "the caller got past the door" about a
      // caller who had never been asked. A statement that cannot parse measures nothing.
      what: `a direct INSERT into ${rel}`,
      sql: `insert into ${rel} (${t.stamp_column}) values ($1::uuid)`,
      args: [uid],
    },
    ...ws
      .filter((w) => !w.has_door)
      .map((w) => ({
        // Typed NULLs built from the function's OWN identity arguments, so the call
        // RESOLVES to exactly this function and dies on the privilege check rather
        // than on `42883 function does not exist`, which would read like a refusal.
        what: `a direct call of the undeclared writer ${w.sig}`,
        sql: `select ${w.schema_name}.${w.function_name}(${w.arg_types
          .map((ty) => `null::${ty}`)
          .join(", ")})`,
        args: [] as unknown[],
      })),
  ];

  const out: Finding[] = [];
  for (const a of attempts) {
    await db.query(TX_BEGIN());
    try {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      await db.query("set local role authenticated");
      await db.query(a.sql, a.args);
      out.push({
        arm: "probe",
        target: a.what,
        detail: `SUCCEEDED as ${PROBE_EMAIL} — a signed-in caller writes ${rel} without a door (rolled back)`,
      });
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      const message = (e as { message?: string }).message ?? String(e);
      if (code !== "42501") {
        out.push({
          arm: "probe",
          target: a.what,
          detail:
            `refused with ${code || "no code"} (${message.slice(0, 120)}) — NOT the privilege check. ` +
            `The caller got past the door and was stopped by an accident of the data; the day that accident changes, the write lands`,
        });
      }
    } finally {
      await db.query(TX_ROLLBACK());
      await db.query("reset role");
    }
  }
  return out;
}

async function census(db: Client): Promise<{ findings: Finding[]; tables: number; writers: number }> {
  const tables = await registeredTables(db);
  if (tables.length === 0) {
    throw new Error(
      "platform.stamped_write_table is EMPTY — this guard would pass by measuring nothing. " +
        "Seed it (migrations/dd248_stamped_write_register.sql) or delete the guard.",
    );
  }
  const findings: Finding[] = [];
  let writerCount = 0;
  for (const t of tables) {
    const rel = `${t.schema_name}.${t.table_name}`;
    const { rows: exists } = await db.query<{ ok: boolean }>(
      `select to_regclass($1) is not null as ok`,
      [rel],
    );
    if (!exists[0]?.ok) {
      throw new Error(`register names ${rel}, which does not exist on this database`);
    }
    const ws = await writers(db, t);
    writerCount += ws.length;
    const { s, findings: stamperFindings } = await stamperFor(db, t);
    findings.push(...(await grantArm(db, t)));
    findings.push(...(await generatorArm(db, t)));
    findings.push(...stamperFindings);
    findings.push(...doorAndStampArms(t, ws, s));
    findings.push(...(await probeArm(db, t, ws)));
  }
  return { findings, tables: tables.length, writers: writerCount };
}

function report(findings: Finding[], tables: number, writers: number): void {
  console.log(
    `${INFO} ${tables} registered table(s); ${writers} client-executable writer function(s) found.`,
  );
  if (findings.length === 0) {
    console.log(
      `${OK} every registered table is reachable only through its declared doors, and every door stamps from the caller.`,
    );
    return;
  }
  for (const f of findings) {
    console.log(`${FAIL} [${f.arm}] ${C.b}${f.target}${C.x} — ${f.detail}`);
  }
  console.log(
    `\n${FAIL} ${findings.length} finding(s). A table whose rows name their author needs ONE way in; ` +
      `each line above is another, and on it the name is whatever the writer chose to say.`,
  );
}

async function main(): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${FAIL} the stamped-write surface could not be MEASURED — unmeasured is a failure, never a pass.\n` +
        `  wanted: ${DB_VARS.join(", ")}\n  looked in: ${env.looked.join(", ") || "(no env files found)"}`,
    );
    return 1;
  }
  console.log(`${INFO} ${env.host}/${env.database} ${C.d}(credentials from ${env.from})${C.x}`);
  const db = await connectDirect(env, "check-stamped-write-doors");
  try {
    if (!SELF_TEST) {
      const { findings, tables, writers } = await census(db);
      report(findings, tables, writers);
      return findings.length === 0 ? 0 : 1;
    }

    // ── THE SELF-TEST: RED then GREEN, against this database, writing nothing. ──
    // The violation is PLANTED inside a transaction and rolled back, so the RED is
    // this guard meeting the real defect shape on the real catalogue, not a fixture.
    const green = await census(db);
    if (green.findings.length !== 0) {
      console.log(`${FAIL} self-test cannot run: the live surface is already RED —`);
      report(green.findings, green.tables, green.writers);
      return 1;
    }
    console.log(`${OK} baseline GREEN (${green.tables} table(s)).`);

    await db.query("begin");
    OUTER_TX = true;
    let redCount = 0;
    try {
      // Both halves of the real defect, planted together: the table privilege that
      // needs no function, and the undeclared invoker writer that takes the author as
      // an argument. These are the exact two grants DD-248 removed.
      await db.query(`grant insert on context.context_item_values to authenticated`);
      await db.query(
        `grant execute on function context.write_context_value(
           uuid, uuid, text, numeric, boolean, jsonb, date, text,
           timestamp with time zone, time without time zone, text, text, uuid
         ) to authenticated`,
      );
      const red = await census(db);
      redCount = red.findings.length;
      const arms = new Set(red.findings.map((f) => f.arm));
      const wanted = ["grant", "door", "probe"];
      const missing = wanted.filter((a) => !arms.has(a));
      if (missing.length > 0) {
        console.log(
          `${FAIL} self-test: the planted violations produced arms [${[...arms].join(", ") || "none"}] — ` +
            `arm(s) [${missing.join(", ")}] never fired. The guard does not see the defect it exists for.`,
        );
        report(red.findings, red.tables, red.writers);
        return 1;
      }
      console.log(
        `${OK} RED with the two grants planted: ${redCount} finding(s) across [${[...arms].join(", ")}].`,
      );

      // The `generator` arm cannot be provoked by planting a finding — it asks what the
      // generator WOULD do, and the generator is right. So prove instead that its answer
      // is CAUSED by the register: take the row away and the same call grants the write
      // straight back. If this ever stops happening, the register has stopped being what
      // holds the table closed and the arm is measuring nothing.
      await db.query(
        `delete from platform.stamped_write_table
          where schema_name = 'context' and table_name = 'context_item_values'`,
      );
      await db.query(
        `select iam.apply_table_grants('context', 'context_item_values', 'component')`,
      );
      const { rows: reopened } = await db.query<{ held: boolean }>(
        `select has_table_privilege('authenticated', 'context.context_item_values'::regclass, 'INSERT') as held`,
      );
      if (!reopened[0]?.held) {
        console.log(
          `${FAIL} self-test: with the register row REMOVED, iam.apply_table_grants still withheld INSERT. ` +
            `Something other than platform.stamped_write_table is holding this table closed, and the ` +
            `'generator' arm is measuring a coincidence.`,
        );
        return 1;
      }
      console.log(
        `${OK} the generator's read-only grant is CAUSED by the register: removing the row grants INSERT back.`,
      );

      // ── The `stamper` / `stamp` arms. ──
      // 84 of this guard's 88 findings on 2026-09-21 were doors on `custom.record` reported
      // as unstamped because their bodies never say `auth.uid()`. They never do, and they
      // never should: `platform._stamp_actor` stamps the row at the TABLE, so every door on
      // it inherits the caller. The exemption is only honest while that trigger is really
      // there and really derives from the caller — so prove the guard's silence is CAUSED by
      // the trigger: turn it off and every leaning door must be reported in the same breath.
      // The window is one ALTER plus two in-memory arms, bounded by lock_timeout so this
      // never becomes a write freeze on the live record store.
      const rec: Registered = {
        schema_name: "custom",
        table_name: "record",
        stamp_column: "created_by",
        rls_variant: "entity",
        declared_by: "self-test",
      };
      const recWriters = await writers(db, rec);
      const before = await stamperFor(db, rec);
      if (!before.s.derivesFromCaller || !before.s.enabled) {
        console.log(
          `${FAIL} self-test: custom.record carries no live stamping trigger to switch off, so the ` +
            `'stamper' arm has nothing to prove against.`,
        );
        return 1;
      }
      const leaning = recWriters.filter(
        (w) => w.has_door && !w.stamps && !bodyAssignsStamp(rec, w.src),
      ).length;
      await db.query(`set local lock_timeout = '2s'`);
      await db.query(`alter table custom.record disable trigger ${before.s.trigger}`);
      const after = await stamperFor(db, rec);
      const nowRed = doorAndStampArms(rec, recWriters, after.s).filter((f) => f.arm === "stamp");
      await db.query(`alter table custom.record enable trigger ${before.s.trigger}`);
      await db.query(`set local lock_timeout = default`);
      if (after.findings.length === 0 || nowRed.length < leaning) {
        console.log(
          `${FAIL} self-test: with ${before.s.trigger} DISABLED the guard reported ` +
            `${after.findings.length} stamper finding(s) and ${nowRed.length} of ${leaning} leaning door(s). ` +
            `The exemption is not caused by the trigger, so the 'stamp' arm is measuring nothing.`,
        );
        return 1;
      }
      console.log(
        `${OK} the stamp exemption is CAUSED by ${before.s.trigger}: disabling it turns ${leaning} silent ` +
          `door(s) into ${nowRed.length} 'stamp' finding(s) plus the 'stamper' finding itself.`,
      );
    } finally {
      OUTER_TX = false;
      await db.query("rollback");
    }

    const again = await census(db);
    if (again.findings.length !== 0) {
      console.log(`${FAIL} self-test: the rollback did not restore the surface —`);
      report(again.findings, again.tables, again.writers);
      return 1;
    }
    console.log(`${OK} GREEN again after rollback. RED ${redCount} → GREEN 0.`);
    return 0;
  } finally {
    await db.end();
  }
}

main().then(
  (code) => exitAfterDrain(code),
  (e) => {
    console.error(`${FAIL} ${(e as Error).message}`);
    exitAfterDrain(1);
  },
);
