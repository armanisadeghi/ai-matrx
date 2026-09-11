#!/usr/bin/env npx tsx
/**
 * Scope access membrane liveness — can somebody read a record they were never given?
 *
 * WHAT IT PROTECTS: the B-7 membrane installed by
 * migrations/ctx_scope_access_membrane_b7.sql — `context._scope_readable` /
 * `_scope_readable_for` / `_assert_scope_readable`, the eight SECURITY DEFINER
 * doors that serve a scope's cell values, and the generated `component` RLS lane
 * on `context.context_item_values` over its parent `scope`.
 *
 * WHY IT EXISTS (live, 2026-09-11, rolled-back probes on brsgrqvjdzwihsvnfqkf):
 * a scope marked `personal` was correctly invisible to a non-creator member at
 * the table — and `public.get_scope_context`, a SECURITY DEFINER function that
 * authorized on organization membership alone, handed that same member 16
 * populated cells of it. RLS DOES NOT RUN INSIDE A SECURITY DEFINER FUNCTION, so
 * the table policy that everyone reasons about was never the thing standing in
 * the way. A census the same day found 59 SECURITY DEFINER functions reading the
 * scopes tables and ZERO calling `iam.has_access('scope', …)`.
 *
 * The same run found the defect's mirror image: a real `viewer` grant in
 * `iam.permissions` opened the record and yielded ZERO values and ZERO field
 * labels — a share that hands over an empty shell. Both directions are closed by
 * the same change, and both are what this gate keeps closed.
 *
 * WHY A LIVE PULL AND NOT A SOURCE SCAN: a function body lives in the catalog,
 * not on disk. Any `CREATE OR REPLACE`, from any session or any repo, can lift
 * the membrane out of a door while the .sql file here keeps looking exactly
 * right, and `iam.apply_rls` re-run with the wrong variant silently replaces the
 * component lane. Reading the file would prove nothing (db-rules FEATURE.md §1).
 *
 *   pnpm check:scope-access-membrane            # loud, exit 0
 *   pnpm check:scope-access-membrane:strict     # exit 1 on ANY finding (CI)
 *
 * PROVEN FAILING (2026-09-11, one rolled-back transaction, four injected
 * regressions): the membrane stripped out of `get_scope_context`, a new
 * unreviewed DEFINER door created, `select` granted back to `anon`, and the
 * generated `std_select` replaced by a hand-written organization-wide predicate.
 * The gate returned `value_doors_carry_membrane` FAIL naming
 * `public.get_scope_context`, `no_unreviewed_scope_doors` FAIL naming
 * `public.b7_fake_new_door`, `values_policies_are_generated_component_lane` FAIL
 * and `no_anon_grants_on_values` FAIL naming SELECT. After rollback: six of six
 * green.
 *
 * 🚨 UNMEASURED IS NOT PASSED — same rule as check-soft-delete-cascade.ts: when
 * the live pull cannot run, this reports UNMEASURED and fails under --strict,
 * never a warning that reads like a pass.
 *
 * Exit codes:
 *   0  every check ok, OR findings/unmeasured in default (advisory) mode
 *   1  findings, missing checks, or an unmeasured run AND --strict
 *   2  the script itself crashed
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "__scope_access_membrane_conformance";
const TIMEOUT_MS = 15_000;
const STRICT = process.argv.includes("--strict");

/**
 * The checks the deployed function is contracted to return. An absent key is a
 * finding in its own right: a function quietly replaced by a shorter one that
 * measures less would otherwise read as a clean pass.
 */
const EXPECTED_CHECKS = [
  // The three helpers exist and are SECURITY DEFINER. As INVOKER they would ask
  // the question through the caller's own RLS and answer "no" to everybody.
  "membrane_helpers_installed",
  // THE CLASS: every DEFINER door whose body names context.context_item_values
  // calls the membrane. This is the check that would have caught the original
  // defect on the day it shipped.
  "value_doors_carry_membrane",
  // THE FUTURE: a DEFINER function reading the scopes tables that is neither
  // membraned nor on the reviewed list in the migration. Education functions,
  // scope-type/org-lane functions and create/own functions are listed there WITH
  // the reason each does not need the assert.
  "no_unreviewed_scope_doors",
  // context.context_item_values is registered as a component of `scope`, with
  // exactly ONE composition parent. A second parent (context_item) would OR an
  // org-wide id set back into the read lane and undo the membrane.
  "values_registered_as_component_of_scope",
  // The live policies are the GENERATED component set, resolving the parent id
  // set once per query (THE COMPONENT-ACCESS PRECEDENT, 2026-08-08) — not a
  // hand-written twin and not the retired organization-membership predicate.
  "values_policies_are_generated_component_lane",
  // anon holds nothing on the table. It held SELECT+INSERT+UPDATE+DELETE until
  // 2026-09-11, with only RLS between an anonymous caller and customer data.
  "no_anon_grants_on_values",
] as const;

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

interface ConformanceRow {
  readonly check_key: string;
  readonly ok: boolean;
  readonly severity?: string;
  readonly detail: Record<string, unknown> | null;
}

/**
 * Secret key WINS over the publishable one regardless of file order: EXECUTE on
 * this RPC is granted to service_role and never to anon, so the publishable key
 * answers 401 and the gate would report itself UNMEASURED against a perfectly
 * healthy database. Same resolution order as check-soft-delete-cascade.ts.
 */
function loadSupabaseEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    let secret = "";
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!secret && m[1] === "SUPABASE_SECRET_KEY") secret = v;
      }
      if (url && secret) break;
    }
    if (!key) key = secret;
  }
  return url && key ? { url, key } : null;
}

function isRow(value: unknown): value is ConformanceRow {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.check_key === "string" && typeof r.ok === "boolean";
}

async function fetchConformance(): Promise<
  { rows: ConformanceRow[]; failure: null } | { rows: null; failure: string }
> {
  const env = loadSupabaseEnv();
  if (!env) return { rows: null, failure: "no Supabase URL/secret key in env or .env* files" };

  const endpoint = `${env.url.replace(/\/$/, "")}/rest/v1/rpc/${RPC}`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Profile": "public",
        "Accept-Profile": "public",
      },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        rows: null,
        failure: `rpc/${RPC} returned ${res.status}: ${(await res.text()).slice(0, 300)}`,
      };
    }
    const parsed: unknown = JSON.parse(await res.text());
    if (!Array.isArray(parsed)) return { rows: null, failure: `rpc/${RPC} did not return an array` };
    const rows = parsed.filter(isRow);
    if (rows.length !== parsed.length) {
      return { rows: null, failure: `rpc/${RPC} returned rows that are not {check_key, ok, ...}` };
    }
    return { rows, failure: null };
  } catch (err) {
    return {
      rows: null,
      failure: `could not reach Supabase at ${endpoint} (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

function renderDetail(detail: Record<string, unknown> | null): string[] {
  if (!detail) return [];
  const lines: string[] = [];
  const why = detail.why;
  if (typeof why === "string" && why.trim()) lines.push(`${C.dim}${why.trim()}${C.reset}`);
  for (const [k, v] of Object.entries(detail)) {
    if (k === "why") continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}: ${v.map((i) => JSON.stringify(i)).join(", ")}`);
    } else if (v !== null && v !== undefined && v !== "") {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  return lines;
}

function unmeasured(reason: string): never {
  console.log("");
  console.log(`${TAG.fail}${C.bold}${C.red}LIVE PULL FAILED — SCOPE ACCESS MEMBRANE UNMEASURED${C.reset}`);
  console.log(`  ${C.dim}${reason}${C.reset}`);
  console.log(`  ${C.dim}Unmeasured is not passed: this gate says nothing about the database right now.${C.reset}`);
  console.log("");
  process.exit(STRICT ? 1 : 0);
}

async function main(): Promise<number> {
  const result = await fetchConformance();
  if (result.rows === null) unmeasured(result.failure);

  const rows = result.rows;
  if (rows.length === 0) unmeasured(`rpc/${RPC} returned zero rows — it measured nothing`);

  const byKey = new Map(rows.map((r) => [r.check_key, r]));
  const missing = EXPECTED_CHECKS.filter((k) => !byKey.has(k));
  const failed = rows.filter((r) => !r.ok);

  console.log("");
  console.log(`${C.bold}Scope access membrane liveness${C.reset} ${C.dim}(public.${RPC})${C.reset}`);

  for (const key of EXPECTED_CHECKS) {
    const row = byKey.get(key);
    if (!row) {
      console.log(`  ${TAG.fail}${key} ${C.dim}— NOT RETURNED by the function${C.reset}`);
      continue;
    }
    if (row.ok) {
      console.log(`  ${TAG.ok}${key}`);
      continue;
    }
    console.log(`  ${TAG.fail}${key}`);
    for (const line of renderDetail(row.detail)) console.log(`        ${line}`);
  }

  // A key the function returns that this file does not know about is not a
  // failure — it is a new check whose key belongs in EXPECTED_CHECKS.
  for (const r of rows) {
    if (!EXPECTED_CHECKS.includes(r.check_key as (typeof EXPECTED_CHECKS)[number])) {
      console.log(
        `  ${TAG.info}unlisted  ${r.check_key} ${C.dim}— add it to EXPECTED_CHECKS in scripts/check-scope-access-membrane.ts${C.reset}`,
      );
    }
  }

  console.log("");
  if (failed.length === 0 && missing.length === 0) {
    console.log(`${TAG.ok}A record's values go only to people who can open the record.`);
    console.log("");
    return 0;
  }

  console.log(
    `${TAG.fail}${C.bold}${C.red}THE SCOPE ACCESS MEMBRANE IS NOT INTACT — ${failed.length} failing check(s), ${missing.length} missing check(s)${C.reset}`,
  );
  console.log(`  ${C.dim}A SECURITY DEFINER function runs with no RLS at all. A door here that asks${C.reset}`);
  console.log(`  ${C.dim}"are you in the organization?" instead of "can you open this record?" hands a${C.reset}`);
  console.log(`  ${C.dim}personal or un-shared case file to every colleague — including through an agent${C.reset}`);
  console.log(`  ${C.dim}assembling context under acting_as_user (measured on get_scope_context, 2026-09-11).${C.reset}`);
  console.log(`  ${C.dim}Fix: re-apply migrations/ctx_scope_access_membrane_b7.sql (idempotent), then re-run.${C.reset}`);
  console.log("");
  return STRICT ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${TAG.fail}check-scope-access-membrane crashed:`, err);
    process.exit(2);
  },
);
