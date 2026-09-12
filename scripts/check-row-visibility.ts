#!/usr/bin/env npx tsx
/**
 * THE PERSONAL-ROW WALL — a personal row stays personal INSIDE an organization table.
 *
 * WHY THIS EXISTS (V-43 §A, 2026-09-12)
 * -------------------------------------
 * `check:staff-door` asserts that a token whose CLASS is `private` or `confidential` carries no
 * platform-staff lane. That is a per-TOKEN rule, and it is why this defect went straight through it:
 *
 *     note (workbench.notes), class `organization`, keeps platform_admin_all
 *       universe of OTHER people's visibility='personal' notes .... 137
 *       readable by a platform admin ..............................  137
 *
 * The class is decided per token; `visibility='personal'` is decided per ROW, and nothing joined the
 * two. Arman, 2026-09-12: an admin cannot read a person's private data. So the chair's ruling is
 * that the class sets the DEFAULT lane set and a row's `visibility` only NARROWS it — DD-165.
 *
 * `check:staff-door` is the TOKEN axis of the same wall and this is the ROW axis. They are separate
 * guards on purpose: staff-door's population is private/confidential tokens, and this one's
 * population is exactly the tokens staff-door does not look at — the unsuppressed ones that carry a
 * typed `platform.visibility` column (179 of them today, holding 15,106 `personal` rows).
 *
 * WHAT THIS GUARD ASSERTS, for every active token that is NOT suppressed and carries a typed
 * `platform.visibility` column:
 *   A. `platform_admin_all`'s USING excludes `visibility='personal'` — that policy is PERMISSIVE and
 *      grants everything on its own, so an arm-only check would miss it entirely;
 *   B. no permissive policy on the table carries an UNWALLED `is_platform_admin()` arm;
 *   C. no permissive policy carries an UNWALLED `is_super_admin()` arm, except the system-org arm
 *      (recognised by `system_orgs` in the same expression), which can only ever match a row owned by
 *      a global_readable SYSTEM organization — platform content, never a customer's person. That arm
 *      is named residue in the DD-165 report, not a silent exemption: it is mirrored from
 *      `iam.has_access_for_base`, and walling the mirror alone would change no access at all.
 *
 * Known-open rows are NOT silently excused. They are printed by name with the reason, and the list
 * fails in BOTH directions — an unexpected token open is a finding, and an expected one CLOSING is a
 * finding too, so the list shrinks deliberately in a commit instead of rotting into folklore.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS.
 *
 *   pnpm check:row-visibility             # loud, non-blocking (exit 0)
 *   pnpm check:row-visibility --strict    # exit 1 on any finding or UNMEASURED
 *   pnpm check:row-visibility --self-test # RED then GREEN against the real database
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

/**
 * THE RESIDUE, BY NAME — never a count.
 *
 * Both are tokens `iam.apply_rls` refuses BY CONSTRUCTION, so they keep their bespoke policies AND
 * their unwalled staff arm. Both are already named residue on `check:staff-door` and in DD-137b.
 *  - `access_request` — `audit_class='machinery'`: it owns inputs the access resolver consumes, and
 *    db-rules §6d forbids generic RLS on machinery;
 *  - `wbx_guidance`, `wbx_demo` — both refuse with `42883 operator does not exist: text = uuid`, the
 *    same type mismatch in the same `extend` pair. DD-137b's residue list names only `wbx_guidance`
 *    because `check:staff-door`'s population is private/confidential tokens and `wbx_demo` is classed
 *    `organization` — which is precisely the blind spot DD-165 exists to cover, and this guard found
 *    its twin on the first run. Neither holds a `visibility='personal'` row today (0 and 0, measured
 *    2026-09-12); the REGISTRY/column defect is the thing to fix, not the policy.
 */
const RESIDUE_TOKENS: ReadonlySet<string> = new Set(["access_request", "wbx_guidance", "wbx_demo"]);

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

/** The two shapes `iam.apply_rls` emits for a walled staff arm, as `pg_get_expr` renders them. */
const W_ADMIN = "(visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)";
const W_SUPER = "(visibility >= 'internal'::platform.visibility) AND is_super_admin()";

export interface PolicyRow { polname: string; qual: string }
export interface RowVisibilityRow {
  token: string;
  variant: string;
  policies: PolicyRow[];
}

