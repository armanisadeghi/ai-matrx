#!/usr/bin/env npx tsx
/**
 * THE SELF-REFERENCE WALL — no RLS policy may read the relation it guards.
 *
 * WHY THIS EXISTS (a live outage, 2026-09-12)
 * -------------------------------------------
 * At 11:10:40Z `iam_admin_lane_honours_personal_visibility_dd136.sql` step 7
 * regenerated every registered table through `iam.apply_rls`. For
 * `platform.rulebook` and `seo.starter_pack` that was the FIRST regeneration
 * since 2026-08-29, when `iam.entity_read_expr` gained an industry-curator
 * candidate lane shaped like this:
 *
 *     select rb.id from platform.rulebook rb
 *       join iam.industry_curators ic on ic.industry_id = rb.industry_id
 *      where ic.user_id = (select auth.uid()) and rb.deleted_at is null
 *
 * — inside the `std_select` policy ON `platform.rulebook`. Postgres answers a
 * policy that selects from its own relation with
 *
 *     42P17  infinite recursion detected in policy for relation "rulebook"
 *
 * and refuses the statement. Not slow, not subtly wrong: every signed-in read
 * of the table returned HTTP 500, for everyone, until the generator was fixed
 * (migrations/rls_curator_lane_definer_door_no_self_reference.sql).
 *
 * The lane sat latent in the generator for fourteen days. Nothing could see it,
 * because a generator is not a policy — it only becomes one at the next
 * `iam.apply_rls`. This gate looks at what is actually DEPLOYED, which is the
 * only place the defect is real.
 *
 * THE RULE
 * --------
 * A policy's `qual` / `with_check` may reference any relation EXCEPT the one it
 * is attached to. When a lane genuinely needs the entity's own rows, it goes
 * through a SECURITY DEFINER door (RLS off inside the function, so no
 * re-entry) — `public.is_rulebook_curator`, `public.is_pack_curator`,
 * `iam.has_access`. That is how the access kernel itself does it.
 *
 * DETECTION
 * ---------
 * `pg_get_expr` renders every policy expression with relations qualified, so a
 * self-reference always shows up as a FROM/JOIN against the policy's own
 * `schema.table` (or the bare table name where the schema is in the render
 * path). There is no cheaper, more exact signal: `pg_depend` records a row for
 * every COLUMN of the policy's own table as well, so it cannot distinguish a
 * column reference from a self-join, and EXPLAIN cannot be run against a
 * policy in isolation. So: exact, deterministic text over the rendered
 * expression, the same predicate the generator now enforces at build time.
 *
 *   pnpm check:rls-self-reference              # loud, non-blocking (exit 0)
 *   pnpm check:rls-self-reference --strict     # exit 1 on any finding
 *   pnpm check:rls-self-reference --self-test  # prove the detector can fail
 *
 * Exit codes: 0 clean (or creds absent, which prints UNMEASURED) · 1 a
 *             self-referencing policy AND --strict, or a failed --self-test
 *             · 2 unexpected error (DB unreachable)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { unwrapRows } from "../lib/integrity/unwrap";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

/**
 * THE ONE PREDICATE. Shared verbatim with `iam.entity_read_expr`'s build-time
 * wall so the generator and this gate can never disagree about what counts.
 */
