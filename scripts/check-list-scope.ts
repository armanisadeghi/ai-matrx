#!/usr/bin/env npx tsx
/**
 * THE LIST-SCOPE AXIS — where a list LANDS is a registry word, and it is never an access decision.
 *
 * WHY THIS EXISTS (VISIBILITY-BY-CLASS §3.3, chair R2; measured live 2026-09-12)
 * -----------------------------------------------------------------------------
 * Four people in one organization each researched SEO keywords, and each of them saw only their
 * own. The screen was filtering on `created_by` in the client while the row carried both an
 * `organization_id` and a `visibility` the client was discarding. That is the complaint this whole
 * design came from, and it is NOT an access bug: every one of those rows was readable by every one
 * of those people. It is a DEFAULT LANDING PLACE bug.
 *
 * So the platform gets a second axis, kept deliberately apart from `data_class`:
 * `platform.entity_types.default_list_scope` ∈ `mine` | `organization`. Changing where a screen
 * opens must never change a table's security posture — the conflation is what produced the
 * complaint in the first place.
 *
 * ONE REGISTRY WORD CANNOT MEAN ELEVEN THINGS
 * -------------------------------------------
 * Eleven `%_list_scoped` RPCs are `SECURITY DEFINER`, so RLS is not their ceiling — each one's
 * hand-written predicate is, and the predicates disagree: five require
 * `visibility in ('internal','public')`, `wfx_list_scoped` requires `internal` only,
 * `mnd_list_scoped` has no visibility test and no role test at all, and `crm_inbox_list_scoped`
 * resolves membership from a different table. A "mine / everyone" toggle may only ever NARROW what
 * RLS already allows, so §3.3's repair is a conversion, not a default: the eleven become
 * `SECURITY INVOKER` and their bespoke org predicates are DELETED rather than reconciled.
 *
 * WHAT THIS GUARD ASSERTS
 * -----------------------
 *   A. THE RPCs — no `%_list_scoped` function is `SECURITY DEFINER`. **RED at 11 of 11 today**,
 *      and it is meant to be: DD-137b7 landed the registry DEFAULT in nine of them
 *      (`coalesce(p_scope, platform.entity_default_list_scope('<token>'))`) and did NOT convert any
 *      of them. Each conversion is surgery on a several-hundred-line function and needs its own
 *      per-identity access delta — `iam.access_delta_snapshot` exists for exactly that. This guard
 *      is the reason that work is enforced rather than remembered.
 *   B. THE REGISTRY IS COMPLETE — every active entity/system token declares a `default_list_scope`.
 *      A screen with no declared landing place is the state this axis exists to end.
 *   C. THE DEFAULT IS WIRED — the nine patched RPCs still read
 *      `platform.entity_default_list_scope`. A later edit that re-hard-codes `'mine'` puts the
 *      complaint straight back, one function at a time.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS. Without credentials this exits 1 under --strict and says
 * so loudly otherwise; it never prints a green line it did not earn.
 *
 *   pnpm check:list-scope             # loud, non-blocking (exit 0)
 *   pnpm check:list-scope --strict    # exit 1 on any finding or UNMEASURED
 *   pnpm check:list-scope --self-test # RED then GREEN against the real database: build a
 *                                     # definer `*_list_scoped` in a throwaway schema and watch the
 *                                     # detector find it, rebuild it as invoker and watch it pass.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

const C = {
  b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m",
};

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

/**
 * The pure detector, exported so --self-test can feed it rows it built itself. A list RPC that runs
 * as its DEFINER has put its hand-written predicate where RLS should be.
 */
export function isDefinerListRpc(row: { proname: string; prosecdef: boolean }): boolean {
  return row.prosecdef === true;
}

const FINDINGS_SQL = `
select json_build_object(
  'definer_rpcs', (
    select coalesce(json_agg(json_build_object('proname', p.proname, 'prosecdef', p.prosecdef)
                             order by p.proname), '[]'::json)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname like '%\\_list\\_scoped' and p.prosecdef),
  'all_rpcs', (
    select coalesce(json_agg(p.proname order by p.proname), '[]'::json)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname like '%\\_list\\_scoped'),
  'reading_registry', (
    select coalesce(json_agg(p.proname order by p.proname), '[]'::json)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname like '%\\_list\\_scoped'
       and p.prosrc like '%entity_default_list_scope%'),
  'unscoped_tokens', (
    select coalesce(json_agg(et.token order by et.token), '[]'::json)
      from platform.entity_types et
     where et.is_active and et.rls_variant not in ('component','ledger')
       and et.default_list_scope is null),
  'scope_census', (
    select coalesce(json_agg(json_build_object('scope', s.default_list_scope, 'n', s.n)
                             order by s.default_list_scope), '[]'::json)
      from (select default_list_scope, count(*) n from platform.entity_types
             where is_active and rls_variant not in ('component','ledger')
             group by 1) s)
) as j`;