/** The pure rule, so --self-test can feed it rows it made up as well as rows it built for real. */
export function unwalledArms(row: RowVisibilityRow): string[] {
  const bad: string[] = [];
  for (const p of row.policies) {
    const q = (p.qual ?? "").replace(/\s+/g, " ");
    if (p.polname === "platform_admin_all" && !q.includes(W_ADMIN)) {
      bad.push(`${p.polname}: USING does not exclude visibility='personal'`);
      continue;
    }
    const rest = q.split(W_ADMIN).join("").split(W_SUPER).join("");
    if (rest.includes("is_platform_admin")) bad.push(`${p.polname}: unwalled platform-admin arm`);
    else if (rest.includes("is_super_admin") && !q.includes("system_orgs")) {
      bad.push(`${p.polname}: unwalled super-admin arm`);
    }
  }
  return bad;
}

const FINDINGS_SQL = `
select coalesce(json_agg(x order by x->>'token'), '[]'::json) as j from (
  select json_build_object(
    'token', et.token,
    'variant', et.rls_variant,
    'policies', coalesce((
       select json_agg(json_build_object('polname', p.polname,
                                         'qual', coalesce(pg_get_expr(p.polqual, p.polrelid), ''))
                        order by p.polname)
         from pg_policy p
        where p.polrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
          and p.polpermissive), '[]'::json)
  ) as x
  from platform.entity_types et
  join information_schema.columns c
    on c.table_schema = et.schema_name and c.table_name = et.table_name
   and c.column_name = 'visibility' and c.udt_schema = 'platform' and c.udt_name = 'visibility'
  where et.is_active
    and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
    and not coalesce(et.suppress_platform_admin_lane, false)
) q`;

