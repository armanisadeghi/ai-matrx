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
 *          `user_id`, `owner_id`, `organization_id`, `visibility`) without asking the gate or the
 *          kernel. This is F-1 exactly: "a class that governs one RLS arm is defeated by any call
 *          that changes who the owner is." It is a small, nameable set, and every member of it is
 *          printed by name.
 *   REPORT — a client-callable definer function that READS a classed table without asking. There
 *          are hundreds; failing on all of them today would make this guard a thing people disable,
 *          and most are narrow readers that are fine. The number is printed every run so it cannot
 *          drift upward unnoticed, and it is the campaign's remaining distance.
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!key && m[1] === "SUPABASE_SECRET_KEY") key = v;
      }
      if (url && key) break;
    }
  }
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function door(env: { url: string; key: string }, sql: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${env.url}/rest/v1/rpc/execute_admin_query`, {
    method: "POST",
    headers: {
      apikey: env.key, Authorization: `Bearer ${env.key}`,
      "Content-Type": "application/json", "Content-Profile": "public", "Accept-Profile": "public",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
  const payload = JSON.parse(text) as unknown;
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === "object" && Array.isArray((payload as { result?: unknown[] }).result)) {
    return (payload as { result: Array<Record<string, unknown>> }).result;
  }
  return [];
}

type Row = {
  schema_name: string; function_name: string; identity_args: string; reachable_by: string;
  writes_identity: boolean; reads_classed: boolean; asks_the_gate: boolean;
  classed_tokens: string; declared: boolean;
};

/** THE PURE RULE, exported so the self-test can hand it rows it wrote itself. */
export function isUnguardedRewrite(r: Pick<Row, "writes_identity" | "asks_the_gate">): boolean {
  return r.writes_identity === true && r.asks_the_gate !== true;
}

const CENSUS_SQL = `
select json_build_object(
  'total',        (select count(*) from iam.definer_class_census),
  'writes',       (select count(*) from iam.definer_class_census where writes_identity),
  'reads',        (select count(*) from iam.definer_class_census where reads_classed),
  'reads_open',   (select count(*) from iam.definer_class_census where reads_classed and not asks_the_gate),
  'offenders',    (select coalesce(json_agg(json_build_object(
                      'schema_name', c.schema_name, 'function_name', c.function_name,
                      'identity_args', c.identity_args, 'reachable_by', c.reachable_by,
                      'writes_identity', c.writes_identity, 'reads_classed', c.reads_classed,
                      'asks_the_gate', c.asks_the_gate, 'classed_tokens', c.classed_tokens,
                      'declared', c.declared) order by c.schema_name, c.function_name), '[]'::json)
                    from iam.definer_class_census c
                   where c.writes_identity and not c.asks_the_gate)
) as j`;

async function selfTest(env: { url: string; key: string }): Promise<number> {
  console.log(`${C.b}SELF-TEST${C.x} ${C.d}(the rule, and the view that feeds it)${C.x}`);
  let bad = 0;
  const cases: Array<[string, Pick<Row, "writes_identity" | "asks_the_gate">, boolean]> = [
    ["RED   — rewrites an identity column and asks nobody", { writes_identity: true, asks_the_gate: false }, true],
    ["GREEN — rewrites one but asks the gate", { writes_identity: true, asks_the_gate: true }, false],
    ["GREEN — asks nobody but rewrites nothing", { writes_identity: false, asks_the_gate: false }, false],
  ];
  for (const [label, row, expect] of cases) {
    if (isUnguardedRewrite(row) === expect) console.log(`  ${C.g}✓${C.x} ${label}`);
    else { console.log(`  ${C.r}✗${C.x} ${label}`); bad++; }
  }

  // And the same two states built for real, so the VIEW that feeds the rule is proven too.
  const schema = `zz_definer_class_selftest_${Date.now().toString(36)}`;
  try {
    await door(env, `create schema ${schema}`);
    await door(env, `create table ${schema}.t (id uuid primary key default gen_random_uuid(), organization_id uuid)`);
    await door(env, `create function ${schema}.zz_probe() returns void language plpgsql security definer as $f$
                     begin update ${schema}.t set organization_id = gen_random_uuid(); end $f$`);
    await door(env, `grant usage on schema ${schema} to authenticated`);
    // 🚨 THE DECLARATION FIRST, OR THERE IS NOTHING TO MEASURE. `enforce_definer_client_grants`
    // (db-rules §6d-4) revokes a client EXECUTE on an UNDECLARED SECURITY DEFINER function at
    // `ddl_command_end`, silently. The first version of this self-test granted and then found the
    // census empty — not because the census was blind, but because the door had already been shut
    // behind it. Declaring the probe is what makes the RED half a measurement of THIS guard rather
    // than an accidental re-measurement of that one.
    await door(env, `insert into platform.client_callable_door(schema_name, function_name, identity_args, declared_by, reason)
                     values ('${schema}', 'zz_probe', '', 'check:definer-class --self-test',
                             'Throwaway probe built and dropped by the self-test in the same run.')`);
    await door(env, `grant execute on function ${schema}.zz_probe() to authenticated`);
    const red = await door(env, `select count(*)::int n from iam.definer_class_census
                                  where schema_name = '${schema}' and writes_identity and not asks_the_gate`);
    if (Number((red[0] as { n?: number })?.n ?? 0) !== 1) {
      console.log(`  ${C.r}✗${C.x} RED  — the view did not see the unguarded rewrite it was just handed`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} RED  — the view sees a client-callable definer that rewrites an identity column`);
    }
    await door(env, `create or replace function ${schema}.zz_probe() returns void language plpgsql security definer as $f$
                     begin perform iam.assert_class_allows('note','rewrite_owner',null);
                           update ${schema}.t set organization_id = gen_random_uuid(); end $f$`);
    const green = await door(env, `select count(*)::int n from iam.definer_class_census
                                    where schema_name = '${schema}' and writes_identity and not asks_the_gate`);
    if (Number((green[0] as { n?: number })?.n ?? 0) !== 0) {
      console.log(`  ${C.r}✗${C.x} GREEN — the view still flags it after it started asking the gate`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} GREEN — it stops being flagged the moment it asks the gate`);
    }
  } finally {
    try { await door(env, `drop schema if exists ${schema} cascade`); } catch { /* unique per run */ }
    try { await door(env, `delete from platform.client_callable_door where schema_name = '${schema}'`); }
    catch { /* the schema name is unique per run; a leftover row names its own origin */ }
  }

  console.log(bad === 0 ? `${C.g}✓${C.x} ${C.b}the guard fails when it should and passes when it should${C.x}`
                        : `${C.r}✗${C.x} ${C.b}the guard is not trustworthy${C.x}`);
  return bad === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  console.log(`${C.b}THE DEFINER CLASS GUARD${C.x} ${C.d}(DD-137c / VISIBILITY-BY-CLASS §3.4 — borrowed rights do not decide what a class means)${C.x}`);
  const env = loadEnv();
  if (!env) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. This is a FAILURE, not a pass.`);
    return STRICT ? 1 : 0;
  }
  if (SELF_TEST) return selfTest(env);

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await door(env, CENSUS_SQL);
  } catch (e) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the census query failed: ${String(e)}`);
    return STRICT ? 1 : 0;
  }
  const j = (rows[0] as { j?: Record<string, unknown> })?.j;
  if (!j) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the census returned nothing`);
    return STRICT ? 1 : 0;
  }

  const total = Number(j.total ?? 0);
  const writes = Number(j.writes ?? 0);
  const reads = Number(j.reads ?? 0);
  const readsOpen = Number(j.reads_open ?? 0);
  const offenders = ((j.offenders as Row[]) ?? []).filter(isUnguardedRewrite);

  console.log(`  ${C.d}${total} client-callable SECURITY DEFINER functions; ${writes} rewrite an identity column; ${reads} read a private or confidential table${C.x}`);

  let findings = 0;
  if (offenders.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ${offenders.length} rewrite an identity column ${C.b}without asking the gate or the kernel${C.x} — F-1's hole: a class that governs one RLS arm is defeated by any call that changes who the owner is`);
    for (const o of offenders) {
      console.log(`     ${C.d}${o.schema_name}.${o.function_name}(${o.identity_args})  reachable by ${o.reachable_by}${o.declared ? "" : "  [UNDECLARED in platform.client_callable_door]"}${C.x}`);
    }
    console.log(`     ${C.d}The repair is one line inside each: \`perform iam.assert_class_allows('<token>', 'rewrite_owner'|'reparent', <org>)\` — or \`iam.class_allows\` if the function catches its own errors, because catching a raise discards the audit row with it.${C.x}`);
  } else {
    console.log(`  ${C.g}✓${C.x} no client-callable definer function rewrites an identity column without asking`);
  }

  console.log(`  ${C.y}!${C.x} ${readsOpen} read a ${"`private`"} or ${"`confidential`"} table without asking the gate or the kernel ${C.d}— reported, not failed: this is §3.4's remaining distance, and the number is printed every run so it cannot drift upward unnoticed.${C.x}`);
  console.log(`  ${C.d}The census measures function BODIES as text: dynamic SQL is invisible to it, so this is a FLOOR on the problem and never a ceiling. The absence of a row is not a proof of safety.${C.x}`);

  if (findings === 0) {
    console.log(`${C.g}✓${C.x} ${C.b}no definer function decides an identity rewrite on its own${C.x}`);
    return 0;
  }
  return STRICT ? 1 : 0;
}

// `process.exit()` discards anything still in the stdout pipe; a guard that cannot be trusted to
// print what it found is worse than no guard.
main().then((code) => { process.exitCode = code; }).catch((e) => {
  console.error(`${C.r}✗${C.x} check:definer-class crashed: ${String(e)}`);
  process.exitCode = 1;
});