async function selfTest(env: { url: string; key: string }): Promise<number> {
  console.log(`${C.b}SELF-TEST${C.x} ${C.d}(the detector must find a definer list RPC, and must not flag an invoker one)${C.x}`);
  let bad = 0;

  // Pure-detector halves first: no database needed to know what the rule says.
  if (!isDefinerListRpc({ proname: "x_list_scoped", prosecdef: true })) {
    console.log(`  ${C.r}✗${C.x} RED  — the detector did not flag a SECURITY DEFINER list RPC`); bad++;
  } else {
    console.log(`  ${C.g}✓${C.x} RED  — a SECURITY DEFINER list RPC is flagged`);
  }
  if (isDefinerListRpc({ proname: "x_list_scoped", prosecdef: false })) {
    console.log(`  ${C.r}✗${C.x} GREEN — the detector flagged a SECURITY INVOKER list RPC`); bad++;
  } else {
    console.log(`  ${C.g}✓${C.x} GREEN — a SECURITY INVOKER list RPC is not flagged`);
  }

  // And the same two cases built for real in the database, so the SQL that feeds the detector is
  // proven too — a detector fed by a query nobody tested is a detector nobody tested.
  const schema = `zz_list_scope_selftest_${Date.now().toString(36)}`;
  try {
    await door(env, `create schema ${schema}`);
    await door(env, `create function ${schema}.zz_probe_list_scoped() returns int
                     language sql security definer as $f$ select 1 $f$`);
    const red = await door(env, `select count(*)::int as n from pg_proc p
                                  join pg_namespace n on n.oid = p.pronamespace
                                 where n.nspname = '${schema}' and p.proname like '%\\_list\\_scoped'
                                   and p.prosecdef`);
    if (Number((red[0] as { n?: number })?.n ?? 0) !== 1) {
      console.log(`  ${C.r}✗${C.x} RED  — the live query did not see the definer function it just built`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} RED  — the live query sees a definer ${"`*_list_scoped`"} in the catalogue`);
    }
    await door(env, `create or replace function ${schema}.zz_probe_list_scoped() returns int
                     language sql security invoker as $f$ select 1 $f$`);
    const green = await door(env, `select count(*)::int as n from pg_proc p
                                    join pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = '${schema}' and p.proname like '%\\_list\\_scoped'
                                     and p.prosecdef`);
    if (Number((green[0] as { n?: number })?.n ?? 0) !== 0) {
      console.log(`  ${C.r}✗${C.x} GREEN — the live query still flags the same function after it became invoker`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} GREEN — the live query stops flagging it the moment it becomes invoker`);
    }
  } finally {
    try { await door(env, `drop schema if exists ${schema} cascade`); } catch { /* the teardown is best effort; the schema name is unique per run */ }
  }

  console.log(bad === 0 ? `${C.g}✓${C.x} ${C.b}the detector fails when it should and passes when it should${C.x}`
                        : `${C.r}✗${C.x} ${C.b}the detector is not trustworthy${C.x}`);
  return bad === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  console.log(`${C.b}THE LIST-SCOPE AXIS${C.x} ${C.d}(DD-137b / VISIBILITY-BY-CLASS §3.3 — where a list lands is a registry word)${C.x}`);
  const env = loadEnv();
  if (!env) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. This is a FAILURE, not a pass.`);
    return STRICT ? 1 : 0;
  }
  if (SELF_TEST) return selfTest(env);

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await door(env, FINDINGS_SQL);
  } catch (e) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the structural query failed: ${String(e)}`);
    return STRICT ? 1 : 0;
  }
  const j = (rows[0] as { j?: Record<string, unknown> })?.j;
  if (!j) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the structural query returned nothing`);
    return STRICT ? 1 : 0;
  }

  const definer = (j.definer_rpcs as Array<{ proname: string; prosecdef: boolean }>) ?? [];
  const all = (j.all_rpcs as string[]) ?? [];
  const reading = (j.reading_registry as string[]) ?? [];
  const unscoped = (j.unscoped_tokens as string[]) ?? [];
  const census = (j.scope_census as Array<{ scope: string; n: number }>) ?? [];

  let findings = 0;

  // A — the conversion
  const flagged = definer.filter(isDefinerListRpc);
  if (flagged.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ${flagged.length} of ${all.length} ${"`*_list_scoped`"} RPCs are ${C.b}SECURITY DEFINER${C.x} — their hand-written predicate is the ceiling, not RLS`);
    console.log(`     ${C.d}${flagged.map((f) => f.proname).join(", ")}${C.x}`);
    console.log(`     ${C.d}§3.3: they become SECURITY INVOKER and their bespoke org predicates are DELETED, not reconciled — a "mine / everyone" toggle may only ever NARROW what RLS already allows. Each conversion needs its own per-identity access delta (iam.access_delta_snapshot).${C.x}`);
  } else {
    console.log(`  ${C.g}✓${C.x} every ${"`*_list_scoped`"} RPC runs as its caller, so RLS is the ceiling`);
  }

  // B — the registry is complete
  if (unscoped.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ${unscoped.length} active entity/system tokens declare no default_list_scope: ${C.d}${unscoped.slice(0, 12).join(", ")}${unscoped.length > 12 ? ", …" : ""}${C.x}`);
  } else {
    console.log(`  ${C.g}✓${C.x} every active entity/system token declares where its list lands ${C.d}(${census.map((c) => `${c.scope}: ${c.n}`).join(", ")})${C.x}`);
  }

  // C — the default stays wired
  if (reading.length < 9) {
    findings++;
    console.log(`  ${C.r}✗${C.x} only ${reading.length} list RPCs read ${"`platform.entity_default_list_scope`"} — DD-137b7 wired nine; a re-hard-coded 'mine' puts the complaint back`);
  } else {
    console.log(`  ${C.g}✓${C.x} ${reading.length} list RPCs take their default from the registry, not from a literal`);
  }

  if (findings === 0) {
    console.log(`${C.g}✓${C.x} ${C.b}the list-scope axis is wired end to end${C.x}`);
    return 0;
  }
  console.log(`${C.y}!${C.x} ${C.b}${findings} finding(s)${C.x} ${C.d}— the conversion of the eleven RPCs is DD-137b's remaining step-4 work, deliberately left RED rather than remembered${C.x}`);
  return STRICT ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(`${C.r}✗${C.x} check:list-scope crashed: ${String(e)}`);
  process.exit(1);
});