async function selfTest(env: { url: string; key: string }): Promise<number> {
  console.log(`${C.b}SELF-TEST${C.x} ${C.d}(the detector must find an unwalled staff arm on a visibility table, and must not flag a walled one)${C.x}`);
  let bad = 0;
  const cases: Array<[string, RowVisibilityRow, boolean]> = [
    ["a bare platform_admin_all on a visibility table",
      { token: "x", variant: "entity", policies: [{ polname: "platform_admin_all", qual: "( SELECT is_platform_admin() AS is_platform_admin)" }] }, true],
    ["a walled platform_admin_all",
      { token: "x", variant: "entity", policies: [{ polname: "platform_admin_all", qual: `(${W_ADMIN})` }] }, false],
    ["a std_select whose admin arm is unwalled",
      { token: "x", variant: "entity", policies: [{ polname: "std_select", qual: "(( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid)))" }] }, true],
    ["a std_select whose admin arm is walled",
      { token: "x", variant: "entity", policies: [{ polname: "std_select", qual: `((${W_ADMIN}) OR (created_by = ( SELECT auth.uid() AS uid)))` }] }, false],
    ["a restricted std_select with a bare super-admin arm",
      { token: "x", variant: "restricted", policies: [{ polname: "std_select", qual: `((${W_ADMIN}) OR (created_by = ( SELECT auth.uid() AS uid)) OR is_super_admin())` }] }, true],
    ["the system-org super-admin arm, which is mirrored from the kernel and named residue",
      { token: "x", variant: "entity", policies: [{ polname: "std_select", qual: `((${W_ADMIN}) OR ((organization_id IS NOT NULL) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable))))` }] }, false],
  ];
  for (const [name, row, expected] of cases) {
    const got = unwalledArms(row).length > 0;
    if (got !== expected) {
      console.log(`  ${C.r}✗${C.x} ${expected ? "RED " : "GREEN"} — ${name}: expected ${expected}, got ${got}`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} ${expected ? "RED " : "GREEN"} — ${name}`);
    }
  }

  // And the same two states built FOR REAL, so the SQL that feeds the detector is proven too.
  const schema = `zz_row_visibility_selftest_${Date.now().toString(36)}`;
  const token = `${schema}_token`;
  try {
    await door(env, `create schema ${schema}`);
    await door(env, `create table ${schema}.probe (id uuid primary key default gen_random_uuid(),
                     created_by uuid, organization_id uuid,
                     visibility platform.visibility not null default 'personal')`);
    await door(env, `alter table ${schema}.probe enable row level security`);
    await door(env, `insert into platform.entity_types
      (token, schema_name, table_name, label, rls_variant, is_active, is_listed, is_component,
       base_tier, is_versioned, has_soft_delete, data_class, default_list_scope, data_class_reason)
      values ('${token}', '${schema}', 'probe', 'self-test probe', 'entity', true, false, false,
              1, false, false, 'organization', 'organization',
              'check:row-visibility self-test; deleted at the end of the run')`);
    await door(env, `create policy platform_admin_all on ${schema}.probe for all to authenticated
                     using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()))`);

    const pull = async (): Promise<RowVisibilityRow | undefined> => {
      const res = await door(env, FINDINGS_SQL.replace("where et.is_active", `where et.token = '${token}' and et.is_active`));
      return ((res[0] as { j?: RowVisibilityRow[] })?.j ?? [])[0];
    };

    const redRow = await pull();
    if (!redRow || unwalledArms(redRow).length === 0) {
      console.log(`  ${C.r}✗${C.x} RED  — the live query did not flag a real bare platform_admin_all on a visibility table`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} RED  — the live query flags a real bare platform_admin_all on a visibility table`);
    }

    await door(env, `drop policy platform_admin_all on ${schema}.probe`);
    await door(env, `create policy platform_admin_all on ${schema}.probe for all to authenticated
                     using ((visibility >= 'internal'::platform.visibility) and (select public.is_platform_admin()))
                     with check ((select public.is_platform_admin()))`);
    const greenRow = await pull();
    if (!greenRow || unwalledArms(greenRow).length > 0) {
      console.log(`  ${C.r}✗${C.x} GREEN — the live query still flags the table once the arm is walled: ${greenRow ? unwalledArms(greenRow).join("; ") : "no row"}`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} GREEN — the live query stops flagging it the moment the arm is walled`);
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
  console.log(`${C.b}THE PERSONAL-ROW WALL${C.x} ${C.d}(DD-165 — a personal row stays personal inside an organization table)${C.x}`);
  const env = loadEnv();
  if (!env) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. This is a FAILURE, not a pass.`);
    return STRICT ? 1 : 0;
  }
  if (SELF_TEST) return selfTest(env);

  let rows: RowVisibilityRow[];
  try {
    const res = await door(env, FINDINGS_SQL);
    rows = ((res[0] as { j?: RowVisibilityRow[] })?.j ?? []);
  } catch (e) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the structural query failed: ${String(e)}`);
    return STRICT ? 1 : 0;
  }
  if (rows.length === 0) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — not one unsuppressed token with a typed visibility column came back, which cannot be right`);
    return STRICT ? 1 : 0;
  }

  console.log(`  ${C.d}${rows.length} active tokens are unsuppressed AND carry a typed platform.visibility column${C.x}`);

  const open = rows.map((r) => ({ row: r, bad: unwalledArms(r) })).filter((x) => x.bad.length > 0);
  const unexpected = open.filter((x) => !RESIDUE_TOKENS.has(x.row.token));
  const closed = [...RESIDUE_TOKENS].filter((t) => !open.some((x) => x.row.token === t));

  let findings = 0;
  if (unexpected.length > 0) {
    findings++;
    console.error(`  ${C.r}✗${C.x} ${unexpected.length} token(s) let a platform admin read a person's \`personal\` row and are NOT known residue`);
  } else if (open.length === 0) {
    console.log(`  ${C.g}✓${C.x} no token lets a platform admin read a person's \`personal\` row`);
  } else {
    console.log(`  ${C.g}✓${C.x} the ${open.length} open tokens are EXACTLY the known residue`);
  }
  if (closed.length > 0) {
    findings++;
    console.error(`  ${C.y}!${C.x} ${closed.length} expected-residue token(s) are now WALLED: ${closed.join(", ")}. Good news — remove them from RESIDUE_TOKENS here and from v_expected in migrations/iam_personal_row_wall_dd165g_gate.sql, in the same commit. A residue list that quietly shrinks is a residue list nobody re-reads.`);
  }
  for (const x of open) {
    const mark = RESIDUE_TOKENS.has(x.row.token) ? `${C.d}` : `${C.r}UNEXPECTED ${C.x}${C.d}`;
    console.log(`     ${mark}${x.row.token} (${x.row.variant}): ${x.bad.join("; ")}${C.x}`);
  }

  if (findings === 0) {
    console.log(`${C.g}✓${C.x} ${C.b}a personal row stays personal${C.x}`);
    return 0;
  }
  console.log(`${C.r}✗${C.x} ${C.b}${findings} finding(s)${C.x}`);
  return STRICT ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(`${C.r}✗${C.x} check:row-visibility crashed: ${String(e)}`);
  process.exit(1);
});
