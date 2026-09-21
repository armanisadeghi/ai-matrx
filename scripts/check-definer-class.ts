#!/usr/bin/env npx tsx
/**
 * THE DEFINER CLASS GUARD — a function running with borrowed rights may not decide what a data
 * class means (VISIBILITY-BY-CLASS §3.4 chokepoint 3, DD-137c).
 *
 * WHY THIS EXISTS
 * ---------------
 * A `SECURITY DEFINER` function's reads and writes are not filtered by RLS at all. So every one of
 * them that a browser can call is a place where the data class either holds or quietly does not.
 * Measured live on 2026-09-12, before this guard existed: **1,253** such functions are executable by
 * `authenticated` or `anon`; **374** of them name a table classed `private` or `confidential`; and
 * exactly **one** consulted `iam.class_lanes` about it.
 *
 * §3.4's repair is one gate, not 374 edits — `iam.class_allows` / `iam.assert_class_allows` — and
 * this guard is what makes the remaining distance visible instead of remembered.
 *
 * WHAT IT FAILS ON, AND WHAT IT ONLY REPORTS
 * ------------------------------------------
 *   FAIL — a client-callable definer function that REWRITES an identity column (`created_by`,
 *          `user_id`, `owner_id`, `organization_id`, `visibility`) and answers to nobody: not the
 *          class gate (`iam.class_allows`), not the transfer door (`iam.assert_may_transfer`), not
 *          the per-row kernel (`iam.has_access`), and not a written exemption. This is F-1 exactly:
 *          "a class that governs one RLS arm is defeated by any call that changes who the owner
 *          is." It is a small, nameable set and every member of it is printed by name.
 *   FAIL — a RISE in the number of definer functions that READ a classed table and explain
 *          themselves to nobody, over the ceiling recorded in `scripts/definer-class-baseline.json`.
 *          There are ~200; failing on all of them today would make this guard a thing people
 *          disable, and dropping `iam.assert_class_read` into each one blind would break live flows
 *          (on a `private` token that call raises ALWAYS — by design). So the number is a RATCHET:
 *          it may only fall, and it falls in the commit that closes the functions.
 *
 * WHAT DD-162 CHANGED, AND WHY THE NUMBERS MOVED
 * ----------------------------------------------
 * The four functions this guard used to fail on were tried as a real plain member first, in a
 * transaction that was rolled back. All three that a client can call already refused with 42501
 * (`Forbidden: Super Admin required`, `not authorized`, `membership manager role required`), and
 * the fourth — `platform._mirror_m2m_to_assoc` — `returns trigger`, which PostgREST cannot call at
 * all. There was no open hole. What there was: `asks_the_gate` matched two literal strings, so three
 * real answers read as silence, and deleting one of them would not have moved the number by one.
 * v2 of the census asks the real question (own-row predicate, administrator check, organization
 * predicate, the gate, the kernel), stops counting trigger functions as doors, and matches table
 * names on word boundaries — v1's `position()` matched `chat.conversation` inside
 * `chat.conversation_message`.
 *
 * 🚨 THE CENSUS IS A FLOOR, NOT A CEILING, AND THIS PRINTS THAT EVERY RUN. `iam.definer_class_census`
 * measures function BODIES as text. A function that assembles `set organization_id = …` inside
 * `format()` reads as innocent. The absence of a row here is not a proof of safety.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS — without credentials it exits 1 under --strict and says so
 * loudly otherwise; it never prints a green line it did not earn.
 *
 *   pnpm check:definer-class
 *   pnpm check:definer-class --strict     # exit 1 on any finding or UNMEASURED
 *   pnpm check:definer-class --self-test  # RED then GREEN against the real database
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import type { Client } from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Kept as an alias: the verdict is the exit code in BOTH modes now. */
const STRICT = process.argv.includes("--strict");
void STRICT;
const SELF_TEST = process.argv.includes("--self-test");

/**
 * THE RATCHET. A ceiling that may only fall. It lives in the repo and not in the database on
 * purpose: a number in a migration can be raised by the next migration and nobody reviews it, while
 * a number in a tracked file is raised only by a diff somebody has to read.
 */
