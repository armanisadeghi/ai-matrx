#!/usr/bin/env npx tsx
/**
 * THE RLS-ON GUARD — no registered relation a client can read is left without a
 * row filter, and no view-backed token is left without a parent to inherit from
 * (DD-161).
 *
 * WHY THIS EXISTS, AND WHAT THE ORIGINAL FINDING GOT WRONG
 * -------------------------------------------------------
 * B-41b §FR1.12 reported `workflow.card` as a registered TABLE with RLS switched
 * off, an `anon` SELECT grant and no policies — "readable by anyone on the
 * internet" — and `content_ir.kind_conformance` as the same shape for any signed-in
 * user over 1,128 rows. Re-measured on 2026-09-12, both are VIEWS carrying
 * `security_invoker=true`, so the parent table's RLS is evaluated AS THE CALLER.
 * Proven with real roles: `anon` reads 0 rows of `workflow.card`; a plain member
 * reads 1,064 rows of `content_ir.kind_conformance` and 1,064 rows of
 * `content_ir.kind_definition` — the same 1,064. Nothing was open. The counts in
 * the finding were a BYPASSRLS superuser's, read as if they were a client's.
 *
 * `relrowsecurity` is FALSE on every view in Postgres and always will be. A guard
 * that reads that column and stops there reports a view as the widest hole in the
 * database and misses the one shape that genuinely is one: a view with
 * `security_invoker` OFF, which runs as its owner and therefore does not evaluate
 * the underlying RLS at all. Its inline `WHERE` is then the entire access contract,
 * written by hand, invisible to `iam.apply_rls`, to `iam.verify_canonical`, and to
 * every door guard that reads `pg_policy`.
 *
 * So this guard asks four questions about REGISTERED relations, and the two that
 * matter are not about `relrowsecurity` at all.
 *
 * WHAT IT FAILS ON
 * ----------------
 *   A — a registered base table with RLS off and any client grant. Zero today. This
 *       is the shape the brief named; it is kept because zero is a measurement that
 *       can change, not a reason to stop looking.
 *   B — a registered relation a client can read whose access is NOT the caller's
 *       RLS (a view without `security_invoker=true`), and which is not DECLARED
 *       below with a reason. One today: `agent.card`, declared, because B-15/DD-116
 *       reviewed and gated that exact door.
 *   C — a registered base table with RLS on, a client grant, and ZERO policies.
 *       Zero today. RLS with no policy denies everything, which is safe and silent:
 *       a screen that shows nothing and explains nothing (law 4).
 *   D — a registered view-backed token with no composition parent. A view cannot
 *       carry a generated policy, so its class can only come from its parent;
 *       `iam.class_lanes` resolves a parentless component to `private`, which is an
 *       orphan's default and not a decision anyone made. Two today before
 *       `dd161_view_backed_tokens_declare_their_parent.sql`, zero after.
 *
 * WHAT IT ONLY REPORTS
 * --------------------
 * The same two shapes on UNREGISTERED relations — 15 owner-rights views a client
 * can read, and 2 tables with RLS off granted to `authenticated` only. They are
 * printed by name every run because they are real and nobody has ruled on them, and
 * they are not failed here because this guard's scope is the registry and wedging
 * the release gate on another lane's census is how guards get disabled. The
 * `authenticated`-only pair is also a live blind spot in
 * `lib/security/public-exposure.ts`'s `UNPROTECTED_RELATION_QUERY`, whose WHERE
 * requires an `anon` privilege and therefore cannot see them.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS — without credentials it exits 1 under
 * --strict and says so loudly otherwise; it never prints a green line it did not earn.
 *
 *   pnpm check:rls-on
 *   pnpm check:rls-on --strict     # exit 1 on any registered finding or UNMEASURED
 *   pnpm check:rls-on --self-test  # RED then GREEN against the real database
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

/**
 * ARM B's declaration list. A row here says: this relation's access contract is its
 * own text rather than the caller's RLS, somebody read that text, and here is who
 * and when. Adding a row is the act of review — never a way to silence the check.
 */
export interface OwnerRightsDeclaration {
  /** `schema.relation` */
  relation: string;
  why: string;
}

