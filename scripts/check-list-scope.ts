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
import { scanRepo, scanSource, type Registry, type RegistryFact } from "./list-scope-client-scan";

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
             group by 1) s),
  -- Guard B's source of truth: every active token's table, and where its list lands. The scanner
  -- resolves a .schema(x).from(y) chain against this and asks nothing else.
  'registry', (
    select coalesce(json_agg(json_build_object(
             'schema', et.schema_name, 'table', et.table_name,
             'scope', coalesce(et.default_list_scope::text,
                               case when et.rls_variant in ('component','ledger')
                                    then 'inherited' end)) order by et.schema_name, et.table_name), '[]'::json)
      from platform.entity_types et
     where et.is_active
       and (et.default_list_scope is not null or et.rls_variant in ('component','ledger')))
) as j`;

/**
 * Build the scanner's lookup: `schema.table` always, and the bare `table` too when every schema
 * that owns that name agrees. A bare name whose owners DISAGREE is marked ambiguous, so the scanner
 * reports it UNRESOLVED instead of guessing — guessing is how a guard starts lying.
 */
export function buildRegistry(rows: Array<{ schema: string; table: string; scope: string }>): Registry {
  const reg: Registry = new Map();
  const bare = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.scope !== "mine" && r.scope !== "organization" && r.scope !== "inherited") continue;
    reg.set(`${r.schema}.${r.table}`, r.scope as RegistryFact);
    if (!bare.has(r.table)) bare.set(r.table, new Set());
    bare.get(r.table)!.add(r.scope);
  }
  for (const [table, scopes] of bare) {
    reg.set(table, scopes.size === 1 ? ([...scopes][0] as RegistryFact) : "ambiguous");
  }
  return reg;
}

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

  // ── Guard B's detector, fed source this test wrote itself ──────────────────────────────────────
  console.log(`${C.b}SELF-TEST — GUARD B${C.x} ${C.d}(the registry decides, not a list of files)${C.x}`);
  const reg = buildRegistry([
    { schema: "content_ir", table: "kind_instance", scope: "organization" },
    { schema: "users", table: "user_secrets", scope: "mine" },
    { schema: "a", table: "twins", scope: "mine" },
    { schema: "b", table: "twins", scope: "organization" },
  ]);
  const cases: Array<[string, string, number]> = [
    ["RED   — owner filter is the sole scope on an `organization` token",
     `const q = supabase.schema("content_ir").from("kind_instance").select("id").eq("created_by", userId);`, 1],
    ["GREEN — the SAME line on a `mine` token is correct and is not flagged",
     `const q = supabase.schema("users").from("user_secrets").select("id").eq("created_by", userId);`, 0],
    ["GREEN — an organization filter alongside it answers the question already",
     `const q = supabase.schema("content_ir").from("kind_instance").select("id").eq("organization_id", orgId).eq("created_by", userId);`, 0],
    ["GREEN — asking the registry is the fix, and a fixed site stops being flagged",
     `const ownerOnly = await scopeToOwner("content_ir_kind_instance", scope);\nlet q = supabase.schema("content_ir").from("kind_instance").select("id");\nif (ownerOnly) q = q.eq("created_by", userId);`, 0],
    ["GREEN — a single-row read is not a list",
     `const q = await supabase.schema("content_ir").from("kind_instance").select("id").eq("created_by", userId).maybeSingle();`, 0],
    ["GREEN — a write asserting ownership is not a list",
     `await supabase.schema("content_ir").from("kind_instance").update({ x: 1 }).eq("created_by", userId);`, 0],
    ["RED   — a bare table name two schemas disagree about is UNRESOLVED, never guessed",
     `const q = supabase.from("twins").select("id").eq("created_by", userId);`, 1],
  ];
  for (const [label, src, expect] of cases) {
    const n = scanSource(src, "self-test.ts", reg).length;
    if (n === expect) console.log(`  ${C.g}✓${C.x} ${label}`);
    else { console.log(`  ${C.r}✗${C.x} ${label} ${C.d}(got ${n}, expected ${expect})${C.x}`); bad++; }
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

  // D — GUARD B: the clients (§3.3, "and the client half is the larger job")
  const registryRows = (j.registry as Array<{ schema: string; table: string; scope: string }>) ?? [];
  if (registryRows.length === 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the registry returned no table→scope rows, so the client scan cannot run. That is a failure, not a pass.`);
  } else {
    const reg = buildRegistry(registryRows);
    const hits = scanRepo(ROOT, reg);
    const orgHits = hits.filter((h) => h.scope === "organization");
    const inherited = hits.filter((h) => h.scope === "inherited");
    const unresolved = hits.filter((h) => h.scope === "unresolved");
    if (orgHits.length > 0) {
      findings++;
      console.log(`  ${C.r}✗${C.x} ${orgHits.length} list quer${orgHits.length === 1 ? "y" : "ies"} filter to the signed-in person on a token the registry lands on ${C.b}organization${C.x}`);
      for (const h of orgHits.slice(0, 40)) {
        console.log(`     ${C.d}${h.file}:${h.line}  ${h.table}  .eq("${h.column}", …)${C.x}`);
      }
      if (orgHits.length > 40) console.log(`     ${C.d}… and ${orgHits.length - 40} more${C.x}`);
      console.log(`     ${C.d}Each one throws away the organization_id the row is carrying. Read the registry instead: \`const ownerOnly = await scopeToOwner("<token>", scope)\` from @/lib/list-scope, then apply the owner filter only when it says so.${C.x}`);
    } else {
      console.log(`  ${C.g}✓${C.x} no list query filters to its owner as the sole scope on an ${"`organization`"} token ${C.d}(${registryRows.length} tokens known)${C.x}`);
    }
    // Two things this guard SEES but does not judge, printed rather than swallowed. Neither is a
    // query defect; both are facts about the registry, and a guard that hides what it stepped over
    // is a guard nobody can audit.
    if (inherited.length > 0) {
      const rels = [...new Set(inherited.map((h) => h.table))].sort();
      console.log(`  ${C.y}!${C.x} ${inherited.length} owner-filtered list quer${inherited.length === 1 ? "y" : "ies"} on a registered ${C.b}component${C.x} ${C.d}(${rels.join(", ")}) — a component has no landing place of its own: db-rules §6d-1 says its access IS its parent's, so §3.3 (F-20) leaves its scope NULL on purpose. Not judged here.${C.x}`);
    }
    if (unresolved.length > 0) {
      const rels = [...new Set(unresolved.map((h) => h.table))].sort();
      console.log(`  ${C.y}!${C.x} ${unresolved.length} owner-filtered list quer${unresolved.length === 1 ? "y" : "ies"} on ${rels.length} table(s) with ${C.b}no registry row at all${C.x} — so no declared landing place, and §3.3's rule has nothing to say about them. A REGISTRY gap, not a query defect; named so it is not mistaken for a clean scan:`);
      for (const t of rels) console.log(`     ${C.d}${t}${C.x}`);
    }
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