interface Baseline { unexplained_readers: number; unexplained_readers_reachable_by_anon: number }
function loadBaseline(): Baseline | null {
  const p = resolve(ROOT, "scripts/definer-class-baseline.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")) as Baseline; } catch { return null; }
}

const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

/**
 * 🚨 THE DIRECT CONNECTION, NOT THE POSTGREST ADMIN DOOR (GUARD-STAMPS, 2026-09-21).
 *
 * This guard used to read through `public.execute_admin_query`, which dies at a hard ~8.2 s no
 * SQL can lift (db-rules / DD-151). The moment the census started consulting
 * `platform.definer_body_decides_access` — a call-graph walk, ~11 s across the surface — every
 * run came back `57014 canceling statement due to statement timeout` and the guard reported
 * itself UNMEASURED. A guard that cannot finish measuring is not a strict guard, it is an
 * absent one. `scripts/lib/direct-db.ts` is this repo's one sanctioned direct transport, it
 * announces where its credentials came from, and `statement_timeout` is real and settable.
 */
async function door(db: Client, sql: string): Promise<Array<Record<string, unknown>>> {
  const res = await db.query(sql);
  return res.rows as Array<Record<string, unknown>>;
}

type Row = {
  schema_name: string; function_name: string; identity_args: string; reachable_by: string;
  is_trigger: boolean; writes_identity: boolean; reads_classed: boolean; asks_the_gate: boolean;
  narrows_to_caller: boolean; asks_an_admin: boolean; org_scoped: boolean;
  classed_tokens: string; declared: boolean; exempt_reason: string | null;
  /** An explicit anon rule in platform.client_callable_door (purpose >= 40 chars, CHECK-enforced). */
  anon_rule_declared: boolean;
  /** platform.definer_body_decides_access — the transitive call-graph oracle DD-223 already trusts. */
  asks_the_ladder: boolean;
};

/**
 * THE PURE RULE, exported so the self-test can hand it rows it wrote itself.
 *
 * A trigger function is not a door (PostgREST cannot call `returns trigger`, and firing a trigger
 * never consults EXECUTE), and a written exemption is an answer. Everything else that moves an
 * identity column without asking anybody is the finding.
 */
export function isUnguardedRewrite(
  r: Pick<Row, "writes_identity" | "asks_the_gate" | "is_trigger" | "exempt_reason" | "asks_the_ladder">,
): boolean {
  return r.writes_identity === true && r.asks_the_gate !== true && r.asks_the_ladder !== true
    && r.is_trigger !== true && !r.exempt_reason;
}

/** A reader nobody can explain: no gate, no own-row predicate, no admin check, no org predicate. */
export function isUnexplainedReader(
  r: Pick<Row, "reads_classed" | "asks_the_gate" | "is_trigger" | "narrows_to_caller"
              | "asks_an_admin" | "org_scoped" | "exempt_reason"
              | "anon_rule_declared" | "asks_the_ladder">,
): boolean {
  return r.reads_classed === true && r.is_trigger !== true && r.asks_the_gate !== true
    && r.narrows_to_caller !== true && r.asks_an_admin !== true && r.org_scoped !== true
    && r.anon_rule_declared !== true && r.asks_the_ladder !== true
    && !r.exempt_reason;
}