const OWNER_RIGHTS_DECLARED: ReadonlyArray<OwnerRightsDeclaration> = [
  {
    relation: "agent.card",
    why:
      "The public agent-card door, reviewed and gated by B-15 / DD-116. The view runs as its owner on purpose: " +
      "`agent.definition`'s anon policy is `visibility = 'public'` and ZERO rows carry that, so an invoker view " +
      "would return nothing to a logged-out visitor and the guest-run flow would die. The card axis is the " +
      "separate `card_visibility` column, and the view's own WHERE is what enforces it. Measured 2026-09-12: " +
      "`set local role anon; select count(*) from agent.card` = 418, every one `card_visibility='public'`. The " +
      "columns are the non-secret projection (name, description, tags, variable_definitions, output_schema); the " +
      "secrets (prompt, model, tools, settings) are not in the view at all.",
  },
];

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
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      "Content-Type": "application/json",
      "Content-Profile": "public",
      "Accept-Profile": "public",
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

/** The system schemas nothing in this repo governs. Same list as public-exposure.ts. */
const SKIP_SCHEMAS = `('pg_catalog','information_schema','extensions','graphql','graphql_public',
                       'realtime','storage','vault','auth','net','cron','pgsodium',
                       'supabase_migrations','supabase_functions')`;

/**
 * The one predicate that decides whether a relation's rows are filtered by the
 * CALLER's RLS. A base table: `relrowsecurity`. A view: `security_invoker`, which
 * Postgres spells `true` or `on` depending on how it was written, and which is
 * ABSENT (meaning off) when `reloptions` is null.
 */
const FILTERS_FOR_THE_CALLER = `
  case when c.relkind in ('r','p') then c.relrowsecurity
       else coalesce(array_to_string(c.reloptions, ',') ~ 'security_invoker=(true|on)', false)
  end`;

const CLIENT_CAN_READ = `
  (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))`;

const CLIENT_CAN_WRITE = `
  (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
   or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('authenticated', c.oid, 'INSERT')
   or has_table_privilege('authenticated', c.oid, 'UPDATE') or has_table_privilege('authenticated', c.oid, 'DELETE'))`;

const CENSUS_SQL = `
with rel as (
  select et.token,
         n.nspname || '.' || c.relname as relation,
         c.relkind::text as relkind,
         c.oid,
         c.relrowsecurity,
         ${FILTERS_FOR_THE_CALLER} as filters_for_the_caller,
         (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies,
         (select string_agg(g.grantee || ':' || g.privilege_type, ', ' order by g.grantee, g.privilege_type)
            from information_schema.role_table_grants g
           where g.table_schema = n.nspname and g.table_name = c.relname
             and g.grantee in ('anon','authenticated')) as client_grants,
         has_table_privilege('anon', c.oid, 'SELECT') as anon_read,
         ${CLIENT_CAN_WRITE} as client_can_write,
         exists (select 1 from platform.entity_relationships r
                  where r.child_type = et.token and r.kind = 'composition') as has_parent
  from platform.entity_types et
  join pg_namespace n on n.nspname = et.schema_name
  join pg_class c on c.relnamespace = n.oid and c.relname = et.table_name
  where et.is_active and ${CLIENT_CAN_READ}
),
unreg as (
  select n.nspname || '.' || c.relname as relation,
         c.relkind::text as relkind,
         ${FILTERS_FOR_THE_CALLER} as filters_for_the_caller,
         (select string_agg(g.grantee || ':' || g.privilege_type, ', ' order by g.grantee, g.privilege_type)
            from information_schema.role_table_grants g
           where g.table_schema = n.nspname and g.table_name = c.relname
             and g.grantee in ('anon','authenticated')) as client_grants,
         has_table_privilege('anon', c.oid, 'SELECT') as anon_read
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p','v','m')
    and n.nspname not in ${SKIP_SCHEMAS}
    and ${CLIENT_CAN_READ}
    and not exists (select 1 from platform.entity_types et
                     where et.is_active and et.schema_name = n.nspname and et.table_name = c.relname)
)
select json_build_object(
  'registered',   (select count(*) from rel),
  'arm_a',        (select coalesce(json_agg(to_jsonb(r) order by r.relation), '[]'::json) from rel r
                    where r.relkind in ('r','p') and not r.relrowsecurity),
  'arm_b',        (select coalesce(json_agg(to_jsonb(r) order by r.relation), '[]'::json) from rel r
                    where not r.filters_for_the_caller and r.relkind not in ('r','p')),
  'arm_c',        (select coalesce(json_agg(to_jsonb(r) order by r.relation), '[]'::json) from rel r
                    where r.relkind in ('r','p') and r.relrowsecurity and r.policies = 0),
  'arm_d',        (select coalesce(json_agg(to_jsonb(r) order by r.relation), '[]'::json) from rel r
                    where r.relkind in ('v','m') and not r.has_parent),
  'arm_e',        (select coalesce(json_agg(to_jsonb(r) order by r.relation), '[]'::json) from rel r
                    where r.relkind in ('v','m') and r.client_can_write),
  'unreg_views',  (select coalesce(json_agg(to_jsonb(u) order by u.anon_read desc, u.relation), '[]'::json) from unreg u
                    where u.relkind in ('v','m') and not u.filters_for_the_caller),
  'unreg_tables', (select coalesce(json_agg(to_jsonb(u) order by u.relation), '[]'::json) from unreg u
                    where u.relkind in ('r','p') and not u.filters_for_the_caller)
) as j`;

