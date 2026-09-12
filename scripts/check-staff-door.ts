#!/usr/bin/env npx tsx
/**
 * THE STAFF DOOR — our own staff go through the door too, and a COMPONENT is not an exception.
 *
 * WHY THIS EXISTS (V-40, 2026-09-12 — and the defect it caught was mine)
 * ---------------------------------------------------------------------
 * DD-137b closed the platform-admin lane on 147 `private` and `confidential` base tables and the
 * report said §3.5's promise — *"private means no standing read for anyone, our own staff
 * included"* — was now kept. It was kept on the index and broken on the contents:
 *
 *     chat.conversation        226 of  24,590 readable by a platform admin
 *     chat.message         131,763 of 131,763 readable by the same platform admin
 *     users.credential_items   123 of     123
 *
 * `iam.class_lanes` returns NULL lanes for a component — correct, a component has no class of its
 * own — and both consumers read that as `coalesce(lane, true)`, i.e. "unknown, so allow". 299 of
 * 311 components and 22 of 22 ledgers kept `platform_admin_all`, 95 of them under a `private` or
 * `confidential` parent. DD-137b10 made a component's lanes its PARENT'S lanes; this guard is why
 * that cannot quietly come back.
 *
 * `check:admin-door` already asserts *"no parented component carries an ORG-admin read arm"*
 * (DD-136b). It has no PLATFORM-admin twin — which is precisely why it stayed green through all of
 * the above. This is the twin, and it is written against the CLASS rather than against one lane, so
 * it covers every token the registry knows: entity, system, restricted, personal, component, ledger.
 *
 * WHAT THIS GUARD ASSERTS, for every active token whose `iam.class_lanes(...)` resolves to
 * `private` or `confidential`:
 *   A. no `platform_admin_all` policy sits beside its `std_select` — that policy is PERMISSIVE and
 *      grants everything on its own, so an arm-only check misses it entirely (it missed it);
 *   B. no policy on the table carries `is_platform_admin()` or `is_super_admin()` in a permissive
 *      READ lane;
 *   C. the token DECLARES it (`suppress_platform_admin_lane`), so the registry and the policies
 *      say the same thing and the next regeneration cannot put the lane back.
 *
 * Known-open rows are NOT silently excused. They are printed as RESIDUE with the reason the
 * registry itself stores, and the count is compared against a frozen budget — so the number can
 * shrink and can never grow without this guard failing.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS.
 *
 *   pnpm check:staff-door             # loud, non-blocking (exit 0)
 *   pnpm check:staff-door --strict    # exit 1 on any finding or UNMEASURED
 *   pnpm check:staff-door --self-test # RED then GREEN against the real database
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

/**
 * The residue budget. Every token here keeps an open staff lane for a reason the REGISTRY stores,
 * and the guard prints that reason. The budget may shrink; it may never grow silently.
 *
 *  - ten tokens `iam.apply_rls` structurally refuses (six are `audit_class='machinery'` and own the
 *    inputs the access resolver consumes, three have no `id` column, one has a type mismatch);
 *  - ~~`user_secret`~~ CLOSED by DD-160 (2026-09-12). The RESTRICTIVE `platform_admin_select_only`
 *    wall is gone, the owner reads their own 39 secret field rows again, and a platform admin reads
 *    0 of 307. `credential_item` left the list in the same edit: DD-137b11 had already closed its
 *    policies and left `suppress_platform_admin_lane` false, which is the only reason this guard
 *    kept reporting it. The budget moves 13 -> 11 and may never move back up silently;
 *  - `wc_impairment_definition`, a registered COMPONENT with no composition parent. db-rules §6d-1
 *    requires one, so `iam.apply_rls` refuses the table outright and it keeps `auth_read` +
 *    `platform_admin_all`. It resolves `private` only because a parentless component has nothing to
 *    inherit; it is a legal reference catalogue, and the registry defect is what wants fixing.
 */
const RESIDUE_BUDGET = 12;

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

export interface StaffDoorRow {
  token: string;
  variant: string;
  resolved_class: string;
  has_admin_policy: boolean;
  has_staff_arm: boolean;
  declares_closed: boolean;
}

/** The pure rule, so --self-test can feed it rows it made up as well as rows it built for real. */
export function isStaffDoorOpen(row: StaffDoorRow): boolean {
  if (row.resolved_class !== "private" && row.resolved_class !== "confidential") return false;
  return row.has_admin_policy || row.has_staff_arm || !row.declares_closed;
}