const CENSUS_SQL = `
with c as (select * from iam.definer_class_census),
 u as (select * from c
        where not is_trigger and exempt_reason is null and not asks_the_gate
          and reads_classed and not narrows_to_caller and not asks_an_admin and not org_scoped
          and not anon_rule_declared and not asks_the_ladder)
select json_build_object(
  'total',        (select count(*) from c),
  'doors',        (select count(*) from c where not is_trigger),
  'triggers',     (select count(*) from c where is_trigger),
  'writes',       (select count(*) from c where writes_identity and not is_trigger),
  'reads',        (select count(*) from c where reads_classed and not is_trigger),
  'exempted',     (select count(*) from c where exempt_reason is not null),
  'reads_open',   (select count(*) from u),
  'reads_open_anon', (select count(*) from u where reachable_by like '%anon%'),
  'offenders',    (select coalesce(json_agg(json_build_object(
                      'schema_name', x.schema_name, 'function_name', x.function_name,
                      'identity_args', x.identity_args, 'reachable_by', x.reachable_by,
                      'writes_identity', x.writes_identity, 'reads_classed', x.reads_classed,
                      'asks_the_gate', x.asks_the_gate, 'is_trigger', x.is_trigger,
                      'exempt_reason', x.exempt_reason,
                      'classed_tokens', x.classed_tokens,
                      'declared', x.declared) order by x.schema_name, x.function_name), '[]'::json)
                    from c x
                   where x.writes_identity and not x.asks_the_gate and not x.asks_the_ladder
                     and not x.is_trigger and x.exempt_reason is null),
  'anon_readers', (select coalesce(json_agg(json_build_object(
                      'schema_name', u.schema_name, 'function_name', u.function_name,
                      'classed_tokens', u.classed_tokens, 'declared', u.declared)
                      order by u.schema_name, u.function_name), '[]'::json)
                    from u where u.reachable_by like '%anon%'),
  'by_schema',    (select coalesce(json_agg(j order by (j->>'n')::int desc), '[]'::json)
                     from (select json_build_object('schema_name', schema_name, 'n', count(*)) j
                             from u group by schema_name) s)
) as j`;