function selfReferencePattern(schema: string, table: string): RegExp {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(from|join)\\s*\\(?\\s*(${esc(schema)}\\.)?${esc(table)}([^a-z0-9_]|$)`,
    "i",
  );
}

export function readsItsOwnTable(
  schema: string,
  table: string,
  expression: string,
): boolean {
  return selfReferencePattern(schema, table).test(expression);
}

const LIVE_QUERY = `
select n.nspname                                        as schema_name,
       c.relname                                        as table_name,
       pol.polname                                      as policy_name,
       case pol.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                       when 'w' then 'UPDATE' when 'd' then 'DELETE'
                       else 'ALL' end                   as cmd,
       coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')      as using_expr,
       coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as check_expr
from pg_policy pol
join pg_class c     on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
order by 1, 2, 3
`;

interface PolicyRow {
  schema_name: string;
  table_name: string;
  policy_name: string;
  cmd: string;
  using_expr: string;
  check_expr: string;
}

function loadEnv(): { url: string; key: string } | null {
  const env: Record<string, string> = {};
  const want = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
  for (const k of want) if (process.env[k]) env[k] = process.env[k] as string;

  if (!env.SUPABASE_SECRET_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
    for (const f of [
      ".env.local",
      ".env.production.local",
      ".env.production",
      ".env",
    ]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        if (want.includes(k) && !env[k])
          env[k] = (raw ?? "").replace(/^['"]|['"]$/g, "");
      }
    }
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = env.SUPABASE_SECRET_KEY ?? "";
  return url && key ? { url, key } : null;
}

/**
 * THE FALSIFIABILITY PROOF. Two planted cases, both taken verbatim from the
 * live outage, plus the shapes that must NOT trip it. A detector that cannot
 * fail is worse than no detector (common-docs/policies/conversion-campaigns.md
 * § Law 4b), so this runs the real predicate against known-bad and known-good
 * text and exits 1 if either verdict is wrong.
 */
function selfTest(): number {
  const cases: Array<{
    label: string;
    schema: string;
    table: string;
    expr: string;
    expect: boolean;
  }> = [
    {
      label: "the outage itself — rulebook std_select curator arm",
      schema: "platform",
      table: "rulebook",
      expr: "(id IN ( SELECT g.entity_id FROM platform.entity_grants g\nUNION\n SELECT rb.id\n   FROM (platform.rulebook rb\n     JOIN iam.industry_curators ic ON ((ic.industry_id = rb.industry_id)))\n  WHERE (ic.user_id = ( SELECT auth.uid() AS uid))))",
      expect: true,
    },
    {
      label: "its twin — starter_pack std_select curator arm",
      schema: "seo",
      table: "starter_pack",
      expr: "( SELECT sp.id FROM (seo.starter_pack sp JOIN iam.industry_curators ic ON ((ic.industry_id = sp.industry_id))) WHERE (ic.user_id = ( SELECT auth.uid() AS uid)))",
      expect: true,
    },
    {
      label: "the latent third — memberships via the membership candidate",
      schema: "iam",
      table: "memberships",
      expr: "(id IN ( SELECT m.container_id FROM iam.memberships m WHERE (m.container_type = 'membership'::text)))",
      expect: true,
    },
    {
      label: "the fix — the same lane through the SECURITY DEFINER door",
      schema: "platform",
      table: "rulebook",
      expr: "(is_rulebook_curator(( SELECT auth.uid() AS uid), id) OR (id IN ( SELECT g.entity_id FROM platform.entity_grants g)))",
      expect: false,
    },
    {
      label: "a policy reading OTHER tables only",
      schema: "platform",
      table: "rulebook",
      expr: "(organization_id IN ( SELECT om.organization_id FROM iam.organization_member om WHERE (om.user_id = ( SELECT auth.uid() AS uid))))",
      expect: false,
    },
    {
      label: "a same-named table in a DIFFERENT schema is not a self-reference",
      schema: "graveyard",
      table: "rulebook",
      expr: "(id IN ( SELECT rb.id FROM platform.rulebook rb))",
      expect: false,
    },
    {
      label: "a longer name that merely starts with the table name",
      schema: "platform",
      table: "rulebook",
      expr: "(id IN ( SELECT r.id FROM platform.rulebook_section r))",
      expect: false,
    },
  ];

  let failed = 0;
  console.log(`${C.bold}RLS self-reference detector — self-test${C.reset}\n`);
  for (const c of cases) {
    const got = readsItsOwnTable(c.schema, c.table, c.expr);
    const ok = got === c.expect;
    if (!ok) failed++;
    console.log(
      `  ${ok ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`}  ` +
        `expected ${c.expect ? "FINDING" : "clean"}, got ${got ? "FINDING" : "clean"}  ${C.dim}${c.label}${C.reset}`,
    );
  }
  console.log();
  if (failed > 0) {
    console.log(
      `${C.red}${C.bold}${failed} self-test case(s) wrong — the detector does not detect what it claims.${C.reset}`,
    );
    return 1;
  }
  console.log(
    `${C.green}All ${cases.length} cases correct — the detector fires on the real outage text and stays quiet on the fix.${C.reset}`,
  );
  return 0;
}

async function main(): Promise<number> {
  if (SELF_TEST) return selfTest();

  const env = loadEnv();
  if (!env) {
    // UNMEASURED is a failure to know, never a pass. It exits 0 only because
    // the local lane runs without credentials; CI carries them.
    console.log(
      `${C.yellow}${C.bold}UNMEASURED${C.reset} — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY, so no live policy was read. This is not a pass.`,
    );
    return 0;
  }

  const supabase = createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let rows: PolicyRow[];
  try {
    const { data, error } = await supabase.rpc("execute_admin_query", {
      query: LIVE_QUERY,
    });
    if (error) throw new Error(error.message);
    rows = unwrapRows(data) as unknown as PolicyRow[];
  } catch (err) {
    console.error(
      `${C.red}${C.bold}ERROR${C.reset} could not read pg_policy: ${(err as Error).message}`,
    );
    return 2;
  }

  const findings = rows.filter(
    (r) =>
      readsItsOwnTable(r.schema_name, r.table_name, r.using_expr) ||
      readsItsOwnTable(r.schema_name, r.table_name, r.check_expr),
  );

  if (findings.length === 0) {
    console.log(
      `${C.green}${C.bold}OK${C.reset} ${rows.length} live policies, none reads its own relation.`,
    );
    return 0;
  }

  console.log(
    `${C.red}${C.bold}${findings.length} POLICY/POLICIES READ THEIR OWN RELATION${C.reset} — every read of these tables raises 42P17 (HTTP 500) for every non-superuser role.\n`,
  );
  for (const f of findings) {
    const which = readsItsOwnTable(f.schema_name, f.table_name, f.using_expr)
      ? "USING"
      : "WITH CHECK";
    const expr =
      which === "USING" ? f.using_expr : f.check_expr;
    const m = expr.match(selfReferencePattern(f.schema_name, f.table_name));
    console.log(
      `  ${C.red}${f.schema_name}.${f.table_name}${C.reset} policy ${C.bold}${f.policy_name}${C.reset} (${f.cmd}) — ${which} reads ${f.schema_name}.${f.table_name}`,
    );
    if (m) {
      const at = m.index ?? 0;
      console.log(
        `    ${C.dim}…${expr.slice(Math.max(0, at - 60), at + 120).replace(/\s+/g, " ")}…${C.reset}`,
      );
    }
  }
  console.log(
    `\n  ${C.cyan}Fix:${C.reset} route the lane through a SECURITY DEFINER door (the access kernel's own pattern — public.is_rulebook_curator, iam.has_access), never a join on the entity itself. If it came out of iam.entity_read_expr, fix the GENERATOR and re-run iam.apply_rls, or every regeneration reintroduces it.`,
  );
  return STRICT ? 1 : 0;
}

// Only run when invoked as a script — `readsItsOwnTable` is exported so other
// checks (and proofs against captured production text) can reuse the ONE
// predicate without executing the gate.
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(2);
    },
  );
}