type Rel = {
  token?: string;
  relation: string;
  relkind: string;
  client_grants: string | null;
  anon_read?: boolean;
  policies?: number;
};

/** THE PURE RULE for arm B, exported so the self-test can hand it rows it wrote itself. */
export function isUndeclaredOwnerRights(
  r: Pick<Rel, "relation">,
  declared: ReadonlyArray<OwnerRightsDeclaration> = OWNER_RIGHTS_DECLARED,
): boolean {
  return !declared.some((d) => d.relation === r.relation);
}

function printRows(rows: Rel[], indent = "     "): void {
  for (const r of rows) {
    const who = r.anon_read ? `${C.r}anon can read${C.x}` : "authenticated";
    console.log(`${indent}${C.d}${r.relation}${r.token ? ` (${r.token})` : ""} — ${who}; grants: ${r.client_grants ?? "none"}${C.x}`);
  }
}

async function selfTest(env: { url: string; key: string }): Promise<number> {
  console.log(`${C.b}SELF-TEST${C.x} ${C.d}(the rule, and the census that feeds it — RED then GREEN on the real database)${C.x}`);
  let bad = 0;

  const pure: Array<[string, string, boolean]> = [
    ["RED   — an owner-rights view nobody declared", "zz.undeclared_view", true],
    ["GREEN — the one owner-rights view that was reviewed", "agent.card", false],
  ];
  for (const [label, relation, expect] of pure) {
    if (isUndeclaredOwnerRights({ relation }) === expect) console.log(`  ${C.g}✓${C.x} ${label}`);
    else { console.log(`  ${C.r}✗${C.x} ${label}`); bad++; }
  }

  // The live half. A throwaway schema, a registered token, and the four shapes built
  // for real — because a rule that agrees with itself proves nothing about the SQL
  // that has to find these relations in a 700-table registry.
  const schema = `zz_rls_on_selftest_${Date.now().toString(36)}`;
  const token = `${schema}_t`;
  const viewToken = `${schema}_v`;
  try {
    await door(env, `create schema ${schema}`);
    await door(env, `grant usage on schema ${schema} to authenticated`);
    // A base table with RLS OFF and an authenticated grant — arm A.
    await door(env, `create table ${schema}.t (id uuid primary key default gen_random_uuid())`);
    await door(env, `grant select on ${schema}.t to authenticated`);
    // A view over it with security_invoker OFF — arms B and D.
    await door(env, `create view ${schema}.v as select id from ${schema}.t`);
    // SELECT plus the write grants, so arm E has something to find too.
    await door(env, `grant select, insert, update, delete on ${schema}.v to authenticated`);
    // Register both. `_enforce_entity_is_table` refuses a view row, which is itself
    // the D233 finding; step around it exactly as d233 does, for a row we delete.
    await door(env, `insert into platform.entity_types (token, schema_name, table_name, label, is_component, rls_variant)
                     values ('${token}', '${schema}', 't', 'Self-test table', false, 'entity')`);
    await door(env, `alter table platform.entity_types disable trigger _enforce_entity_is_table`);
    try {
      await door(env, `insert into platform.entity_types (token, schema_name, table_name, label, is_component, rls_variant, is_versioned)
                       values ('${viewToken}', '${schema}', 'v', 'Self-test view', true, 'component', false)`);
    } finally {
      await door(env, `alter table platform.entity_types enable trigger _enforce_entity_is_table`);
    }

    const red = await door(env, CENSUS_SQL);
    const j = (red[0] as { j?: Record<string, unknown> })?.j ?? {};
    const inArm = (name: string, rel: string): boolean =>
      ((j[name] as Rel[]) ?? []).some((r) => r.relation === `${schema}.${rel}`);

    for (const [arm, rel, label] of [
      ["arm_a", "t", "a registered base table with RLS off and a client grant"],
      ["arm_b", "v", "a registered view whose rows are not filtered for the caller"],
      ["arm_d", "v", "a registered view-backed token with no composition parent"],
      ["arm_e", "v", "a registered view a client can INSERT, UPDATE or DELETE"],
    ] as const) {
      if (inArm(arm, rel)) console.log(`  ${C.g}✓${C.x} RED  — ${arm.toUpperCase().replace("_", " ")} sees ${label}`);
      else { console.log(`  ${C.r}✗${C.x} RED  — ${arm.toUpperCase().replace("_", " ")} MISSED ${label}`); bad++; }
    }

    // Switching RLS on clears arm A — and lands the table in exactly arm C's shape:
    // RLS on, a client grant, and no policy at all. One statement, two proofs.
    //
    // 🚨 THE SELF-TEST DELIBERATELY NEVER RUNS `CREATE POLICY`. Measured 2026-09-12:
    // through `public.execute_admin_query`, `create policy … using (true)` on an empty
    // one-column table takes 8,127 ms and is cancelled by the door's hard ~8.2 s cap
    // (CLAUDE.md § Migrations, DD-151) — every other statement here is 110-330 ms. So
    // arm C's GREEN half is the OTHER real repair: if nothing should read the table,
    // revoke the grant. Both repairs are honest; only one fits through the door.
    await door(env, `alter table ${schema}.t enable row level security`);
    const armC = await door(env, CENSUS_SQL);
    const jc = (armC[0] as { j?: Record<string, unknown> })?.j ?? {};
    if (((jc.arm_c as Rel[]) ?? []).some((r) => r.relation === `${schema}.t`)) {
      console.log(`  ${C.g}✓${C.x} RED  — ARM C sees a registered table with RLS on, a client grant and no policy`);
    } else {
      console.log(`  ${C.r}✗${C.x} RED  — ARM C missed a registered table with RLS on and no policy`); bad++;
    }

    // GREEN: each of the four repairs, for real, one per arm.
    await door(env, `revoke select on ${schema}.t from authenticated`);          // arm C
    await door(env, `alter view ${schema}.v set (security_invoker = true)`);     // arm B
    await door(env, `insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
                     values ('${viewToken}', '${token}', 'id', 'composition')`); // arm D
    await door(env, `revoke insert, update, delete on ${schema}.v from authenticated`); // arm E

    const green = await door(env, CENSUS_SQL);
    const jg = (green[0] as { j?: Record<string, unknown> })?.j ?? {};
    const stillIn = (name: string, rel: string): boolean =>
      ((jg[name] as Rel[]) ?? []).some((r) => r.relation === `${schema}.${rel}`);

    for (const [arm, rel, label] of [
      ["arm_a", "t", "RLS is switched on"],
      ["arm_c", "t", "the client read grant nobody should have had is revoked"],
      ["arm_b", "v", "the view filters for the caller"],
      ["arm_d", "v", "the view token has a composition parent"],
      ["arm_e", "v", "the client write grants are revoked"],
    ] as const) {
      if (!stillIn(arm, rel)) console.log(`  ${C.g}✓${C.x} GREEN — ${arm.toUpperCase().replace("_", " ")} clears once ${label}`);
      else { console.log(`  ${C.r}✗${C.x} GREEN — ${arm.toUpperCase().replace("_", " ")} still flags it after ${label}`); bad++; }
    }
  } finally {
    // The registry rows first: dropping the schema leaves them pointing at nothing.
    try { await door(env, `delete from platform.entity_relationships where child_type in ('${token}','${viewToken}') or parent_type in ('${token}','${viewToken}')`); } catch { /* named for this run */ }
    try { await door(env, `delete from platform.entity_types where token in ('${token}','${viewToken}')`); } catch { /* named for this run */ }
    try { await door(env, `drop schema if exists ${schema} cascade`); } catch { /* unique per run */ }
  }

  console.log(bad === 0
    ? `${C.g}✓${C.x} ${C.b}the guard fails when it should and passes when it should${C.x}`
    : `${C.r}✗${C.x} ${C.b}the guard is not trustworthy${C.x}`);
  return bad === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  console.log(`${C.b}THE RLS-ON GUARD${C.x} ${C.d}(DD-161 — no registered relation a client can read is left without a row filter)${C.x}`);
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

  const armA = (j.arm_a as Rel[]) ?? [];
  const armBAll = (j.arm_b as Rel[]) ?? [];
  const armB = armBAll.filter((r) => isUndeclaredOwnerRights(r));
  const armC = (j.arm_c as Rel[]) ?? [];
  const armD = (j.arm_d as Rel[]) ?? [];
  const armE = (j.arm_e as Rel[]) ?? [];
  const unregViews = (j.unreg_views as Rel[]) ?? [];
  const unregTables = (j.unreg_tables as Rel[]) ?? [];

  console.log(`  ${C.d}${Number(j.registered ?? 0)} registered relations a client role can SELECT${C.x}`);

  let findings = 0;

  if (armA.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ARM A — ${armA.length} registered base table(s) with ${C.b}RLS switched off${C.x} and a client grant. The grant is then the entire security model.`);
    printRows(armA);
  } else {
    console.log(`  ${C.g}✓${C.x} ARM A — every registered base table a client can read has RLS on`);
  }

  if (armB.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ARM B — ${armB.length} registered view(s) a client can read whose rows are ${C.b}not filtered by the caller's RLS${C.x} (no \`security_invoker=true\`), and which nobody has declared.`);
    printRows(armB);
    console.log(`     ${C.d}Either set \`security_invoker = true\` so the parent's policies do the work, or read the view's own WHERE and add it to OWNER_RIGHTS_DECLARED in this file with what you found. A declaration is a review, never a silencer.${C.x}`);
  } else {
    console.log(`  ${C.g}✓${C.x} ARM B — every registered view either filters for the caller or carries a reviewed declaration ${C.d}(${armBAll.length} declared)${C.x}`);
  }

  if (armC.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ARM C — ${armC.length} registered base table(s) with RLS on, a client grant and ${C.b}zero policies${C.x}. That denies everything and explains nothing — a screen that shows nothing and says nothing (law 4).`);
    printRows(armC);
  } else {
    console.log(`  ${C.g}✓${C.x} ARM C — no registered table denies every client read in silence`);
  }

  if (armD.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ARM D — ${armD.length} registered view-backed token(s) with ${C.b}no composition parent${C.x}. A view cannot carry a generated policy, so its class can only come from its parent — and \`iam.class_lanes\` resolves a parentless component to \`private\`, which is an orphan's default, not a decision.`);
    printRows(armD);
  } else {
    console.log(`  ${C.g}✓${C.x} ARM D — every registered view-backed token inherits from a declared parent`);
  }

  if (armE.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ARM E — ${armE.length} registered view(s) a client can ${C.b}INSERT, UPDATE or DELETE${C.x}. A view has no policies of its own, so the only thing standing between that grant and the parent table is the parent's write policy — and when none applies, the statement returns SUCCESS having touched nothing rather than refusing. Nothing announces the day that stops being true.`);
    printRows(armE);
    console.log(`     ${C.d}A projection view is read-only: \`REVOKE INSERT, UPDATE, DELETE ON <view> FROM anon, authenticated\`. If something really does write through one, it needs its own INSTEAD OF trigger and a declaration, not a bare grant.${C.x}`);
  } else {
    console.log(`  ${C.g}✓${C.x} ARM E — no registered view carries a client write grant`);
  }

  console.log(
    `  ${C.y}!${C.x} ${unregViews.length} UNREGISTERED view(s) a client can read that do not filter for the caller` +
    `, and ${unregTables.length} UNREGISTERED table(s) with RLS off — reported, not failed: outside this guard's scope (the registry), and nobody has ruled on them.`,
  );
  printRows(unregViews.slice(0, 20));
  printRows(unregTables);
  console.log(`     ${C.d}The RLS-off tables above granted to \`authenticated\` only are invisible to \`lib/security/public-exposure.ts\`'s UNPROTECTED_RELATION_QUERY, whose WHERE requires an \`anon\` privilege.${C.x}`);

  if (findings === 0) {
    console.log(`${C.g}✓${C.x} ${C.b}every registered relation a client can read is filtered, or declared and reviewed${C.x}`);
    return 0;
  }
  return STRICT ? 1 : 0;
}

// `process.exit()` discards anything still in the stdout pipe; a guard that cannot be
// trusted to print what it found is worse than no guard.
main().then((code) => { process.exitCode = code; }).catch((e) => {
  console.error(`${C.r}✗${C.x} check:rls-on crashed: ${String(e)}`);
  process.exitCode = 1;
});