const FINDINGS_SQL = `
select coalesce(json_agg(x order by x->>'token'), '[]'::json) as j from (
  select json_build_object(
    'token', et.token,
    'variant', et.rls_variant,
    'resolved_class', cl.resolved_class::text,
    'has_admin_policy', exists (
       select 1 from pg_policy p
        where p.polrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
          and p.polname = 'platform_admin_all'),
    'has_staff_arm', exists (
       select 1 from pg_policy p
        where p.polrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
          and p.polpermissive and p.polcmd in ('r','*')
          and coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ 'is_platform_admin|is_super_admin'),
    'declares_closed', et.suppress_platform_admin_lane,
    'reason', left(coalesce(et.data_class_reason, ''), 240)
  ) as x
  from platform.entity_types et
  -- ONE class_lanes call per token, not two: the resolver walks a recursive CTE now, and asking it
  -- twice per row over ~670 tokens is how this query met PostgREST's hard 8s ceiling.
  cross join lateral iam.class_lanes(et.token) cl
  where et.is_active
    and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
    and cl.resolved_class in ('private','confidential')
) q`;

async function selfTest(env: { url: string; key: string }): Promise<number> {
  console.log(`${C.b}SELF-TEST${C.x} ${C.d}(the detector must find an open staff lane on a private token, and must not flag a closed one)${C.x}`);
  let bad = 0;
  const base: StaffDoorRow = {
    token: "x", variant: "component", resolved_class: "private",
    has_admin_policy: false, has_staff_arm: false, declares_closed: true,
  };
  const cases: Array<[string, StaffDoorRow, boolean]> = [
    ["a platform_admin_all policy under a private class", { ...base, has_admin_policy: true }, true],
    ["a permissive staff READ arm under a private class", { ...base, has_staff_arm: true }, true],
    ["a private class that does not DECLARE the lane closed", { ...base, declares_closed: false }, true],
    ["a private token with the lane fully closed", base, false],
    ["an organization token with everything open", { ...base, resolved_class: "organization", has_admin_policy: true, has_staff_arm: true, declares_closed: false }, false],
  ];
  for (const [name, row, expected] of cases) {
    const got = isStaffDoorOpen(row);
    if (got !== expected) {
      console.log(`  ${C.r}✗${C.x} ${expected ? "RED " : "GREEN"} — ${name}: expected ${expected}, got ${got}`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} ${expected ? "RED " : "GREEN"} — ${name}`);
    }
  }

  // And the same two states built FOR REAL, so the SQL that feeds the detector is proven too.
  const schema = `zz_staff_door_selftest_${Date.now().toString(36)}`;
  const token = `${schema}_token`;
  try {
    await door(env, `create schema ${schema}`);
    await door(env, `create table ${schema}.probe (id uuid primary key default gen_random_uuid())`);
    await door(env, `alter table ${schema}.probe enable row level security`);
    await door(env, `insert into platform.entity_types
      (token, schema_name, table_name, label, rls_variant, is_active, is_listed, is_component,
       base_tier, is_versioned, has_soft_delete, data_class, default_list_scope, data_class_reason)
      values ('${token}', '${schema}', 'probe', 'self-test probe', 'entity', true, false, false,
              1, false, false, 'private', 'mine', 'check:staff-door self-test; deleted at the end of the run')`);
    await door(env, `update platform.entity_types set suppress_platform_admin_lane = true where token = '${token}'`);
    await door(env, `create policy platform_admin_all on ${schema}.probe for all to authenticated
                     using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()))`);

    const red = await door(env, FINDINGS_SQL.replace("where et.is_active", `where et.token = '${token}' and et.is_active`));
    const redRow = ((red[0] as { j?: StaffDoorRow[] })?.j ?? [])[0];
    if (!redRow || !isStaffDoorOpen(redRow)) {
      console.log(`  ${C.r}✗${C.x} RED  — the live query did not flag a real platform_admin_all under a private class`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} RED  — the live query flags a real platform_admin_all under a private class`);
    }

    await door(env, `drop policy platform_admin_all on ${schema}.probe`);
    const green = await door(env, FINDINGS_SQL.replace("where et.is_active", `where et.token = '${token}' and et.is_active`));
    const greenRow = ((green[0] as { j?: StaffDoorRow[] })?.j ?? [])[0];
    if (!greenRow || isStaffDoorOpen(greenRow)) {
      console.log(`  ${C.r}✗${C.x} GREEN — the live query still flags the table after the policy is gone`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} GREEN — the live query stops flagging it the moment the policy is dropped`);
    }
  } finally {
    // The teardown is not optional: a leftover registered token would break every other guard.
    try { await door(env, `delete from platform.entity_types where token = '${token}'`); } catch { /* reported below */ }
    try { await door(env, `drop schema if exists ${schema} cascade`); } catch { /* reported below */ }
    const left = await door(env, `select count(*)::int as n from platform.entity_types where token = '${token}'`);
    if (Number((left[0] as { n?: number })?.n ?? 0) !== 0) {
      console.log(`  ${C.r}✗${C.x} the self-test left its scratch token behind — remove '${token}' by hand`); bad++;
    }
  }

  console.log(bad === 0
    ? `${C.g}✓${C.x} ${C.b}the detector fails when it should and passes when it should${C.x}`
    : `${C.r}✗${C.x} ${C.b}the detector is not trustworthy${C.x}`);
  return bad === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  console.log(`${C.b}THE STAFF DOOR${C.x} ${C.d}(DD-137b — our own staff go through the door too, components included)${C.x}`);
  const env = loadEnv();
  if (!env) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. This is a FAILURE, not a pass.`);
    return STRICT ? 1 : 0;
  }
  if (SELF_TEST) return selfTest(env);

  let rows: Array<StaffDoorRow & { reason?: string }>;
  try {
    const res = await door(env, FINDINGS_SQL);
    rows = ((res[0] as { j?: Array<StaffDoorRow & { reason?: string }> })?.j ?? []);
  } catch (e) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the structural query failed: ${String(e)}`);
    return STRICT ? 1 : 0;
  }
  if (rows.length === 0) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — no private/confidential token came back at all, which cannot be right`);
    return STRICT ? 1 : 0;
  }

  const open = rows.filter(isStaffDoorOpen);
  const byVariant = new Map<string, number>();
  for (const r of rows) byVariant.set(r.variant, (byVariant.get(r.variant) ?? 0) + 1);

  console.log(`  ${C.d}${rows.length} tokens resolve to private or confidential (${[...byVariant].map(([v, n]) => `${v}: ${n}`).join(", ")})${C.x}`);

  let findings = 0;
  if (open.length > RESIDUE_BUDGET) {
    findings++;
    console.error(`  ${C.r}✗${C.x} ${open.length} of them still let our own staff read with no door — the frozen budget is ${RESIDUE_BUDGET}`);
  } else if (open.length === 0) {
    console.log(`  ${C.g}✓${C.x} no private or confidential token lets our own staff read with no door`);
  } else {
    console.log(`  ${C.g}✓${C.x} ${open.length} open, at or under the frozen budget of ${RESIDUE_BUDGET} — every one is printed below with the reason the registry stores`);
  }
  for (const r of open) {
    const why = [
      r.has_admin_policy ? "platform_admin_all" : "",
      r.has_staff_arm ? "staff read arm" : "",
      !r.declares_closed ? "does not declare it closed" : "",
    ].filter(Boolean).join(" + ");
    console.log(`     ${C.d}${r.token} (${r.variant}, ${r.resolved_class}): ${why}${C.x}`);
    if (r.reason) console.log(`       ${C.d}${r.reason.slice(0, 160)}${C.x}`);
  }

  // A component that resolves private/confidential must never carry the lane. This is the exact
  // twin of check:admin-door's org-admin component assertion, and its absence is why that guard
  // stayed green while 131,763 messages were readable.
  const openComponents = open.filter((r) => r.variant === "component" || r.variant === "ledger");
  if (openComponents.length > 0) {
    findings++;
    console.error(`  ${C.r}✗${C.x} ${openComponents.length} COMPONENT/LEDGER tokens under a private or confidential parent still carry the staff lane — a component asks its parent (db-rules §6d-1): ${openComponents.map((r) => r.token).slice(0, 12).join(", ")}`);
  } else {
    console.log(`  ${C.g}✓${C.x} no component or ledger under a private or confidential parent carries the staff lane`);
  }

  if (findings === 0) {
    console.log(`${C.g}✓${C.x} ${C.b}the staff door is shut${C.x}`);
    return 0;
  }
  console.log(`${C.r}✗${C.x} ${C.b}${findings} finding(s)${C.x}`);
  return STRICT ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(`${C.r}✗${C.x} check:staff-door crashed: ${String(e)}`);
  process.exit(1);
});