async function selfTest(db: Client): Promise<number> {
  console.log(`${C.b}SELF-TEST${C.x} ${C.d}(the rule, and the view that feeds it)${C.x}`);
  let bad = 0;
  type W = Pick<Row, "writes_identity" | "asks_the_gate" | "is_trigger" | "exempt_reason">;
  const base: W = { writes_identity: true, asks_the_gate: false, is_trigger: false,
                    exempt_reason: null, asks_the_ladder: false };
  const cases: Array<[string, W, boolean]> = [
    ["RED   — rewrites an identity column and asks nobody", base, true],
    ["GREEN — rewrites one but asks the gate or the door", { ...base, asks_the_gate: true }, false],
    ["GREEN — asks nobody but rewrites nothing", { ...base, writes_identity: false }, false],
    ["GREEN — a trigger function is not a client door", { ...base, is_trigger: true }, false],
    ["GREEN — a written exemption is an answer", { ...base, exempt_reason: "a real sentence" }, false],
    ["GREEN — it decides through the ladder, via a helper the census cannot see inline",
      { ...base, asks_the_ladder: true }, false],
  ];
  for (const [label, row, expect] of cases) {
    if (isUnguardedRewrite(row) === expect) console.log(`  ${C.g}✓${C.x} ${label}`);
    else { console.log(`  ${C.r}✗${C.x} ${label}`); bad++; }
  }
  type R = Pick<Row, "reads_classed" | "asks_the_gate" | "is_trigger" | "narrows_to_caller"
                    | "asks_an_admin" | "org_scoped" | "exempt_reason">;
  const rbase: R = { reads_classed: true, asks_the_gate: false, is_trigger: false,
                     narrows_to_caller: false, asks_an_admin: false, org_scoped: false,
                     exempt_reason: null, anon_rule_declared: false, asks_the_ladder: false };
  const rcases: Array<[string, R, boolean]> = [
    ["RED   — reads a classed table and explains itself to nobody", rbase, true],
    ["GREEN — it narrows to the caller's own rows", { ...rbase, narrows_to_caller: true }, false],
    ["GREEN — it asks whether the caller is an administrator", { ...rbase, asks_an_admin: true }, false],
    ["GREEN — it narrows to the caller's organizations", { ...rbase, org_scoped: true }, false],
    ["GREEN — it asks the class gate", { ...rbase, asks_the_gate: true }, false],
    ["GREEN — it decides through the ladder (platform.definer_body_decides_access)",
      { ...rbase, asks_the_ladder: true }, false],
    ["GREEN — it is an anon door with an explicit anon rule in the door registry",
      { ...rbase, anon_rule_declared: true }, false],
  ];
  for (const [label, row, expect] of rcases) {
    if (isUnexplainedReader(row) === expect) console.log(`  ${C.g}✓${C.x} ${label}`);
    else { console.log(`  ${C.r}✗${C.x} ${label}`); bad++; }
  }

  // ── And the same two states built for real, so the VIEW that feeds the rule is proven too. ──
  //
  // 🚨 THE PLANT MUST NEVER COMMIT (GUARD-STAMPS, 2026-09-21). The probe IS the defect this
  // guard exists for — a client-callable SECURITY DEFINER function that rewrites an identity
  // column and decides nothing — and the live `provision_shape_guard` event trigger now refuses
  // exactly that shape AT COMMIT: `SECURITY DEFINER function …zz_probe() reached COMMIT with no
  // access decision declared`. The previous version created the scratch schema statement by
  // statement over the autocommitting PostgREST door, so every CREATE was its own transaction and
  // the guard killed the run inside the teardown it could no longer reach — leaving a
  // `zz_definer_class_selftest_*` schema behind each time.
  //
  // So the whole plant now lives in ONE transaction that is rolled back. The DDL guard and the
  // deferred `door_body_must_decide` constraint both fire at COMMIT, which never arrives; the
  // census sees the objects because it is the same session; and there is nothing to tear down,
  // which is the only teardown that cannot itself fail. Peer lanes' guards are unaffected: no
  // object of theirs is touched and no lock is held beyond this transaction.
  const schema = `zz_definer_class_selftest_${Date.now().toString(36)}`;
  await db.query("begin");
  try {
    await db.query(`create schema ${schema}`);
    await db.query(`create table ${schema}.t (id uuid primary key default gen_random_uuid(), organization_id uuid)`);
    await db.query(`create function ${schema}.zz_probe() returns void language plpgsql security definer as $f$
                     begin update ${schema}.t set organization_id = gen_random_uuid(); end $f$`);
    await db.query(`grant usage on schema ${schema} to authenticated`);
    // 🚨 THE DECLARATION FIRST, OR THERE IS NOTHING TO MEASURE. `enforce_definer_client_grants`
    // (db-rules §6d-4) revokes a client EXECUTE on an UNDECLARED SECURITY DEFINER function at
    // `ddl_command_end`, silently. The first version of this self-test granted and then found the
    // census empty — not because the census was blind, but because the door had already been shut
    // behind it. Declaring the probe is what makes the RED half a measurement of THIS guard rather
    // than an accidental re-measurement of that one.
    await db.query(`insert into platform.client_callable_door(schema_name, function_name, identity_args, declared_by, reason)
                     values ('${schema}', 'zz_probe', '', 'check:definer-class --self-test',
                             'Throwaway probe built and rolled back by the self-test in the same transaction.')`);
    await db.query(`grant execute on function ${schema}.zz_probe() to authenticated`);
    const red = await door(db, `select count(*)::int n from iam.definer_class_census
                                  where schema_name = '${schema}' and writes_identity
                                    and not asks_the_gate and not asks_the_ladder`);
    if (Number((red[0] as { n?: number })?.n ?? 0) !== 1) {
      console.log(`  ${C.r}✗${C.x} RED  — the view did not see the unguarded rewrite it was just handed`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} RED  — the view sees a client-callable definer that rewrites an identity column`);
    }
    await db.query(`create or replace function ${schema}.zz_probe() returns void language plpgsql security definer as $f$
                     begin perform iam.assert_class_allows('note','rewrite_owner',null);
                           update ${schema}.t set organization_id = gen_random_uuid(); end $f$`);
    const green = await door(db, `select count(*)::int n from iam.definer_class_census
                                    where schema_name = '${schema}' and writes_identity
                                      and not asks_the_gate and not asks_the_ladder`);
    if (Number((green[0] as { n?: number })?.n ?? 0) !== 0) {
      console.log(`  ${C.r}✗${C.x} GREEN — the view still flags it after it started asking the gate`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} GREEN — it stops being flagged the moment it asks the gate`);
    }
  } finally {
    await db.query("rollback");
  }
  // The rollback is the teardown, and this proves it happened (DC-027 #8: never silent).
  const left = await door(db, `select count(*)::int n from pg_namespace where nspname = '${schema}'`);
  if (Number((left[0] as { n?: number })?.n ?? 0) !== 0) {
    console.log(`  ${C.r}✗${C.x} the rolled-back plant left schema ${schema} behind — drop it by hand`); bad++;
  } else {
    console.log(`  ${C.g}✓${C.x} nothing left behind: the plant existed only inside the rolled-back transaction`);
  }

  console.log(bad === 0 ? `${C.g}✓${C.x} ${C.b}the guard fails when it should and passes when it should${C.x}`
                        : `${C.r}✗${C.x} ${C.b}the guard is not trustworthy${C.x}`);
  return bad === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  console.log(`${C.b}THE DEFINER CLASS GUARD${C.x} ${C.d}(DD-137c / VISIBILITY-BY-CLASS §3.4 — borrowed rights do not decide what a class means)${C.x}`);
  const env = loadDbEnv();
  if ("missing" in env) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — no direct database credentials (${env.missing.join(", ")}). This is a FAILURE, not a pass.`);
    return 1;
  }
  console.log(`  ${C.d}${env.host}/${env.database} (credentials from ${env.from})${C.x}`);
  const db = await connectDirect(env, "check-definer-class");
  try {
  // The call-graph walk needs more than the server default; 11 s measured, 120 s is headroom.
  await db.query("set statement_timeout = '120s'");
  if (SELF_TEST) return await selfTest(db);

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await door(db, CENSUS_SQL);
  } catch (e) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the census query failed: ${String(e)}`);
    return 1;
  }
  const j = (rows[0] as { j?: Record<string, unknown> })?.j;
  if (!j) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the census returned nothing`);
    return 1;
  }

  const total = Number(j.total ?? 0);
  const doors = Number(j.doors ?? 0);
  const triggers = Number(j.triggers ?? 0);
  const writes = Number(j.writes ?? 0);
  const reads = Number(j.reads ?? 0);
  const exempted = Number(j.exempted ?? 0);
  const readsOpen = Number(j.reads_open ?? 0);
  const readsOpenAnon = Number(j.reads_open_anon ?? 0);
  const offenders = ((j.offenders as Row[]) ?? []).filter(isUnguardedRewrite);
  const anonReaders = (j.anon_readers as Array<{ schema_name: string; function_name: string; classed_tokens: string; declared: boolean }>) ?? [];
  const bySchema = (j.by_schema as Array<{ schema_name: string; n: number }>) ?? [];

  console.log(`  ${C.d}${total} SECURITY DEFINER functions a client role holds EXECUTE on — ${doors} real client doors and ${triggers} trigger functions (a trigger is not a door: PostgREST cannot call \`returns trigger\`)${C.x}`);
  console.log(`  ${C.d}${writes} rewrite an identity column; ${reads} read a private or confidential table; ${exempted} carry a written exemption${C.x}`);

  let findings = 0;
  if (offenders.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ${offenders.length} rewrite an identity column ${C.b}and answer to nobody${C.x} — F-1's hole: a class that governs one RLS arm is defeated by any call that changes who the owner is`);
    for (const o of offenders) {
      console.log(`     ${C.d}${o.schema_name}.${o.function_name}(${o.identity_args})  reachable by ${o.reachable_by}${o.declared ? "" : "  [UNDECLARED in platform.client_callable_door]"}${C.x}`);
    }
    console.log(`     ${C.d}The repair is one line inside each: \`perform iam.assert_may_transfer('<token>', <row owner>, <new owner>, <org>)\` — it resolves every arm itself from auth.uid() and raises 42501 with a sentence. If the function genuinely may not be gated, say why in iam.definer_class_exemption; the reason column refuses anything under 60 characters.${C.x}`);
  } else {
    console.log(`  ${C.g}✓${C.x} no client-callable definer function moves a row to a different owner on its own say-so`);
  }

  // ── THE RATCHET ───────────────────────────────────────────────────────────────────────────────
  const baseline = loadBaseline();
  if (!baseline) {
    findings++;
    console.log(`  ${C.r}✗${C.x} UNMEASURED — scripts/definer-class-baseline.json is missing or unreadable, so the reader ratchet has no ceiling to compare against. That is a failure, not a pass.`);
  } else {
    const rose = readsOpen > baseline.unexplained_readers;
    const roseAnon = readsOpenAnon > baseline.unexplained_readers_reachable_by_anon;
    if (rose || roseAnon) {
      findings++;
      console.log(`  ${C.r}✗${C.x} the number of definer functions that read a classed table and ${C.b}explain themselves to nobody${C.x} has RISEN:`);
      if (rose) console.log(`     ${C.r}${baseline.unexplained_readers} → ${readsOpen}${C.x} overall`);
      if (roseAnon) console.log(`     ${C.r}${baseline.unexplained_readers_reachable_by_anon} → ${readsOpenAnon}${C.x} of them callable by a signed-out browser`);
      console.log(`     ${C.d}Close the new ones, or — if a new one genuinely answers in a way the census cannot see — write the answer into iam.definer_class_exemption. Raising the number in the baseline file is not one of the options.${C.x}`);
    } else {
      const moved = baseline.unexplained_readers - readsOpen;
      console.log(`  ${C.g}✓${C.x} the unexplained-reader ratchet holds: ${readsOpen} (ceiling ${baseline.unexplained_readers})${moved > 0 ? `, ${moved} closed since it was set — lower the ceiling in scripts/definer-class-baseline.json in the same commit` : ""}`);
    }
  }

  console.log(`  ${C.y}!${C.x} ${readsOpen} definer functions read a \`private\` or \`confidential\` table and explain themselves to nobody — ${readsOpenAnon} of them are callable by a signed-out browser. ${C.d}This is §3.4's remaining distance and it is a campaign, not a line: iam.assert_class_read RAISES on a private token by design, so dropping it in blind breaks a live flow one function at a time.${C.x}`);
  if (bySchema.length > 0) {
    console.log(`     ${C.d}by schema: ${bySchema.map((x) => `${x.schema_name} ${x.n}`).join(", ")}${C.x}`);
  }
  if (anonReaders.length > 0) {
    console.log(`     ${C.d}callable by a signed-out browser (the sharpest end, in order):${C.x}`);
    for (const r of anonReaders) {
      console.log(`       ${C.d}${r.schema_name}.${r.function_name}  [${r.classed_tokens}]${r.declared ? "" : "  [UNDECLARED]"}${C.x}`);
    }
  }
  console.log(`  ${C.d}The census measures function BODIES as text: dynamic SQL is invisible to it, so this is a FLOOR on the problem and never a ceiling. The absence of a row is not a proof of safety.${C.x}`);

  if (findings === 0) {
    console.log(`${C.g}✓${C.x} ${C.b}no definer function decides an identity rewrite on its own, and the reader distance is not growing${C.x}`);
    return 0;
  }
  // 🚨 THE VERDICT IS THE EXIT CODE (GUARD-STAMPS, 2026-09-21). This used to `return STRICT ? 1 : 0`,
  // so the default invocation printed `✗ ... has RISEN: 183 -> 246` and then exited 0. Every CI
  // job, every release gate and every operator reading `$?` was told the surface was fine while
  // the guard's own screen said it was not. A guard whose printed finding does not reach its exit
  // code is a guard nobody is obeying. `--strict` is kept as an alias so no caller breaks, and the
  // only thing it still changes is UNMEASURED, which is a failure in both modes anyway.
  return 1;
  } finally {
    await db.end();
  }
}

// `process.exit()` discards anything still in the stdout pipe; a guard that cannot be trusted to
// print what it found is worse than no guard. The ONE remedy is `scripts/lib/exit-after-drain.ts`
// (DD-232) — never a local copy, never a bare `process.exit(`.
main().then(exitAfterDrain).catch((e) => {
  console.error(`${C.r}✗${C.x} check:definer-class crashed: ${String(e)}`);
  exitAfterDrain(1);
});
